'use client';

import { useQuery } from '@tanstack/react-query';
import { tax } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@opacore/ui';
import { Calculator, Download } from 'lucide-react';

export function TaxSummary({ portfolioId }: { portfolioId: string | undefined }) {
  const currentYear = new Date().getFullYear();

  const { data: report, isLoading, isError } = useQuery({
    queryKey: ['tax-report', portfolioId, currentYear],
    queryFn: () => tax.report(portfolioId!, currentYear),
    enabled: !!portfolioId,
    retry: false,
  });

  const csvUrl = portfolioId ? tax.csvUrl(portfolioId, currentYear) : '#';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Tax Summary ({currentYear})</CardTitle>
        <Calculator className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-muted-foreground text-sm">Loading...</p>
          </div>
        ) : isError || !report ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-muted-foreground text-sm text-center">
              Add cost basis data to see tax estimates
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Short-term</p>
                <p className={`text-lg font-bold ${report.short_term_gains >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {report.short_term_gains >= 0 ? '+' : ''}${report.short_term_gains.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Long-term</p>
                <p className={`text-lg font-bold ${report.long_term_gains >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {report.long_term_gains >= 0 ? '+' : ''}${report.long_term_gains.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Gains</p>
                  <p className={`text-xl font-bold ${report.total_gains >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {report.total_gains >= 0 ? '+' : ''}${report.total_gains.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Dispositions</p>
                  <p className="text-xl font-bold">{report.disposition_count}</p>
                </div>
              </div>
            </div>

            <a
              href={csvUrl}
              className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
            >
              <Download className="h-3 w-3" />
              Download Form 8949 CSV
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
