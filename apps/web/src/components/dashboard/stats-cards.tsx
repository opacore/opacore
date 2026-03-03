'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@opacore/ui';
import { Bitcoin, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

interface StatsCardsProps {
  totalBtc: string | undefined;
  totalValue: string | undefined;
  totalCostBasis: string | undefined;
  currentPrice: number;
}

export function StatsCards({ totalBtc, totalValue, totalCostBasis, currentPrice }: StatsCardsProps) {
  const loading = totalBtc === undefined;
  const btcNum = parseFloat(totalBtc ?? '0');
  const valueNum = parseFloat(totalValue ?? '0');
  const costBasisNum = parseFloat(totalCostBasis ?? '0');
  const gainLoss = valueNum - costBasisNum;
  const gainLossPercent = costBasisNum > 0 ? ((gainLoss / costBasisNum) * 100).toFixed(2) : '0.00';
  const isPositive = gainLoss >= 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Bitcoin</CardTitle>
          <Bitcoin className="h-4 w-4 text-[hsl(var(--bitcoin))]" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {loading ? '—' : btcNum.toFixed(8)}
          </div>
          <p className="text-xs text-muted-foreground">
            {loading ? '' : `${(btcNum * 100_000_000).toLocaleString()} sats`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {loading ? '—' : `$${valueNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          </div>
          <p className="text-xs text-muted-foreground">
            BTC @ ${currentPrice.toLocaleString()}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Cost Basis</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {loading ? '—' : `$${costBasisNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          </div>
          <p className="text-xs text-muted-foreground">Total invested</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Gain / Loss</CardTitle>
          {isPositive ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${loading ? '' : isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {loading ? '—' : `${isPositive ? '+' : ''}$${gainLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          </div>
          <p className={`text-xs ${loading ? '' : isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {loading ? '' : `${isPositive ? '+' : ''}${gainLossPercent}%`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
