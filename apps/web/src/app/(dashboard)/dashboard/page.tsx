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
import { wallets as walletsApi } from '@/lib/api';
import { Bell, HardDrive, ArrowRight } from 'lucide-react';

import Link from 'next/link';

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

  const { data: walletList } = useQuery({
    queryKey: ['wallets', firstPortfolioId],
    queryFn: () => walletsApi.list(firstPortfolioId!),
    enabled: !!firstPortfolioId,
  });

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

  // No wallets yet — show onboarding prompt
  const hasWallets = walletList && walletList.length > 0;
  if (!portfoliosLoading && firstPortfolioId && !hasWallets && walletList !== undefined) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Your Bitcoin portfolio overview</p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted py-24 text-center">
          <div className="mb-4 rounded-full bg-muted p-4">
            <HardDrive className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">Connect your first wallet</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Import a watch-only wallet using an xpub, zpub, output descriptor, or single address to start tracking your Bitcoin.
          </p>
          <Link
            href="/wallets/import"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#F7931A] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#e8850f] transition-colors"
          >
            Import Wallet
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
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
        </div>
      </div>
    </div>
  );
}
