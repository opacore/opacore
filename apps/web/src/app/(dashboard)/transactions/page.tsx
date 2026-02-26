'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { portfolios as portfolioApi, transactions as txApi } from '@/lib/api';
import { Button, Badge } from '@opacore/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@opacore/ui';
import { Plus } from 'lucide-react';

export default function TransactionsPage() {
  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfolioApi.list(),
  });

  const firstPortfolioId = portfolios?.[0]?.id;

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions', firstPortfolioId, 'all'],
    queryFn: () => txApi.list({ portfolioId: firstPortfolioId!, limit: 50 }),
    enabled: !!firstPortfolioId,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">View and manage your Bitcoin transactions</p>
        </div>
        <Link href="/transactions/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Transaction
          </Button>
        </Link>
      </div>

      {isLoading || !portfolios ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Loading transactions...</p>
        </div>
      ) : !transactions?.length ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20">
          <p className="text-muted-foreground mb-4">No transactions yet</p>
          <Link href="/transactions/new">
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Add your first transaction
            </Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount (BTC)</TableHead>
                <TableHead>Price at Time</TableHead>
                <TableHead>Total Value</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => {
                const amount = tx.amount_sat / 1e8;
                const price = tx.price_usd;
                const total = price ? amount * price : null;
                const date = new Date(tx.transacted_at);

                return (
                  <TableRow key={tx.id}>
                    <TableCell>{date.toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          tx.tx_type === 'buy'
                            ? 'default'
                            : tx.tx_type === 'sell'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {tx.tx_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{amount.toFixed(8)}</TableCell>
                    <TableCell>
                      {price ? `$${price.toLocaleString()}` : '-'}
                    </TableCell>
                    <TableCell>
                      {total
                        ? `$${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tx.source}
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
