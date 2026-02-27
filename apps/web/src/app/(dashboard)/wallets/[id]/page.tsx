'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  portfolios as portfolioApi,
  wallets as walletApi,
  transactions as txApi,
  prices,
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@opacore/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@opacore/ui';
import { ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';

export default function WalletDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: walletId } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'addresses' | 'utxos' | 'transactions'>('addresses');
  const [syncMessage, setSyncMessage] = useState('');

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfolioApi.list(),
  });

  const firstPortfolioId = portfolios?.[0]?.id;

  const { data: wallet } = useQuery({
    queryKey: ['wallet', firstPortfolioId, walletId],
    queryFn: () => walletApi.get(firstPortfolioId!, walletId),
    enabled: !!firstPortfolioId,
  });

  const { data: addressData } = useQuery({
    queryKey: ['wallet-addresses', firstPortfolioId, walletId],
    queryFn: () => walletApi.addresses(firstPortfolioId!, walletId),
    enabled: !!firstPortfolioId && activeTab === 'addresses',
  });

  const { data: utxoData } = useQuery({
    queryKey: ['wallet-utxos', firstPortfolioId, walletId],
    queryFn: () => walletApi.utxos(firstPortfolioId!, walletId),
    enabled: !!firstPortfolioId && activeTab === 'utxos',
  });

  const { data: txList } = useQuery({
    queryKey: ['transactions', firstPortfolioId, 'wallet', walletId],
    queryFn: () => txApi.list({ portfolioId: firstPortfolioId!, walletId, limit: 50 }),
    enabled: !!firstPortfolioId && activeTab === 'transactions',
  });

  const { data: currentPrice } = useQuery({
    queryKey: ['prices', 'current'],
    queryFn: () => prices.current('usd'),
  });

  const syncWallet = useMutation({
    mutationFn: () => walletApi.sync(firstPortfolioId!, walletId),
    onSuccess: (result) => {
      setSyncMessage(
        `Sync complete: ${result.transactions_found} transactions found (${result.new_transactions} new), balance: ${(result.balance_sat / 1e8).toFixed(8)} BTC`,
      );
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-addresses'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-utxos'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (err) => {
      setSyncMessage(`Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  const deleteWallet = useMutation({
    mutationFn: () => walletApi.delete(firstPortfolioId!, walletId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      router.push('/wallets');
    },
  });

  const btcPrice = currentPrice?.price ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/wallets">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{wallet?.label ?? 'Wallet'}</h1>
              {wallet && (
                <>
                  <Badge variant="outline">{wallet.wallet_type}</Badge>
                  <Badge variant="secondary">{wallet.network}</Badge>
                </>
              )}
            </div>
            <p className="text-muted-foreground">
              {wallet?.last_synced_at
                ? `Last synced ${new Date(wallet.last_synced_at).toLocaleString()}`
                : 'Never synced'}
              {wallet?.last_sync_height ? ` · Block ${wallet.last_sync_height}` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setSyncMessage('');
              syncWallet.mutate();
            }}
            disabled={syncWallet.isPending || !firstPortfolioId}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${syncWallet.isPending ? 'animate-spin' : ''}`} />
            {syncWallet.isPending ? 'Syncing...' : 'Sync Now'}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (confirm('Delete this wallet? This will not delete associated transactions.')) {
                deleteWallet.mutate();
              }
            }}
            disabled={deleteWallet.isPending || !firstPortfolioId}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Sync feedback */}
      {syncMessage && (
        <div
          className={`rounded-md border p-3 text-sm ${
            syncMessage.startsWith('Sync failed')
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-700'
          }`}
        >
          {syncMessage}
        </div>
      )}

      {/* Stats */}
      {utxoData && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(utxoData.total_sat / 1e8).toFixed(8)} BTC
              </div>
              {btcPrice > 0 && (
                <p className="text-sm text-muted-foreground">
                  ${((utxoData.total_sat / 1e8) * btcPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">UTXOs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{utxoData.utxos.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Addresses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{addressData?.addresses?.length ?? '-'}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['addresses', 'utxos', 'transactions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'addresses' && (
        <div className="rounded-lg border">
          {!addressData?.addresses?.length ? (
            <div className="py-12 text-center text-muted-foreground">
              No addresses yet. Sync the wallet to discover addresses.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Index</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Keychain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addressData.addresses.map((addr) => (
                  <TableRow key={`${addr.keychain}-${addr.index}`}>
                    <TableCell className="font-mono">{addr.index}</TableCell>
                    <TableCell className="font-mono text-sm">{addr.address}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {addr.keychain === 'external' ? 'Receive' : 'Change'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {activeTab === 'utxos' && (
        <div className="rounded-lg border">
          {!utxoData?.utxos?.length ? (
            <div className="py-12 text-center text-muted-foreground">
              No UTXOs found. Sync the wallet to discover UTXOs.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outpoint</TableHead>
                  <TableHead>Amount (BTC)</TableHead>
                  <TableHead>Keychain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {utxoData.utxos.map((utxo) => (
                  <TableRow key={`${utxo.txid}:${utxo.vout}`}>
                    <TableCell className="font-mono text-sm">
                      {utxo.txid.substring(0, 16)}...:{utxo.vout}
                    </TableCell>
                    <TableCell className="font-mono">
                      {(utxo.value_sat / 1e8).toFixed(8)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {utxo.keychain}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="rounded-lg border">
          {!txList?.length ? (
            <div className="py-12 text-center text-muted-foreground">
              No transactions found for this wallet.
            </div>
          ) : (
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
                          tx.tx_type === 'buy' || tx.tx_type === 'receive'
                            ? 'default'
                            : tx.tx_type === 'sell' || tx.tx_type === 'send'
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
          )}
        </div>
      )}
    </div>
  );
}
