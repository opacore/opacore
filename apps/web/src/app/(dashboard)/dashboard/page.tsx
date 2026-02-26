'use client';

import { useQuery } from '@tanstack/react-query';
import { portfolios, prices, transactions as txApi } from '@/lib/api';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { RecentTransactions } from '@/components/dashboard/recent-transactions';

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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Your Bitcoin portfolio overview</p>
      </div>

      <StatsCards
        totalBtc={totalBtc}
        totalValue={totalValue}
        totalCostBasis={totalCostBasis}
        currentPrice={btcPrice}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentTransactions transactions={recentTxs ?? []} />
      </div>
    </div>
  );
}
