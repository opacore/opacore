'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { portfolios as portfolioApi, wallets as walletApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@opacore/ui';
import { Button, Input, Label, Select } from '@opacore/ui';
import { ArrowLeft } from 'lucide-react';

export default function ImportWalletPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    label: '',
    walletType: 'xpub',
    value: '',
    network: 'bitcoin',
    gapLimit: '20',
  });

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfolioApi.list(),
  });

  const firstPortfolioId = portfolios?.[0]?.id;

  const importWallet = useMutation({
    mutationFn: async () => {
      if (!firstPortfolioId) throw new Error('No portfolio found. Create a portfolio first.');

      const data: Parameters<typeof walletApi.create>[0] = {
        portfolio_id: firstPortfolioId,
        label: form.label,
        wallet_type: form.walletType,
        network: form.network,
        gap_limit: parseInt(form.gapLimit, 10) || 20,
      };

      if (form.walletType === 'xpub') {
        data.xpub = form.value;
      } else if (form.walletType === 'descriptor') {
        data.descriptor = form.value;
      } else if (form.walletType === 'address') {
        data.address = form.value;
      }

      const wallet = await walletApi.create(data);

      // Auto-trigger sync after import
      try {
        await walletApi.sync(wallet.portfolio_id, wallet.id);
      } catch {
        // Sync failure is non-fatal — wallet is still created
        console.warn('Initial sync failed, wallet was still created');
      }

      return wallet;
    },
    onSuccess: (wallet) => {
      router.push(`/wallets/${wallet.id}`);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Failed to import wallet';
      setError(message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    importWallet.mutate();
  }

  const inputLabel =
    form.walletType === 'xpub'
      ? 'Extended Public Key (xpub/ypub/zpub)'
      : form.walletType === 'descriptor'
        ? 'Output Descriptor'
        : 'Bitcoin Address';

  const inputPlaceholder =
    form.walletType === 'xpub'
      ? 'xpub6CUGRUo...'
      : form.walletType === 'descriptor'
        ? "wpkh([fingerprint/84'/0'/0']xpub.../0/*)"
        : 'bc1q...';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/wallets">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Import Wallet</h1>
          <p className="text-muted-foreground">Add a watch-only wallet to track on-chain activity</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Wallet Details</CardTitle>
          <CardDescription>
            Import using an xpub, output descriptor, or single address. Your keys never leave your device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                type="text"
                placeholder="e.g. Cold Storage, Trezor, Savings"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="walletType">Import Type</Label>
              <Select
                id="walletType"
                value={form.walletType}
                onChange={(e) => setForm({ ...form, walletType: e.target.value, value: '' })}
              >
                <option value="xpub">Extended Public Key (xpub)</option>
                <option value="descriptor">Output Descriptor</option>
                <option value="address">Single Address</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="value">{inputLabel}</Label>
              <Input
                id="value"
                type="text"
                placeholder={inputPlaceholder}
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                required
                className="font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="network">Network</Label>
                <Select
                  id="network"
                  value={form.network}
                  onChange={(e) => setForm({ ...form, network: e.target.value })}
                >
                  <option value="bitcoin">Mainnet</option>
                  <option value="testnet">Testnet</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gapLimit">Gap Limit</Label>
                <Input
                  id="gapLimit"
                  type="number"
                  min={1}
                  max={100}
                  value={form.gapLimit}
                  onChange={(e) => setForm({ ...form, gapLimit: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Number of empty addresses to scan (default: 20)
                </p>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={importWallet.isPending}>
              {importWallet.isPending ? 'Importing & syncing...' : 'Import Wallet'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
