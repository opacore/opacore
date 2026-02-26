'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { portfolios as portfolioApi, transactions as txApi, prices } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@opacore/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@opacore/ui';
import { ArrowLeft, Plus } from 'lucide-react';

export default function PortfolioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: portfolio } = useQuery({
    queryKey: ['portfolio', id],
    queryFn: () => portfolioApi.get(id),
  });
  const { data: summary } = useQuery({
    queryKey: ['portfolio-summary', id],
    queryFn: () => portfolioApi.summary(id),
  });
  const { data: txList } = useQuery({
    queryKey: ['transactions', id],
    queryFn: () => txApi.list({ portfolioId: id, limit: 20 }),
  });
  const { data: currentPrice } = useQuery({
    queryKey: ['prices', 'current'],
    queryFn: () => prices.current('usd'),
  });

  const totalBtc = (summary?.total_balance_sat ?? 0) / 1e8;
  const totalValue = summary?.current_value_usd ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/portfolios">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{portfolio?.name ?? 'Portfolio'}</h1>
          {portfolio?.description && (
            <p className="text-muted-foreground">{portfolio.description}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Bitcoin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBtc.toFixed(8)} BTC</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Current Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.transaction_count ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Transaction History</h2>
        <Link href="/transactions/new">
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Transaction
          </Button>
        </Link>
      </div>

      {txList?.length ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount (BTC)</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txList.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>{new Date(tx.transacted_at).toLocaleDateString()}</TableCell>
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
                  <TableCell className="font-mono">
                    {(tx.amount_sat / 1e8).toFixed(8)}
                  </TableCell>
                  <TableCell>
                    {tx.price_usd != null ? `$${tx.price_usd.toLocaleString()}` : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{tx.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
          No transactions in this portfolio yet
        </div>
      )}
    </div>
  );
}
