'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { alerts as alertsApi, portfolios as portfolioApi, wallets as walletApi } from '@/lib/api';
import type { Alert, AlertType } from '@/lib/api';
import { Button, Badge, Input, Select } from '@opacore/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@opacore/ui';
import { Bell, Plus, Trash2 } from 'lucide-react';
import { cn } from '@opacore/ui';

function DeleteActions({
  alert,
  confirmDeleteId,
  setConfirmDeleteId,
  deleteAlert,
}: {
  alert: Alert;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  deleteAlert: ReturnType<typeof useMutation<void, Error, string>>;
}) {
  if (confirmDeleteId === alert.id) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => deleteAlert.mutate(alert.id)}
          disabled={deleteAlert.isPending}
        >
          {deleteAlert.isPending ? 'Deleting...' : 'Confirm'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)}>
          Cancel
        </Button>
      </div>
    );
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-destructive"
      onClick={() => setConfirmDeleteId(alert.id)}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

export default function AlertsPage() {
  const queryClient = useQueryClient();

  const [showPriceForm, setShowPriceForm] = useState(false);
  const [priceType, setPriceType] = useState<'price_above' | 'price_below'>('price_above');
  const [priceThreshold, setPriceThreshold] = useState('');
  const [priceLabel, setPriceLabel] = useState('');

  const [showBalanceForm, setShowBalanceForm] = useState(false);
  const [balanceWalletId, setBalanceWalletId] = useState('');
  const [balanceLabel, setBalanceLabel] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: alertList, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => alertsApi.list(),
  });

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfolioApi.list(),
  });
  const firstPortfolioId = portfolios?.[0]?.id;

  const { data: walletList } = useQuery({
    queryKey: ['wallets', firstPortfolioId],
    queryFn: () => walletApi.list(firstPortfolioId!),
    enabled: !!firstPortfolioId,
  });

  const createAlert = useMutation({
    mutationFn: alertsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      setShowPriceForm(false);
      setShowBalanceForm(false);
      setPriceThreshold('');
      setPriceLabel('');
      setBalanceWalletId('');
      setBalanceLabel('');
    },
  });

  const toggleAlert = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      alertsApi.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const deleteAlert = useMutation({
    mutationFn: (id: string) => alertsApi.delete(id),
    onSuccess: () => {
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const priceAlerts = alertList?.filter(
    (a) => a.alert_type === 'price_above' || a.alert_type === 'price_below',
  ) ?? [];
  const balanceAlerts = alertList?.filter((a) => a.alert_type === 'balance_change') ?? [];

  function handleCreatePrice() {
    const threshold = parseFloat(priceThreshold);
    if (isNaN(threshold) || threshold <= 0) return;
    createAlert.mutate({
      alert_type: priceType as AlertType,
      threshold_usd: threshold,
      label: priceLabel.trim() || undefined,
    });
  }

  function handleCreateBalance() {
    if (!balanceWalletId && !firstPortfolioId) return;
    createAlert.mutate({
      alert_type: 'balance_change',
      wallet_id: balanceWalletId || undefined,
      portfolio_id: balanceWalletId ? undefined : firstPortfolioId,
      label: balanceLabel.trim() || undefined,
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading alerts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Alerts</h1>
        <p className="text-muted-foreground">
          Get email notifications when BTC crosses a price or a wallet receives funds.
        </p>
      </div>

      {/* ── Price Alerts ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Price Alerts</h2>
            <p className="text-sm text-muted-foreground">
              Fires once when BTC crosses the threshold, then deactivates. Re-enable any time.
            </p>
          </div>
          {!showPriceForm && (
            <Button size="sm" onClick={() => setShowPriceForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Alert
            </Button>
          )}
        </div>

        {showPriceForm && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <label className="text-sm font-medium">Condition</label>
                <Select
                  value={priceType}
                  onChange={(e) => setPriceType(e.target.value as typeof priceType)}
                  className="w-44"
                >
                  <option value="price_above">BTC rises above</option>
                  <option value="price_below">BTC drops below</option>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Price (USD)</label>
                <Input
                  type="number"
                  placeholder="e.g. 100000"
                  value={priceThreshold}
                  onChange={(e) => setPriceThreshold(e.target.value)}
                  className="w-36"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Label (optional)</label>
                <Input
                  placeholder="e.g. ATH target"
                  value={priceLabel}
                  onChange={(e) => setPriceLabel(e.target.value)}
                  className="w-44"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreatePrice}
                disabled={!priceThreshold || createAlert.isPending}
              >
                {createAlert.isPending ? 'Saving...' : 'Save Alert'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowPriceForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {priceAlerts.length > 0 ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Price (USD)</TableHead>
                  <TableHead>Last Triggered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {priceAlerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell className="text-muted-foreground text-sm">
                      {alert.label ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={alert.alert_type === 'price_above' ? 'default' : 'secondary'}>
                        {alert.alert_type === 'price_above' ? '↑ Above' : '↓ Below'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      ${alert.threshold_usd?.toLocaleString() ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {alert.last_triggered_at
                        ? new Date(alert.last_triggered_at).toLocaleString()
                        : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          alert.is_active
                            ? 'text-green-600 border-green-200'
                            : 'text-muted-foreground',
                        )}
                        onClick={() =>
                          toggleAlert.mutate({ id: alert.id, is_active: !alert.is_active })
                        }
                        disabled={toggleAlert.isPending}
                      >
                        {alert.is_active ? 'Active' : 'Inactive'}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <DeleteActions
                        alert={alert}
                        confirmDeleteId={confirmDeleteId}
                        setConfirmDeleteId={setConfirmDeleteId}
                        deleteAlert={deleteAlert}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-lg border border-dashed py-10">
            <Bell className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No price alerts yet</p>
          </div>
        )}
      </section>

      {/* ── Balance Alerts ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Balance Alerts</h2>
            <p className="text-sm text-muted-foreground">
              Get notified whenever a wallet receives an incoming transaction.
            </p>
          </div>
          {!showBalanceForm && (
            <Button size="sm" onClick={() => setShowBalanceForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Alert
            </Button>
          )}
        </div>

        {showBalanceForm && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <label className="text-sm font-medium">Wallet</label>
                <Select
                  value={balanceWalletId}
                  onChange={(e) => setBalanceWalletId(e.target.value)}
                  className="w-56"
                >
                  <option value="">All wallets in portfolio</option>
                  {walletList?.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Label (optional)</label>
                <Input
                  placeholder="e.g. Cold storage"
                  value={balanceLabel}
                  onChange={(e) => setBalanceLabel(e.target.value)}
                  className="w-44"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreateBalance}
                disabled={createAlert.isPending}
              >
                {createAlert.isPending ? 'Saving...' : 'Save Alert'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowBalanceForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {balanceAlerts.length > 0 ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Last Triggered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balanceAlerts.map((alert) => {
                  const wallet = walletList?.find((w) => w.id === alert.wallet_id);
                  return (
                    <TableRow key={alert.id}>
                      <TableCell className="text-muted-foreground text-sm">
                        {alert.label ?? '—'}
                      </TableCell>
                      <TableCell>
                        {wallet ? (
                          <Badge variant="outline">{wallet.label}</Badge>
                        ) : (
                          <Badge variant="secondary">All wallets</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {alert.last_triggered_at
                          ? new Date(alert.last_triggered_at).toLocaleString()
                          : 'Never'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            alert.is_active
                              ? 'text-green-600 border-green-200'
                              : 'text-muted-foreground',
                          )}
                          onClick={() =>
                            toggleAlert.mutate({ id: alert.id, is_active: !alert.is_active })
                          }
                          disabled={toggleAlert.isPending}
                        >
                          {alert.is_active ? 'Active' : 'Inactive'}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <DeleteActions
                          alert={alert}
                          confirmDeleteId={confirmDeleteId}
                          setConfirmDeleteId={setConfirmDeleteId}
                          deleteAlert={deleteAlert}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-lg border border-dashed py-10">
            <Bell className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No balance alerts yet</p>
          </div>
        )}
      </section>
    </div>
  );
}
