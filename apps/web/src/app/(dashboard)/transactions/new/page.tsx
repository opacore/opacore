'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portfolios as portfolioApi, transactions as txApi, prices } from '@/lib/api';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Input,
  Label,
  Select,
} from '@opacore/ui';

export default function NewTransactionPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfolioApi.list(),
  });

  const [form, setForm] = useState({
    portfolioId: '',
    type: 'buy' as 'buy' | 'sell' | 'send' | 'receive' | 'transfer',
    amountBtc: '',
    pricePerBtc: '',
    fee: '',
    transactedAt: new Date().toISOString().split('T')[0]!,
  });

  const createTx = useMutation({
    mutationFn: txApi.create,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
      router.push('/transactions');
    },
  });

  // Auto-fetch historical price when date changes
  const { data: historicalPrice } = useQuery({
    queryKey: ['prices', 'historical', form.transactedAt],
    queryFn: () => prices.historical(form.transactedAt, 'usd'),
    enabled: !!form.transactedAt && form.transactedAt.length === 10,
  });

  function handleDateChange(date: string) {
    setForm((prev) => ({ ...prev, transactedAt: date }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const priceUsd = form.pricePerBtc
      ? parseFloat(form.pricePerBtc)
      : historicalPrice?.price ?? undefined;
    const amountSat = Math.round(parseFloat(form.amountBtc) * 1e8);
    const feeSat = form.fee ? Math.round(parseFloat(form.fee) * 1e8) : undefined;

    createTx.mutate({
      portfolio_id: form.portfolioId,
      tx_type: form.type,
      amount_sat: amountSat,
      price_usd: priceUsd,
      fee_sat: feeSat,
      transacted_at: new Date(form.transactedAt).toISOString(),
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Add Transaction</h1>
        <p className="text-muted-foreground">Record a Bitcoin transaction</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction Details</CardTitle>
          <CardDescription>
            Enter the details of your Bitcoin transaction. Historical price will be auto-fetched.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="portfolio">Portfolio</Label>
              <Select
                id="portfolio"
                value={form.portfolioId}
                onChange={(e) => setForm((prev) => ({ ...prev, portfolioId: e.target.value }))}
                required
              >
                <option value="">Select a portfolio</option>
                {portfolios?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  id="type"
                  value={form.type}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      type: e.target.value as typeof form.type,
                    }))
                  }
                >
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                  <option value="send">Send</option>
                  <option value="receive">Receive</option>
                  <option value="transfer">Transfer</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.transactedAt}
                  onChange={(e) => handleDateChange(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (BTC)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.00000001"
                  min="0"
                  placeholder="0.00000000"
                  value={form.amountBtc}
                  onChange={(e) => setForm((prev) => ({ ...prev, amountBtc: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">
                  Price per BTC (USD)
                  {historicalPrice && !form.pricePerBtc && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      Auto: ${historicalPrice.price.toLocaleString()}
                    </span>
                  )}
                </Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={
                    historicalPrice
                      ? `${historicalPrice.price.toLocaleString()} (auto)`
                      : 'Enter price'
                  }
                  value={form.pricePerBtc}
                  onChange={(e) => setForm((prev) => ({ ...prev, pricePerBtc: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fee">Fee (BTC)</Label>
              <Input
                id="fee"
                type="number"
                step="0.00000001"
                min="0"
                placeholder="0.00000000"
                value={form.fee}
                onChange={(e) => setForm((prev) => ({ ...prev, fee: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={createTx.isPending}>
                {createTx.isPending ? 'Adding...' : 'Add Transaction'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
