'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@opacore/ui';
import { ArrowUpRight } from 'lucide-react';

interface Transaction {
  id: string;
  tx_type: string;
  amount_sat: number;
  price_usd: number | null;
  transacted_at: string;
}

const typeBadgeVariant = (type: string) => {
  switch (type) {
    case 'buy':
      return 'default';
    case 'sell':
      return 'destructive';
    case 'receive':
      return 'secondary';
    case 'send':
      return 'outline';
    default:
      return 'secondary';
  }
};

export function RecentTransactions({ transactions }: { transactions: Transaction[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Recent Transactions</CardTitle>
        <Link
          href="/transactions"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          View all
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            No transactions yet. Add your first transaction to get started.
          </p>
        ) : (
          <div className="space-y-4">
            {transactions.map((tx) => {
              const date = new Date(tx.transacted_at);
              const btcAmount = tx.amount_sat / 1e8;
              return (
                <div key={tx.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={typeBadgeVariant(tx.tx_type) as 'default'}>
                      {tx.tx_type}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">
                        {btcAmount.toFixed(8)} BTC
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {date.toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {tx.price_usd != null && (
                    <span className="text-sm text-muted-foreground">
                      @ ${tx.price_usd.toLocaleString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
