use crate::config::Config;
use crate::db::DbPool;
use crate::services::email::send_email;
use crate::services::prices::fetch_current_price;

// ── Email templates ────────────────────────────────────────────────────────────

fn price_alert_html(
    alert_type: &str,
    threshold_usd: f64,
    current_price: f64,
    label: Option<&str>,
    app_url: &str,
) -> String {
    let direction = if alert_type == "price_above" { "above" } else { "below" };
    let alert_name = label.unwrap_or("your price alert");
    format!(
        r#"<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #1a1a1a;">BTC Price Alert Triggered</h2>
  <p>BTC has gone <strong>{direction} ${threshold_usd:.0}</strong> &mdash; {alert_name}.</p>
  <div style="background: #f9f9f9; border-left: 4px solid #f7931a; padding: 16px; margin: 20px 0; border-radius: 4px;">
    <p style="margin: 0; font-size: 24px; font-weight: bold; color: #f7931a;">${current_price:.0} USD</p>
    <p style="margin: 4px 0 0; color: #666; font-size: 14px;">Current BTC price</p>
  </div>
  <p style="text-align: center; margin: 30px 0;">
    <a href="{app_url}/alerts" style="display: inline-block; padding: 12px 24px; background: #f7931a; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">Manage Alerts</a>
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="font-size: 12px; color: #999;">This alert has been deactivated. Re-enable it any time in your Opacore alerts settings.</p>
</body>
</html>"#
    )
}

fn balance_alert_html(
    wallet_label: &str,
    amount_sat: i64,
    txid: &str,
    label: Option<&str>,
    app_url: &str,
) -> String {
    let btc = amount_sat as f64 / 1e8;
    let alert_name = label.unwrap_or("balance alert");
    let txid_display = if txid.len() > 16 {
        format!("{}...", &txid[..16])
    } else {
        txid.to_string()
    };
    format!(
        r#"<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #1a1a1a;">Incoming Bitcoin Transaction</h2>
  <p>Your wallet <strong>{wallet_label}</strong> received a new transaction ({alert_name}).</p>
  <div style="background: #f9f9f9; border-left: 4px solid #22c55e; padding: 16px; margin: 20px 0; border-radius: 4px;">
    <p style="margin: 0; font-size: 24px; font-weight: bold; color: #22c55e;">+{btc:.8} BTC</p>
    <p style="margin: 4px 0 0; color: #666; font-size: 14px;">TXID: {txid_display}</p>
  </div>
  <p style="text-align: center; margin: 30px 0;">
    <a href="{app_url}/wallets" style="display: inline-block; padding: 12px 24px; background: #f7931a; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">View Wallets</a>
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="font-size: 12px; color: #999;">You are receiving this because you set up a balance alert in Opacore.</p>
</body>
</html>"#
    )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

fn get_wallet_label(pool: &DbPool, wallet_id: &str) -> Option<String> {
    let conn = pool.get().ok()?;
    conn.query_row(
        "SELECT label FROM wallets WHERE id = ?1",
        rusqlite::params![wallet_id],
        |row| row.get(0),
    )
    .ok()
}

// ── Price alert checker ────────────────────────────────────────────────────────

async fn check_price_alerts(pool: &DbPool, config: &Config) {
    let current_price = match fetch_current_price(&config.coingecko_api_url, "usd").await {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!("Alert checker: failed to fetch BTC price: {e}");
            return;
        }
    };

    tracing::debug!("Alert checker: BTC price = ${current_price:.0}");

    // Collect active price alerts with user email — drop connection before any await
    let alerts: Vec<(String, String, String, f64, Option<String>)> = {
        let conn = match pool.get() {
            Ok(c) => c,
            Err(e) => {
                tracing::error!("Alert checker (price): db connection failed: {e}");
                return;
            }
        };
        let mut stmt = match conn.prepare(
            "SELECT a.id, a.alert_type, u.email, a.threshold_usd, a.label
             FROM alerts a
             JOIN users u ON u.id = a.user_id
             WHERE a.is_active = 1
               AND a.alert_type IN ('price_above', 'price_below')
               AND a.threshold_usd IS NOT NULL",
        ) {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("Alert checker (price): prepare failed: {e}");
                return;
            }
        };
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, f64>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        });
        match rows {
            Ok(r) => r.filter_map(|r| r.ok()).collect(),
            Err(e) => {
                tracing::error!("Alert checker (price): query failed: {e}");
                return;
            }
        }
    }; // connection dropped here

    if alerts.is_empty() {
        return;
    }

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

    for (alert_id, alert_type, email, threshold, label) in &alerts {
        let triggered = match alert_type.as_str() {
            "price_above" => current_price >= *threshold,
            "price_below" => current_price <= *threshold,
            _ => false,
        };

        if !triggered {
            continue;
        }

        tracing::info!(
            "Price alert {alert_id} triggered ({alert_type} ${threshold:.0}, current ${current_price:.0})"
        );

        // Deactivate BEFORE sending — avoids double-send on crash
        {
            let conn = match pool.get() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!("Alert checker (price): deactivate db error: {e}");
                    continue;
                }
            };
            if let Err(e) = conn.execute(
                "UPDATE alerts SET is_active = 0, last_triggered_at = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![now, now, alert_id],
            ) {
                tracing::error!("Alert checker (price): deactivate failed: {e}");
                continue;
            }
        } // connection dropped here

        let subject = format!(
            "BTC price alert: {} ${:.0}",
            alert_type.replace('_', " "),
            threshold
        );
        let html = price_alert_html(alert_type, *threshold, current_price, label.as_deref(), &config.app_url);
        let config_clone = config.clone();
        let email_clone = email.clone();
        tokio::spawn(async move {
            if let Err(e) = send_email(&config_clone, &email_clone, &subject, &html).await {
                tracing::warn!("Price alert email to {email_clone} failed: {e}");
            }
        });

        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }
}

