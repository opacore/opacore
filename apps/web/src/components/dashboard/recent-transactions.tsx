'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@opacore/ui';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { cn } from '@opacore/ui';

interface Transaction {
  id: string;
  tx_type: string;
  amount_sat: number;
  price_usd: number | null;
  transacted_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  buy: 'Buy',
  sell: 'Sell',
  receive: 'Receive',
  send: 'Transfer',
  transfer: 'Transfer',
};

function isIncoming(type: string) {
  return type === 'buy' || type === 'receive';
}

export function RecentTransactions({ transactions }: { transactions: Transaction[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">Recent Transactions</CardTitle>
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
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <p className="text-sm text-muted-foreground">No transactions yet</p>
            <p className="text-xs text-muted-foreground">Import and sync a wallet to see activity</p>
          </div>
        ) : (
          <div className="divide-y">
            {transactions.map((tx) => {
              const incoming = isIncoming(tx.tx_type);
              const btc = tx.amount_sat / 1e8;
              const usd = tx.price_usd ? btc * tx.price_usd : null;
              const date = new Date(tx.transacted_at);

              return (
                <div key={tx.id} className="flex items-center gap-3 py-2.5">
                  {/* Direction icon */}
                  <div className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    incoming ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500',
                  )}>
                    {incoming
                      ? <ArrowDownLeft className="h-3.5 w-3.5" />
                      : <ArrowUpRight className="h-3.5 w-3.5" />
                    }
                  </div>

                  {/* Type + date */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none">
                      {TYPE_LABEL[tx.tx_type] ?? tx.tx_type}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <p className={cn(
                      'text-sm font-mono font-medium leading-none',
                      incoming ? 'text-green-600' : 'text-red-500',
                    )}>
                      {incoming ? '+' : '-'}{btc.toFixed(5)} BTC
                    </p>
                    {usd !== null && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
