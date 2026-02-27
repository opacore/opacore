'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { wallets } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@opacore/ui';
import { ArrowUpRight, HardDrive, Plus } from 'lucide-react';

export function WalletOverview({ portfolioId }: { portfolioId: string | undefined }) {
  const { data: walletList, isLoading } = useQuery({
    queryKey: ['wallets', portfolioId],
    queryFn: () => wallets.list(portfolioId!),
    enabled: !!portfolioId,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Wallets</CardTitle>
        <Link
          href="/wallets"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          View all
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-muted-foreground text-sm">Loading...</p>
          </div>
        ) : !walletList || walletList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <HardDrive className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No wallets yet</p>
            <Link href="/wallets/import">
              <Button variant="outline" size="sm">
                <Plus className="h-3 w-3 mr-1" />
                Import Wallet
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {walletList.slice(0, 5).map((w) => (
              <Link
                key={w.id}
                href={`/wallets/${w.id}`}
                className="flex items-center justify-between rounded-md p-2 hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <HardDrive className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{w.label}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {w.wallet_type}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {w.network}
                  </Badge>
                </div>
              </Link>
            ))}
            {walletList.length > 5 && (
              <p className="text-xs text-muted-foreground text-center">
                +{walletList.length - 5} more
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
