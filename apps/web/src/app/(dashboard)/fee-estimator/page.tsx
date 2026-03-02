'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fees as feesApi, prices as pricesApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@opacore/ui';
import { Input } from '@opacore/ui';
import { Label } from '@opacore/ui';
import { Gauge, Zap, Clock, Hourglass, Snail, RefreshCw } from 'lucide-react';
import { cn } from '@opacore/ui';

const TX_TYPES = [
  { label: 'P2TR (Taproot)', vbytes: 111 },
  { label: 'P2WPKH (SegWit)', vbytes: 141 },
  { label: 'P2PKH (Legacy)', vbytes: 226 },
  { label: 'Custom', vbytes: null },
];

const FEE_TIERS = [
  {
    key: 'fastestFee' as const,
    label: 'Fastest',
    time: '~10 min',
    icon: Zap,
    color: 'text-orange-500',
    bg: 'bg-orange-50 border-orange-200',
  },
  {
    key: 'halfHourFee' as const,
    label: 'Standard',
    time: '~30 min',
    icon: Clock,
    color: 'text-blue-500',
    bg: 'bg-blue-50 border-blue-200',
  },
  {
    key: 'hourFee' as const,
    label: 'Economy',
    time: '~60 min',
    icon: Hourglass,
    color: 'text-green-500',
    bg: 'bg-green-50 border-green-200',
  },
  {
    key: 'economyFee' as const,
    label: 'Low Priority',
    time: 'No rush',
    icon: Snail,
    color: 'text-muted-foreground',
    bg: 'bg-muted/30 border-border',
  },
];

function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(4)} BTC`;
  return `${sats.toLocaleString()} sats`;
}

function formatUsd(usd: number): string {
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

export default function FeeEstimatorPage() {
  const [selectedTxType, setSelectedTxType] = useState(0);
  const [customVbytes, setCustomVbytes] = useState('');

  const { data: feeRates, isLoading: feesLoading, dataUpdatedAt } = useQuery({
    queryKey: ['fees', 'recommended'],
    queryFn: () => feesApi.recommended(),
    refetchInterval: 60_000,
  });

  const { data: btcPrice } = useQuery({
    queryKey: ['prices', 'current'],
    queryFn: () => pricesApi.current(),
    refetchInterval: 60_000,
  });

  const selectedType = TX_TYPES[selectedTxType];
  const vbytes = selectedType?.vbytes ?? (parseInt(customVbytes, 10) || 0);

  const calcFee = (feeRate: number) => Math.ceil(feeRate * vbytes);
  const calcUsd = (sats: number) =>
    btcPrice ? (sats / 1e8) * btcPrice.price : null;

  const updatedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gauge className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold">Fee Estimator</h1>
            <p className="text-sm text-muted-foreground">
              Live Bitcoin network fee rates via mempool.space
            </p>
          </div>
        </div>
        {updatedAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            Updated {updatedAt}
          </div>
        )}
      </div>

      {/* Fee Rate Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {FEE_TIERS.map((tier) => {
          const rate = feeRates?.[tier.key];
          const feeSats = rate && vbytes ? calcFee(rate) : null;
          const feeUsd = feeSats ? calcUsd(feeSats) : null;

          return (
            <Card key={tier.key} className={cn('border', tier.bg)}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <tier.icon className={cn('h-4 w-4', tier.color)} />
                  {tier.label}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{tier.time}</p>
              </CardHeader>
              <CardContent>
                {feesLoading ? (
                  <div className="h-8 w-20 animate-pulse rounded bg-muted" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {rate ?? '—'}{' '}
                      <span className="text-sm font-normal text-muted-foreground">sat/vB</span>
                    </div>
                    {feeSats !== null && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatSats(feeSats)}
                        {feeUsd !== null && ` · ${formatUsd(feeUsd)}`}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Calculator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fee Calculator</CardTitle>
          <p className="text-sm text-muted-foreground">
            Estimate the total fee for your transaction
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tx type selector */}
          <div className="space-y-2">
            <Label>Transaction Type</Label>
            <div className="flex flex-wrap gap-2">
              {TX_TYPES.map((type, i) => (
                <button
                  key={type.label}
                  onClick={() => setSelectedTxType(i)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                    selectedTxType === i
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-accent',
                  )}
                >
                  {type.label}
                  {type.vbytes && (
                    <span className="ml-1.5 text-xs opacity-70">{type.vbytes} vB</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Custom vbytes input */}
          {selectedType?.vbytes === null && (
            <div className="space-y-2">
              <Label htmlFor="custom-vbytes">Transaction Size (vBytes)</Label>
              <Input
                id="custom-vbytes"
                type="number"
                min="1"
                placeholder="e.g. 200"
                value={customVbytes}
                onChange={(e) => setCustomVbytes(e.target.value)}
                className="max-w-xs"
              />
            </div>
          )}

          {/* Fee breakdown table */}
          {vbytes > 0 && feeRates && (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Priority</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Rate</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Fee (sats)</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Fee (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {FEE_TIERS.map((tier) => {
                    const rate = feeRates[tier.key];
                    const feeSats = calcFee(rate);
                    const feeUsd = calcUsd(feeSats);
                    return (
                      <tr key={tier.key} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <tier.icon className={cn('h-3.5 w-3.5', tier.color)} />
                            <span className="font-medium">{tier.label}</span>
                            <span className="text-xs text-muted-foreground">{tier.time}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {rate} sat/vB
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {feeSats.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {feeUsd !== null ? formatUsd(feeUsd) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
                Based on {vbytes} vB transaction size
                {btcPrice && ` · BTC price: $${btcPrice.price.toLocaleString()}`}
              </div>
            </div>
          )}

          {vbytes === 0 && selectedType?.vbytes === null && (
            <p className="text-sm text-muted-foreground">Enter a transaction size above to see fee estimates.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
