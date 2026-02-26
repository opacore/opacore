'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@opacore/ui';
import { Bitcoin, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

interface StatsCardsProps {
  totalBtc: string;
  totalValue: string;
  totalCostBasis: string;
  currentPrice: number;
}

export function StatsCards({ totalBtc, totalValue, totalCostBasis, currentPrice }: StatsCardsProps) {
  const btcNum = parseFloat(totalBtc);
  const valueNum = parseFloat(totalValue);
  const costBasisNum = parseFloat(totalCostBasis);
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
          <div className="text-2xl font-bold">{parseFloat(totalBtc).toFixed(8)}</div>
          <p className="text-xs text-muted-foreground">
            {(btcNum * 100_000_000).toLocaleString()} sats
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
            ${valueNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
            ${costBasisNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
          <div className={`text-2xl font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? '+' : ''}${gainLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <p className={`text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? '+' : ''}{gainLossPercent}%
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
