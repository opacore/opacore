'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoices as invoiceApi, portfolios as portfolioApi, wallets as walletApi, prices } from '@/lib/api';
import type { AddressInfo } from '@/lib/api';
import {
  Button, Card, CardContent, CardHeader, CardTitle, CardDescription,
  Input, Label,
} from '@opacore/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NewInvoicePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: portfolioList } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfolioApi.list(),
  });
  const portfolioId = portfolioList?.[0]?.id;

  const { data: currentPrice } = useQuery({
    queryKey: ['prices', 'current'],
    queryFn: () => prices.current('usd'),
  });

  const { data: walletList } = useQuery({
    queryKey: ['wallets', portfolioId],
    queryFn: () => walletApi.list(portfolioId!),
    enabled: !!portfolioId,
  });

  const [addressMode, setAddressMode] = useState<'wallet' | 'manual'>('manual');
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const [walletAddresses, setWalletAddresses] = useState<AddressInfo[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  const [form, setForm] = useState({
    invoiceNumber: '',
    customerName: '',
    customerEmail: '',
    description: '',
    amountUsd: '',
    btcAddress: '',
    dueAt: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  });

  const [error, setError] = useState('');

  const btcPrice = currentPrice?.price ?? 0;
  const amountUsd = parseFloat(form.amountUsd) || 0;
  const amountBtc = btcPrice > 0 ? amountUsd / btcPrice : 0;
  const amountSat = Math.round(amountBtc * 1e8);

  const handleWalletChange = async (walletId: string) => {
    setSelectedWalletId(walletId);
    if (!walletId || !portfolioId) return;

    setLoadingAddresses(true);
    try {
      const res = await walletApi.addresses(portfolioId, walletId);
      const addrs = res.addresses ?? [];
      setWalletAddresses(addrs);
      if (addrs.length > 0) {
        setForm((f) => ({ ...f, btcAddress: addrs[0]!.address }));
      }
    } catch {
      setWalletAddresses([]);
    } finally {
      setLoadingAddresses(false);
    }
  };

  const createInvoice = useMutation({
    mutationFn: () =>
      invoiceApi.create({
        portfolio_id: portfolioId!,
        type: 'invoice',
        invoice_number: form.invoiceNumber,
        customer_name: form.customerName,
        customer_email: form.customerEmail || undefined,
        description: form.description || undefined,
        amount_sat: amountSat,
        amount_fiat: amountUsd || undefined,
        fiat_currency: 'usd',
        btc_price_at_creation: btcPrice || undefined,
        btc_address: form.btcAddress,
        wallet_id: addressMode === 'wallet' ? selectedWalletId || undefined : undefined,
        due_at: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
        expires_at: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      }),
    onSuccess: async (invoice) => {
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      router.push(`/payments/${invoice.id}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create invoice');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.invoiceNumber.trim()) {
      setError('Invoice number is required');
      return;
    }
    if (!form.customerName.trim()) {
      setError('Customer name is required');
      return;
    }
    if (!form.btcAddress.trim()) {
      setError('BTC address is required');
      return;
    }
    if (amountSat <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    createInvoice.mutate();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/payments">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Invoice</h1>
          <p className="text-muted-foreground">Generate a Bitcoin invoice for your customer</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
            <CardDescription>Fill in the invoice information below</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">Invoice Number</Label>
                <Input
                  id="invoiceNumber"
                  placeholder="INV-001"
                  value={form.invoiceNumber}
                  onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer Name</Label>
                <Input
                  id="customerName"
                  placeholder="John Doe"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customerEmail">Customer Email (optional)</Label>
              <Input
                id="customerEmail"
                type="email"
                placeholder="john@example.com"
                value={form.customerEmail}
                onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                placeholder="Services rendered, products sold, etc."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amountUsd">Amount (USD)</Label>
              <Input
                id="amountUsd"
                type="number"
                step="0.01"
                min="0"
                placeholder="100.00"
                value={form.amountUsd}
                onChange={(e) => setForm({ ...form, amountUsd: e.target.value })}
                required
              />
              {amountUsd > 0 && btcPrice > 0 && (
                <p className="text-xs text-muted-foreground">
                  = {amountBtc.toFixed(8)} BTC ({amountSat.toLocaleString()} sats) @ ${btcPrice.toLocaleString()}/BTC
                </p>
              )}
            </div>

            {/* BTC Address */}
            <div className="space-y-2">
              <Label>BTC Address</Label>
              <div className="flex gap-2 mb-2">
                <Button
                  type="button"
                  variant={addressMode === 'manual' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAddressMode('manual')}
                >
                  Manual Entry
                </Button>
                <Button
                  type="button"
                  variant={addressMode === 'wallet' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAddressMode('wallet')}
                  disabled={!walletList || walletList.length === 0}
                >
                  From Wallet
                </Button>
              </div>

              {addressMode === 'manual' ? (
                <Input
                  placeholder="bc1q... or 1... or 3..."
                  value={form.btcAddress}
                  onChange={(e) => setForm({ ...form, btcAddress: e.target.value })}
                  required
                />
              ) : (
                <div className="space-y-2">
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={selectedWalletId}
                    onChange={(e) => handleWalletChange(e.target.value)}
                  >
                    <option value="">Select a wallet...</option>
                    {(walletList ?? []).map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label} ({w.wallet_type} / {w.network})
                      </option>
                    ))}
                  </select>

                  {loadingAddresses && (
                    <p className="text-xs text-muted-foreground">Loading addresses...</p>
                  )}

                  {walletAddresses.length > 0 && (
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm font-mono transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={form.btcAddress}
                      onChange={(e) => setForm({ ...form, btcAddress: e.target.value })}
                    >
                      {walletAddresses.map((a) => (
                        <option key={`${a.keychain}-${a.index}`} value={a.address}>
                          [{a.index}] {a.address}
                        </option>
                      ))}
                    </select>
                  )}

                  {form.btcAddress && (
                    <p className="text-xs text-muted-foreground font-mono break-all">
                      Selected: {form.btcAddress}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dueAt">Due Date</Label>
                <Input
                  id="dueAt"
                  type="date"
                  value={form.dueAt}
                  onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiresAt">Payment Expiry</Label>
                <Input
                  id="expiresAt"
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Invoice will auto-expire after this date
                </p>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={createInvoice.isPending}>
                {createInvoice.isPending ? 'Creating...' : 'Create Invoice'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