// ── Balance alert checker ──────────────────────────────────────────────────────

async fn check_balance_alerts(pool: &DbPool, config: &Config) {
    // Collect active balance_change alerts — drop connection before any await
    // Returns: (id, email, wallet_id, portfolio_id, last_triggered_at, label)
    let alerts: Vec<(String, String, Option<String>, Option<String>, Option<String>, Option<String>)> = {
        let conn = match pool.get() {
            Ok(c) => c,
            Err(e) => {
                tracing::error!("Alert checker (balance): db connection failed: {e}");
                return;
            }
        };
        let mut stmt = match conn.prepare(
            "SELECT a.id, u.email, a.wallet_id, a.portfolio_id, a.last_triggered_at, a.label
             FROM alerts a
             JOIN users u ON u.id = a.user_id
             WHERE a.is_active = 1 AND a.alert_type = 'balance_change'",
        ) {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("Alert checker (balance): prepare failed: {e}");
                return;
            }
        };
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        });
        match rows {
            Ok(r) => r.filter_map(|r| r.ok()).collect(),
            Err(e) => {
                tracing::error!("Alert checker (balance): query failed: {e}");
                return;
            }
        }
    }; // connection dropped here

    if alerts.is_empty() {
        return;
    }

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

    for (alert_id, email, wallet_id, portfolio_id, last_triggered_at, label) in &alerts {
        let since = last_triggered_at.as_deref().unwrap_or("1970-01-01T00:00:00.000Z");

        // Find new incoming transactions since last check — drop connection before any await
        let new_txs: Vec<(String, i64, String)> = {
            let conn = match pool.get() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!("Alert checker (balance): tx query db error: {e}");
                    continue;
                }
            };

            let (sql, params_vec): (String, Vec<String>) = if let Some(ref wid) = wallet_id {
                (
                    "SELECT id, amount_sat, COALESCE(txid, id) FROM transactions
                     WHERE wallet_id = ?1
                       AND tx_type IN ('receive', 'buy')
                       AND amount_sat > 0
                       AND created_at > ?2
                     ORDER BY created_at ASC
                     LIMIT 10"
                        .to_string(),
                    vec![wid.clone(), since.to_string()],
                )
            } else if let Some(ref pid) = portfolio_id {
                (
                    "SELECT id, amount_sat, COALESCE(txid, id) FROM transactions
                     WHERE portfolio_id = ?1
                       AND tx_type IN ('receive', 'buy')
                       AND amount_sat > 0
                       AND created_at > ?2
                     ORDER BY created_at ASC
                     LIMIT 10"
                        .to_string(),
                    vec![pid.clone(), since.to_string()],
                )
            } else {
                continue; // malformed alert — skip
            };

            let mut stmt = match conn.prepare(&sql) {
                Ok(s) => s,
                Err(e) => {
                    tracing::error!("Alert checker (balance): tx prepare failed: {e}");
                    continue;
                }
            };

            let rows = stmt.query_map(rusqlite::params_from_iter(params_vec.iter()), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                ))
            });

            match rows {
                Ok(r) => r.filter_map(|r| r.ok()).collect(),
                Err(e) => {
                    tracing::error!("Alert checker (balance): tx query failed: {e}");
                    continue;
                }
            }
        }; // connection dropped here

        if new_txs.is_empty() {
            continue;
        }

        tracing::info!(
            "Balance alert {alert_id}: {} new tx(s) found since {since}",
            new_txs.len()
        );

        // Update last_triggered_at BEFORE sending emails
        {
            let conn = match pool.get() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!("Alert checker (balance): update db error: {e}");
                    continue;
                }
            };
            if let Err(e) = conn.execute(
                "UPDATE alerts SET last_triggered_at = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![now, now, alert_id],
            ) {
                tracing::error!("Alert checker (balance): update failed: {e}");
                continue;
            }
        } // connection dropped here

        let wallet_label = wallet_id
            .as_deref()
            .and_then(|wid| get_wallet_label(pool, wid))
            .unwrap_or_else(|| "your wallet".to_string());

        for (_, amount_sat, txid) in &new_txs {
            let subject = format!("+{:.8} BTC received", *amount_sat as f64 / 1e8);
            let html = balance_alert_html(
                &wallet_label,
                *amount_sat,
                txid,
                label.as_deref(),
                &config.app_url,
            );
            let config_clone = config.clone();
            let email_clone = email.clone();
            tokio::spawn(async move {
                if let Err(e) = send_email(&config_clone, &email_clone, &subject, &html).await {
                    tracing::warn!("Balance alert email to {email_clone} failed: {e}");
                }
            });

            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
        }
    }
}

// ── Background runner ──────────────────────────────────────────────────────────

pub async fn run_alert_checker(pool: DbPool, config: Config) {
    tracing::info!("Alert checker background task started (interval: 5 minutes)");

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;

        check_price_alerts(&pool, &config).await;
        check_balance_alerts(&pool, &config).await;
    }
}
