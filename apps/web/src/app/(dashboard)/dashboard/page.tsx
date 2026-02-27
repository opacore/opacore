'use client';

import { useQuery } from '@tanstack/react-query';
import { portfolios, prices, transactions as txApi } from '@/lib/api';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';
import { PriceChart } from '@/components/dashboard/price-chart';
import { WalletOverview } from '@/components/dashboard/wallet-overview';
import { TransactionActivity } from '@/components/dashboard/transaction-activity';
import { TaxSummary } from '@/components/dashboard/tax-summary';
import { NetworkStatus } from '@/components/dashboard/network-status';
import { UtxoDistribution } from '@/components/dashboard/utxo-distribution';
import { PlaceholderCard } from '@/components/dashboard/placeholder-card';
import { Bell, Repeat } from 'lucide-react';

export default function DashboardPage() {
  const { data: portfolioList, isLoading: portfoliosLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfolios.list(),
  });

  const { data: currentPrice } = useQuery({
    queryKey: ['prices', 'current'],
    queryFn: () => prices.current('usd'),
  });

  const firstPortfolioId = portfolioList?.[0]?.id;

  const { data: summary } = useQuery({
    queryKey: ['portfolio-summary', firstPortfolioId],
    queryFn: () => portfolios.summary(firstPortfolioId!),
    enabled: !!firstPortfolioId,
  });

  const { data: recentTxs } = useQuery({
    queryKey: ['transactions', firstPortfolioId, 'recent'],
    queryFn: () => txApi.list({ portfolioId: firstPortfolioId!, limit: 5 }),
    enabled: !!firstPortfolioId,
  });

  const btcPrice = currentPrice?.price ?? 0;
  const totalBtcSat = summary?.total_balance_sat ?? 0;
  const totalBtc = (totalBtcSat / 1e8).toFixed(8);
  const totalValue = summary?.current_value_usd?.toFixed(2) ?? '0.00';
  const totalCostBasis = summary?.total_cost_basis_usd?.toFixed(2) ?? '0.00';

  if (portfoliosLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Your Bitcoin portfolio overview</p>
        </div>
        {btcPrice > 0 && (
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Bitcoin Price</p>
            <p className="text-3xl font-bold tracking-tight">
              ${btcPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        )}
      </div>

      {/* Row 1: Stats Cards */}
      <StatsCards
        totalBtc={totalBtc}
        totalValue={totalValue}
        totalCostBasis={totalCostBasis}
        currentPrice={btcPrice}
      />

      {/* Row 2: Price Chart (2 cols) + Wallet Overview (1 col) */}
      <div className="grid gap-6 lg:grid-cols-3">
        <PriceChart />
        <WalletOverview portfolioId={firstPortfolioId} />
      </div>

      {/* Row 3: Transaction Activity + Tax Summary */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TransactionActivity portfolioId={firstPortfolioId} />
        <TaxSummary portfolioId={firstPortfolioId} />
      </div>

      {/* Row 4: Recent Transactions + UTXO Distribution + Network/Placeholders */}
      <div className="grid gap-6 lg:grid-cols-3">
        <RecentTransactions transactions={recentTxs ?? []} />
        <UtxoDistribution portfolioId={firstPortfolioId} />
        <div className="space-y-6">
          <NetworkStatus />
          <PlaceholderCard
            title="Alerts"
            description="Coming soon"
            icon={Bell}
          />
          <PlaceholderCard
            title="DCA Tracker"
            description="Coming soon"
            icon={Repeat}
          />
        </div>
      </div>
    </div>
  );
}
