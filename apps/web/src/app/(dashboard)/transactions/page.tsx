'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portfolios as portfolioApi, transactions as txApi } from '@/lib/api';
import { Button, Badge } from '@opacore/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@opacore/ui';
import { ArrowUpRight, ArrowDownLeft, RefreshCw, AlertCircle, Download } from 'lucide-react';
import type { Transaction } from '@/lib/api';
import { cn } from '@opacore/ui';

function downloadCsv(txs: Transaction[]) {
  const headers = ['Date', 'Type', 'Amount (BTC)', 'Amount (SAT)', 'Price (USD)', 'Total (USD)', 'Fee (SAT)', 'Source', 'TXID'];
  const rows = txs.map((tx) => {
    const btc = (tx.amount_sat / 1e8).toFixed(8);
    const total = tx.price_usd ? ((tx.amount_sat / 1e8) * tx.price_usd).toFixed(2) : '';
    return [
      tx.transacted_at.slice(0, 10),
      tx.tx_type,
      btc,
      tx.amount_sat.toString(),
      tx.price_usd?.toFixed(2) ?? '',
      total,
      tx.fee_sat?.toString() ?? '',
      tx.source,
      tx.txid ?? '',
    ];
  });
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const TX_TYPE_LABEL: Record<string, string> = {
  buy: 'Buy',
  sell: 'Sell',
  receive: 'Receive',
  send: 'Transfer',
  transfer: 'Transfer',
};

const TX_TYPE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  buy: 'default',
  sell: 'destructive',
  receive: 'secondary',
  send: 'outline',
  transfer: 'outline',
};

export default function TransactionsPage() {
  const queryClient = useQueryClient();
  const [reclassifyingId, setReclassifyingId] = useState<string | null>(null);

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfolioApi.list(),
  });

  const firstPortfolioId = portfolios?.[0]?.id;

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions', firstPortfolioId, 'all'],
    queryFn: () => txApi.list({ portfolioId: firstPortfolioId!, limit: 200 }),
    enabled: !!firstPortfolioId,
  });

  const reclassify = useMutation({
    mutationFn: ({ txId, txType }: { txId: string; txType: string }) =>
      txApi.update(firstPortfolioId!, txId, { tx_type: txType }),
    onMutate: ({ txId }) => setReclassifyingId(txId),
    onSettled: () => {
      setReclassifyingId(null);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
    },
  });

  // Count chain-sourced sends that haven't been classified as sells
  const unclassifiedSends = transactions?.filter(
    (tx) => tx.tx_type === 'send' && tx.source === 'chain',
  ).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">Your synced Bitcoin transaction history</p>
        </div>
        {transactions && transactions.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(transactions)}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Classification banner */}
      {unclassifiedSends > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              {unclassifiedSends} outgoing transaction{unclassifiedSends !== 1 ? 's' : ''} need classification
            </p>
            <p className="text-amber-700 mt-0.5">
              The blockchain records all sends as transfers. Mark any that were Bitcoin sales so your tax report is accurate.
            </p>
          </div>
        </div>
      )}

      {isLoading || !portfolios ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Loading transactions...</p>
        </div>
      ) : !transactions?.length ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20">
          <p className="text-muted-foreground">No transactions yet</p>
          <p className="text-sm text-muted-foreground mt-1">Connect a wallet and sync to see your transactions</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount (BTC)</TableHead>
                <TableHead className="text-right">Price at Time</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
                <TableHead>Source</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => {
                const amount = tx.amount_sat / 1e8;
                const price = tx.price_usd;
                const total = price ? amount * price : null;
                const date = new Date(tx.transacted_at);
                const isOutgoing = tx.tx_type === 'send' || tx.tx_type === 'sell';
                const isSend = tx.tx_type === 'send';
                const isSell = tx.tx_type === 'sell';
                const isReclassifying = reclassifyingId === tx.id;

                return (
                  <TableRow key={tx.id}>
                    <TableCell className="text-muted-foreground text-sm">
                      {date.toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {isOutgoing
                          ? <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ArrowDownLeft className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                        <Badge variant={TX_TYPE_VARIANT[tx.tx_type] ?? 'outline'}>
                          {TX_TYPE_LABEL[tx.tx_type] ?? tx.tx_type}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className={cn('text-right font-mono text-sm', isOutgoing ? 'text-red-600' : 'text-green-600')}>
                      {isOutgoing ? '-' : '+'}{amount.toFixed(6)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {price ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : (
                        <span className="text-amber-500 text-xs">syncing…</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {total
                        ? `$${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {tx.source}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Reclassify — only for chain-sourced outgoing transactions */}
                      {(isSend || isSell) && tx.source === 'chain' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            'h-7 text-xs',
                            isSend
                              ? 'text-muted-foreground hover:text-destructive'
                              : 'text-destructive hover:text-muted-foreground',
                          )}
                          disabled={isReclassifying}
                          onClick={() =>
                            reclassify.mutate({
                              txId: tx.id,
                              txType: isSend ? 'sell' : 'send',
                            })
                          }
                        >
                          {isReclassifying ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : isSend ? (
                            'Mark as Sell'
                          ) : (
                            'Undo Sell'
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
