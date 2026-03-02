'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { portfolios as portfoliosApi, tax as taxApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@opacore/ui';
import { Button } from '@opacore/ui';
import { Calculator, TrendingUp, TrendingDown, Download, AlertCircle } from 'lucide-react';
import { cn } from '@opacore/ui';

const CURRENT_YEAR = new Date().getFullYear();
// Offer current year and up to 5 prior years
const AVAILABLE_YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

const METHODS = [
  { value: 'fifo', label: 'FIFO', description: 'First In, First Out' },
  { value: 'lifo', label: 'LIFO', description: 'Last In, First Out' },
  { value: 'hifo', label: 'HIFO', description: 'Highest In, First Out' },
] as const;

function formatUsd(n: number, signed = false) {
  const abs = Math.abs(n).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
  if (!signed) return abs;
  return n >= 0 ? `+${abs}` : `-${abs}`;
}

export default function TaxReportsPage() {
  const [year, setYear] = useState(CURRENT_YEAR - 1); // Default to last tax year
  const [method, setMethod] = useState<'fifo' | 'lifo' | 'hifo'>('fifo');

  const { data: portfolioList } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });

  const portfolioId = portfolioList?.[0]?.id;

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['tax-report', portfolioId, year, method],
    queryFn: () => taxApi.report(portfolioId!, year, method),
    enabled: !!portfolioId,
  });

  const csvUrl = portfolioId
    ? taxApi.csvUrl(portfolioId, year, method)
    : null;

  const hasGains = report && report.disposition_count > 0;
  const netGain = report ? report.total_gains : 0;
  const isNetProfit = netGain >= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Calculator className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Tax Reports</h1>
          <p className="text-sm text-muted-foreground">
            Capital gains and losses for Form 8949
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Year picker */}
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          {AVAILABLE_YEARS.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                year === y
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Method picker */}
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          {METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMethod(m.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                method === m.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              title={m.description}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Download CSV */}
        {csvUrl && hasGains && (
          <a href={csvUrl} download>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Form 8949 CSV
            </Button>
          </a>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          Calculating {year} tax report…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Failed to generate report. Make sure your sell transactions are classified and prices are synced.
        </div>
      )}

      {/* No disposals */}
      {!isLoading && !error && report && !hasGains && (
        <Card>
          <CardContent className="py-16 text-center">
            <Calculator className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No taxable events in {year}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No Bitcoin was sold or disposed of during this tax year.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Report */}
      {!isLoading && !error && report && hasGains && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Short-Term Gains
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn(
                  'text-2xl font-bold',
                  report.short_term_gains >= 0 ? 'text-green-600' : 'text-red-600',
                )}>
                  {formatUsd(report.short_term_gains)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Held ≤ 1 year</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Long-Term Gains
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn(
                  'text-2xl font-bold',
                  report.long_term_gains >= 0 ? 'text-green-600' : 'text-red-600',
                )}>
                  {formatUsd(report.long_term_gains)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Held &gt; 1 year</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Proceeds
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatUsd(report.total_proceeds)}</div>
                <div className="text-xs text-muted-foreground mt-1">{report.disposition_count} disposal{report.disposition_count !== 1 ? 's' : ''}</div>
              </CardContent>
            </Card>

            <Card className={cn(
              'border-2',
              isNetProfit ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
            )}>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Net Gain / Loss
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn(
                  'flex items-center gap-1.5 text-2xl font-bold',
                  isNetProfit ? 'text-green-600' : 'text-red-600',
                )}>
                  {isNetProfit
                    ? <TrendingUp className="h-5 w-5" />
                    : <TrendingDown className="h-5 w-5" />
                  }
                  {formatUsd(Math.abs(netGain))}
                </div>
                <div className={cn(
                  'text-xs mt-1 font-medium',
                  isNetProfit ? 'text-green-600' : 'text-red-600',
                )}>
                  {method.toUpperCase()} method
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Dispositions table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Disposals — {year}</CardTitle>
              {csvUrl && (
                <a href={csvUrl} download>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Download className="h-4 w-4" />
                    Download Form 8949
                  </Button>
                </a>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Description</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Acquired</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Sold</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Proceeds</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Cost Basis</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Gain / Loss</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Term</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {report.dispositions.map((d, i) => {
                      const isGain = d.gain_or_loss >= 0;
                      const isLongTerm = d.holding_period === 'Long-term';
                      return (
                        <tr key={i} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {d.description}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {d.date_acquired === 'Various' ? 'Various' : new Date(d.date_acquired).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(d.date_sold).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatUsd(d.proceeds)}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">
                            {formatUsd(d.cost_basis)}
                          </td>
                          <td className={cn(
                            'px-4 py-3 text-right font-medium',
                            isGain ? 'text-green-600' : 'text-red-600',
                          )}>
                            {formatUsd(d.gain_or_loss, true)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-medium',
                              isLongTerm
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-orange-100 text-orange-700',
                            )}>
                              {isLongTerm ? 'Long' : 'Short'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t bg-muted/20">
                    <tr>
                      <td colSpan={3} className="px-4 py-2.5 text-sm font-medium">Total</td>
                      <td className="px-4 py-2.5 text-right font-medium">{formatUsd(report.total_proceeds)}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-muted-foreground">{formatUsd(report.total_cost_basis)}</td>
                      <td className={cn(
                        'px-4 py-2.5 text-right font-bold',
                        isNetProfit ? 'text-green-600' : 'text-red-600',
                      )}>
                        {formatUsd(netGain, true)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Method note */}
          <p className="text-xs text-muted-foreground">
            Cost basis calculated using {method.toUpperCase()} ({METHODS.find(m => m.value === method)?.description}).
            This report is for informational purposes. Consult a tax professional for filing advice.
          </p>
        </>
      )}
    </div>
  );
}
