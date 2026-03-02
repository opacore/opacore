'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portfolios as portfolioApi, wallets as walletApi } from '@/lib/api';
import type { Wallet, SyncResult } from '@/lib/api';
import { Button, Badge } from '@opacore/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@opacore/ui';
import { Plus, RefreshCw, HardDrive, Trash2 } from 'lucide-react';

const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

function isStale(wallet: Wallet): boolean {
  if (!wallet.last_synced_at) return true;
  return Date.now() - new Date(wallet.last_synced_at).getTime() > STALE_THRESHOLD_MS;
}

export default function WalletsPage() {
  const queryClient = useQueryClient();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ walletId: string; result: SyncResult } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const autoSyncedRef = useRef(false);

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfolioApi.list(),
  });

  const firstPortfolioId = portfolios?.[0]?.id;

  const { data: walletList, isLoading } = useQuery({
    queryKey: ['wallets', firstPortfolioId],
    queryFn: () => walletApi.list(firstPortfolioId!),
    enabled: !!firstPortfolioId,
  });

  const syncWallet = useMutation({
    mutationFn: ({ portfolioId, walletId }: { portfolioId: string; walletId: string }) =>
      walletApi.sync(portfolioId, walletId),
    onSuccess: (result, { walletId }) => {
      setSyncResult({ walletId, result });
      setSyncingId(null);
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
    },
    onError: () => {
      setSyncingId(null);
    },
  });

  const deleteWallet = useMutation({
    mutationFn: ({ portfolioId, walletId }: { portfolioId: string; walletId: string }) =>
      walletApi.delete(portfolioId, walletId),
    onSuccess: () => {
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
  });

  // Auto-sync stale wallets sequentially on first load
  useEffect(() => {
    if (!walletList || !firstPortfolioId || autoSyncedRef.current) return;
    const stale = walletList.filter(isStale);
    if (stale.length === 0) return;

    autoSyncedRef.current = true;

    (async () => {
      for (const wallet of stale) {
        setSyncingId(wallet.id);
        try {
          const result = await walletApi.sync(firstPortfolioId, wallet.id);
          setSyncResult({ walletId: wallet.id, result });
          queryClient.invalidateQueries({ queryKey: ['wallets'] });
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
        } catch {
          // swallow — don't block remaining wallets
        }
        setSyncingId(null);
      }
    })();
  }, [walletList, firstPortfolioId, queryClient]);

  function handleSync(wallet: Wallet) {
    setSyncingId(wallet.id);
    setSyncResult(null);
    syncWallet.mutate({ portfolioId: wallet.portfolio_id, walletId: wallet.id });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Wallets</h1>
          <p className="text-muted-foreground">Import and manage your watch-only wallets</p>
        </div>
        <Link href="/wallets/import">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Import Wallet
          </Button>
        </Link>
      </div>

      {syncResult && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Sync complete: {syncResult.result.transactions_found} transactions found
          ({syncResult.result.new_transactions} new), balance: {(syncResult.result.balance_sat / 1e8).toFixed(8)} BTC
        </div>
      )}

      {isLoading || !portfolios ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Loading wallets...</p>
        </div>
      ) : !walletList?.length ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20">
          <HardDrive className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">No wallets imported yet</p>
          <Link href="/wallets/import">
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Import your first wallet
            </Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Network</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Last Synced</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {walletList.map((wallet) => (
                <TableRow key={wallet.id}>
                  <TableCell>
                    <Link
                      href={`/wallets/${wallet.id}`}
                      className="font-medium hover:underline"
                    >
                      {wallet.label}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{wallet.wallet_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{wallet.network}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {wallet.balance_sat > 0
                      ? `${(wallet.balance_sat / 1e8).toFixed(8)} BTC`
                      : wallet.last_synced_at ? '0 BTC' : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {wallet.last_synced_at
                      ? new Date(wallet.last_synced_at).toLocaleString()
                      : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSync(wallet)}
                        disabled={syncingId === wallet.id}
                      >
                        <RefreshCw
                          className={`mr-1 h-4 w-4 ${syncingId === wallet.id ? 'animate-spin' : ''}`}
                        />
                        {syncingId === wallet.id ? 'Syncing...' : 'Sync'}
                      </Button>
                      {confirmDeleteId === wallet.id ? (
                        <>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteWallet.mutate({ portfolioId: wallet.portfolio_id, walletId: wallet.id })}
                            disabled={deleteWallet.isPending}
                          >
                            {deleteWallet.isPending ? 'Deleting...' : 'Confirm'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmDeleteId(wallet.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
