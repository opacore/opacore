'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fees as feesApi, prices as pricesApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@opacore/ui';
import { Zap, Clock, Gauge, TrendingDown } from 'lucide-react';

const TX_TYPES = [
  { label: 'P2TR (Taproot)', vbytes: 111 },
  { label: 'P2WPKH (Native SegWit)', vbytes: 141 },
  { label: 'P2SH-P2WPKH (Wrapped SegWit)', vbytes: 167 },
  { label: 'P2PKH (Legacy)', vbytes: 226 },
  { label: 'Custom', vbytes: null },
];

function satsToBtc(sats: number) {
  return sats / 1e8;
}

function feeCard(
  label: string,
  sublabel: string,
  rate: number,
  exampleSats: number,
  btcPrice: number | null,
  icon: React.ReactNode,
  highlight?: boolean,
) {
  const usdVal = btcPrice ? satsToBtc(exampleSats) * btcPrice : null;
  return (
    <Card key={label} className={highlight ? 'border-orange-300 bg-orange-50/50' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-base">{label}</CardTitle>
        </div>
        <CardDescription>{sublabel}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums">{rate} <span className="text-base font-normal text-muted-foreground">sat/vB</span></div>
        <div className="mt-1 text-sm text-muted-foreground">
          Example (141 vB): {exampleSats.toLocaleString()} sats
          {usdVal !== null && (
            <span className="ml-1 text-foreground font-medium">
              ≈ ${usdVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FeeEstimatorPage() {
  const [selectedType, setSelectedType] = useState(1); // default P2WPKH
  const [customVbytes, setCustomVbytes] = useState('');

  const { data: feeRates, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['fees-recommended'],
    queryFn: () => feesApi.recommended(),
    refetchInterval: 60_000,
  });

  const { data: currentPrice } = useQuery({
    queryKey: ['prices-current'],
    queryFn: () => pricesApi.current(),
    refetchInterval: 60_000,
  });

  const btcPrice = currentPrice?.price ?? null;

  const txType = TX_TYPES[selectedType] ?? TX_TYPES[1]!;
  const vbytes =
    txType.vbytes !== null
      ? txType.vbytes
      : parseInt(customVbytes, 10) || 0;

  function calcFee(rate: number) {
    return rate * vbytes;
  }

  function calcUsd(sats: number) {
    if (!btcPrice || !sats) return null;
    return satsToBtc(sats) * btcPrice;
  }

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fee Estimator</h1>
          <p className="text-muted-foreground">Live Bitcoin network fee rates from mempool.space</p>
        </div>
        {lastUpdated && (
          <p className="text-xs text-muted-foreground pt-1">Updated {lastUpdated} · refreshes every 60s</p>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Loading fee rates...</p>
        </div>
      ) : !feeRates ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Failed to load fee rates. Try refreshing.</p>
        </div>
      ) : (
        <>
          {/* Fee rate cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {feeCard(
              'Fastest',
              '~10 minutes',
              feeRates.fastestFee,
              feeRates.fastestFee * 141,
              btcPrice,
              <Zap className="h-4 w-4 text-orange-500" />,
              true,
            )}
            {feeCard(
              'Standard',
              '~30 minutes',
              feeRates.halfHourFee,
              feeRates.halfHourFee * 141,
              btcPrice,
              <Clock className="h-4 w-4 text-blue-500" />,
            )}
            {feeCard(
              'Economy',
              '~1 hour',
              feeRates.hourFee,
              feeRates.hourFee * 141,
              btcPrice,
              <Gauge className="h-4 w-4 text-green-500" />,
            )}
            {feeCard(
              'Low Priority',
              'No time guarantee',
              feeRates.economyFee,
              feeRates.economyFee * 141,
              btcPrice,
              <TrendingDown className="h-4 w-4 text-muted-foreground" />,
            )}
          </div>

          {/* Calculator */}
          <Card>
            <CardHeader>
              <CardTitle>Fee Calculator</CardTitle>
              <CardDescription>Estimate the fee for your transaction type</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Tx type selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Transaction type</label>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {TX_TYPES.map((t, i) => (
                    <button
                      key={t.label}
                      onClick={() => setSelectedType(i)}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        selectedType === i
                          ? 'border-orange-400 bg-orange-50 font-medium'
                          : 'border-border hover:bg-accent'
                      }`}
                    >
                      <span className="block">{t.label}</span>
                      {t.vbytes !== null && (
                        <span className="text-xs text-muted-foreground">{t.vbytes} vB</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom vbytes input */}
              {txType.vbytes === null && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Custom size (vBytes)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 200"
                    value={customVbytes}
                    onChange={(e) => setCustomVbytes(e.target.value)}
                    className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              )}

              {/* Results table */}
              {vbytes > 0 && (
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Priority</th>
                        <th className="px-4 py-2 text-left font-medium">Rate</th>
                        <th className="px-4 py-2 text-right font-medium">Fee (sats)</th>
                        <th className="px-4 py-2 text-right font-medium">Fee (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[
                        { label: 'Fastest (~10 min)', rate: feeRates.fastestFee },
                        { label: 'Standard (~30 min)', rate: feeRates.halfHourFee },
                        { label: 'Economy (~1 hr)', rate: feeRates.hourFee },
                        { label: 'Low Priority', rate: feeRates.economyFee },
                        { label: 'Minimum', rate: feeRates.minimumFee },
                      ].map(({ label, rate }) => {
                        const sats = calcFee(rate);
                        const usd = calcUsd(sats);
                        return (
                          <tr key={label} className="hover:bg-muted/30">
                            <td className="px-4 py-2 text-muted-foreground">{label}</td>
                            <td className="px-4 py-2 font-mono">{rate} sat/vB</td>
                            <td className="px-4 py-2 text-right font-mono">{sats.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right font-mono">
                              {usd !== null
                                ? `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Sizes are for single-input, single-output transactions. Multi-input/output transactions will be larger.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
