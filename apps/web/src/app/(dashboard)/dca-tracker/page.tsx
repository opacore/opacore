'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { portfolios as portfoliosApi, transactions as txApi, prices as pricesApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@opacore/ui';
import {
  ComposedChart,
  Area,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { Repeat, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { cn } from '@opacore/ui';

function satsToBtc(sats: number) {
  return sats / 1e8;
}

function formatUsd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatBtc(n: number) {
  return n.toFixed(8).replace(/\.?0+$/, '') + ' BTC';
}

function BuyDot(props: { cx?: number; cy?: number; payload?: { isBuy?: boolean } }) {
  const { cx, cy, payload } = props;
  if (!payload?.isBuy) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill="#F7931A"
      stroke="#fff"
      strokeWidth={1.5}
    />
  );
}

export default function DcaTrackerPage() {
  const { data: portfolioList } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });

  const portfolioId = portfolioList?.[0]?.id;

  const { data: manualBuys, isLoading: buyLoading } = useQuery({
    queryKey: ['transactions', portfolioId, 'buy'],
    queryFn: () => txApi.list({ portfolioId: portfolioId!, txType: 'buy', limit: 1000 }),
    enabled: !!portfolioId,
    refetchInterval: 15_000,
  });

  const { data: receives, isLoading: receiveLoading } = useQuery({
    queryKey: ['transactions', portfolioId, 'receive'],
    queryFn: () => txApi.list({ portfolioId: portfolioId!, txType: 'receive', limit: 1000 }),
    enabled: !!portfolioId,
    refetchInterval: 15_000,
  });

  const txLoading = buyLoading || receiveLoading;

  // Combine manual buys + wallet receives
  const buyTxs = useMemo(() => {
    const all = [...(manualBuys ?? []), ...(receives ?? [])];
    return all.sort((a, b) => new Date(a.transacted_at).getTime() - new Date(b.transacted_at).getTime());
  }, [manualBuys, receives]);

  // Detect transactions missing price data
  const unpricedCount = useMemo(
    () => buyTxs.filter((tx) => tx.price_usd === null).length,
    [buyTxs],
  );

  // Auto-trigger backfill once per portfolio load when unpriced transactions exist
  const backfillFiredRef = useRef(false);
  useEffect(() => {
    if (!portfolioId || backfillFiredRef.current) return;
    if (buyTxs.length > 0 && unpricedCount > 0) {
      backfillFiredRef.current = true;
      pricesApi.backfillPortfolio(portfolioId).catch(() => {/* silent — background task */});
    }
  }, [portfolioId, buyTxs.length, unpricedCount]);

  const { data: currentPrice } = useQuery({
    queryKey: ['prices', 'current'],
    queryFn: () => pricesApi.current(),
    refetchInterval: 60_000,
  });

  // Determine date range from first buy to today
  const firstBuyDate = useMemo(() => {
    if (!buyTxs?.length) return null;
    return buyTxs[0]?.transacted_at.slice(0, 10) ?? null;
  }, [buyTxs]);

  const today = new Date().toISOString().slice(0, 10);
  const chartStart = firstBuyDate ?? new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);

  const { data: priceHistory, isLoading: pricesLoading } = useQuery({
    queryKey: ['prices', 'range', chartStart, today],
    queryFn: () => pricesApi.range(chartStart, today),
    enabled: !!firstBuyDate,
  });

  // Compute DCA stats — only accurate when all transactions have price data
  const stats = useMemo(() => {
    if (!buyTxs?.length) return null;

    let totalSats = 0;
    let totalInvestedUsd = 0;
    let pricedCount = 0;

    for (const tx of buyTxs) {
      totalSats += tx.amount_sat;
      if (tx.price_usd) {
        totalInvestedUsd += satsToBtc(tx.amount_sat) * tx.price_usd;
        pricedCount++;
      } else if (tx.fiat_amount) {
        totalInvestedUsd += tx.fiat_amount;
        pricedCount++;
      }
    }

    const totalBtc = satsToBtc(totalSats);
    const avgBuyPrice = totalBtc > 0 && totalInvestedUsd > 0 ? totalInvestedUsd / totalBtc : 0;
    const currentValue = currentPrice ? totalBtc * currentPrice.price : null;
    const pnl = currentValue !== null && totalInvestedUsd > 0 ? currentValue - totalInvestedUsd : null;
    const pnlPct = pnl !== null && totalInvestedUsd > 0 ? (pnl / totalInvestedUsd) * 100 : null;

    return { totalBtc, totalInvestedUsd, avgBuyPrice, currentValue, pnl, pnlPct, count: buyTxs.length, pricedCount };
  }, [buyTxs, currentPrice]);

  // Build chart data: price history + scatter buy points
  const chartData = useMemo(() => {
    if (!priceHistory?.length) return [];

    const buyByDate: Record<string, { totalSats: number; totalUsd: number; count: number }> = {};
    for (const tx of buyTxs ?? []) {
      const d = tx.transacted_at.slice(0, 10);
      if (!buyByDate[d]) buyByDate[d] = { totalSats: 0, totalUsd: 0, count: 0 };
      buyByDate[d].totalSats += tx.amount_sat;
      if (tx.price_usd) buyByDate[d].totalUsd += satsToBtc(tx.amount_sat) * tx.price_usd;
      buyByDate[d].count += 1;
    }

    return priceHistory.map((p) => {
      const buy = buyByDate[p.date];
      return {
        date: p.date,
        price: p.price,
        ...(buy
          ? {
              isBuy: true,
              buyPrice: p.price,
              buyBtc: satsToBtc(buy.totalSats),
              buyUsd: buy.totalUsd,
              buyCount: buy.count,
            }
          : {}),
      };
    });
  }, [priceHistory, buyTxs]);

  const isLoading = txLoading || pricesLoading;
  const isSyncingPrices = !txLoading && unpricedCount > 0;
  const statsReady = stats !== null && stats.pricedCount === stats.count;
  const isProfit = (stats?.pnl ?? 0) >= 0;

  // Sorted purchases for the table (newest first)
  const sortedBuys = useMemo(
    () => [...(buyTxs ?? [])].sort((a, b) => new Date(b.transacted_at).getTime() - new Date(a.transacted_at).getTime()),
    [buyTxs],
  );

  const minPrice = chartData.length > 0
    ? Math.floor(Math.min(...chartData.map((d) => d.price)) * 0.99)
    : 0;
  const maxPrice = chartData.length > 0
    ? Math.ceil(Math.max(...chartData.map((d) => d.price)) * 1.01)
    : 100000;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Repeat className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">DCA Tracker</h1>
          <p className="text-sm text-muted-foreground">
            Your Bitcoin dollar-cost averaging performance
          </p>
        </div>
      </div>

      {/* Price sync banner */}
      {isSyncingPrices && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
          <span>
            Syncing price data for {unpricedCount} transaction{unpricedCount !== 1 ? 's' : ''}
            &mdash; stats will update automatically.
          </span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !stats && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No transactions found. Connect a wallet and sync to get started.
          </CardContent>
        </Card>
      )}

      {stats && (
        <>
          {/* Stats cards — skeleton while prices are syncing */}
          {statsReady ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Invested</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatUsd(stats.totalInvestedUsd)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{stats.count} transaction{stats.count !== 1 ? 's' : ''}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Avg Buy Price</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatUsd(stats.avgBuyPrice)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{formatBtc(stats.totalBtc)} accumulated</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Value</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats.currentValue !== null ? formatUsd(stats.currentValue) : '—'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {currentPrice ? `@ ${formatUsd(currentPrice.price)}` : ''}
                  </div>
                </CardContent>
              </Card>

              <Card className={cn('border-2', isProfit ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50')}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Unrealized P&L</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={cn('flex items-center gap-1.5 text-2xl font-bold', isProfit ? 'text-green-600' : 'text-red-600')}>
                    {isProfit ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    {stats.pnl !== null ? formatUsd(Math.abs(stats.pnl)) : '—'}
                  </div>
                  <div className={cn('text-xs mt-1 font-medium', isProfit ? 'text-green-600' : 'text-red-600')}>
                    {stats.pnlPct !== null ? `${isProfit ? '+' : '-'}${Math.abs(stats.pnlPct).toFixed(1)}%` : ''}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <div className="h-8 w-24 animate-pulse rounded bg-muted mb-2" />
                    <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Price vs Your Purchases</CardTitle>
              <p className="text-xs text-muted-foreground">
                Orange dots = your buys · Dashed line = your avg cost
                {statsReady ? ` (${formatUsd(stats.avgBuyPrice)})` : ''}
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  Loading chart...
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  No price data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={chartData}>
                    <defs>
                      <linearGradient id="dcaPriceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(36, 93%, 53%)" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="hsl(36, 93%, 53%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[minPrice, maxPrice]}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={50}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        return (
                          <div className="rounded-lg border bg-card p-3 text-xs shadow-sm">
                            <p className="font-medium mb-1">{new Date(label).toLocaleDateString()}</p>
                            <p className="text-muted-foreground">Price: <span className="font-medium text-foreground">{formatUsd(d.price)}</span></p>
                            {d.isBuy && (
                              <>
                                <div className="mt-1.5 border-t pt-1.5">
                                  <p className="text-[#F7931A] font-medium">You bought</p>
                                  <p className="text-muted-foreground">Amount: <span className="font-medium text-foreground">{d.buyBtc.toFixed(6)} BTC</span></p>
                                  {d.buyUsd > 0 && <p className="text-muted-foreground">Cost: <span className="font-medium text-foreground">{formatUsd(d.buyUsd)}</span></p>}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      }}
                    />
                    {statsReady && (
                      <ReferenceLine
                        y={stats.avgBuyPrice}
                        stroke="#F7931A"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="hsl(36, 93%, 53%)"
                      strokeWidth={2}
                      fill="url(#dcaPriceGradient)"
                      dot={false}
                      activeDot={false}
                      legendType="none"
                    />
                    <Scatter
                      dataKey="buyPrice"
                      shape={<BuyDot />}
                      legendType="none"
                    />
                    <Legend
                      content={() => null}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Purchase history table */}
          {sortedBuys.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Accumulation History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-hidden rounded-b-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Date</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Amount</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">BTC Price</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sortedBuys.map((tx) => {
                        const btc = satsToBtc(tx.amount_sat);
                        const cost = tx.price_usd ? btc * tx.price_usd : tx.fiat_amount;
                        return (
                          <tr key={tx.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 text-muted-foreground">
                              {new Date(tx.transacted_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {btc.toFixed(6)} BTC
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              {tx.price_usd ? formatUsd(tx.price_usd) : (
                                <span className="text-amber-500 text-xs">syncing…</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              {cost ? formatUsd(cost) : (
                                <span className="text-amber-500 text-xs">syncing…</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {statsReady && (
                      <tfoot className="border-t bg-muted/20">
                        <tr>
                          <td className="px-4 py-2.5 text-sm font-medium">Total</td>
                          <td className="px-4 py-2.5 text-right font-mono font-medium">{formatBtc(stats.totalBtc)}</td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">avg {formatUsd(stats.avgBuyPrice)}</td>
                          <td className="px-4 py-2.5 text-right font-bold">{formatUsd(stats.totalInvestedUsd)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
