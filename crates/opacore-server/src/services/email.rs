use crate::config::Config;
use crate::error::{AppError, AppResult};
use serde::Serialize;

#[derive(Serialize)]
struct ResendEmail {
    from: String,
    to: Vec<String>,
    subject: String,
    html: String,
}

pub async fn send_email(config: &Config, to: &str, subject: &str, html: &str) -> AppResult<()> {
    let api_key = match &config.resend_api_key {
        Some(key) => key,
        None => {
            tracing::warn!("RESEND_API_KEY not set, skipping email to {to}: {subject}");
            return Ok(());
        }
    };

    let client = reqwest::Client::new();
    let payload = ResendEmail {
        from: config.from_email.clone(),
        to: vec![to.to_string()],
        subject: subject.to_string(),
        html: html.to_string(),
    };

    let res = client
        .post("https://api.resend.com/emails")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to send email: {e}")))?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        tracing::error!("Resend API error: {body}");
        return Err(AppError::Internal(format!("Email send failed: {body}")));
    }

    tracing::info!("Email sent to {to}: {subject}");
    Ok(())
}

pub async fn send_verification_email(
    config: &Config,
    to: &str,
    name: &str,
    token: &str,
) -> AppResult<()> {
    let verify_url = format!("{}/verify?token={}", config.app_url, token);
    let subject = "Verify your Opacore account";
    let html = format!(
        r#"<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #1a1a1a;">Welcome to Opacore, {name}!</h2>
  <p>Please verify your email address by clicking the button below:</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="{verify_url}" style="display: inline-block; padding: 14px 28px; background: #f7931a; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Verify Email</a>
  </p>
  <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
  <p style="font-size: 14px; word-break: break-all; color: #666;">{verify_url}</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
  <p style="font-size: 12px; color: #999;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
</body>
</html>"#
    );
    send_email(config, to, subject, &html).await
}

pub async fn send_admin_notification(
    config: &Config,
    user_name: &str,
    user_email: &str,
) -> AppResult<()> {
    let admin_email = match &config.admin_email {
        Some(email) => email.clone(),
        None => {
            tracing::debug!("ADMIN_EMAIL not set, skipping admin notification");
            return Ok(());
        }
    };

    let subject = format!("New Opacore signup: {user_name}");
    let html = format!(
        r#"<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2>New User Registration</h2>
  <p><strong>Name:</strong> {user_name}</p>
  <p><strong>Email:</strong> {user_email}</p>
  <p><strong>Time:</strong> {}</p>
</body>
</html>"#,
        chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")
    );
    send_email(config, &admin_email, &subject, &html).await
}
