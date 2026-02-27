'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoices as invoiceApi, portfolios as portfolioApi } from '@/lib/api';
import type { Invoice } from '@/lib/api';
import {
  Button, Badge, Card, CardContent, CardHeader, CardTitle,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@opacore/ui';
import { Plus, LinkIcon, FileText, Copy, Check, Trash2, Clock, CheckCircle, AlertCircle } from 'lucide-react';

type StatusFilter = 'all' | 'active' | 'paid' | 'closed';
type TopTab = 'links' | 'invoices';

const statusVariant = (status: string) => {
  switch (status) {
    case 'paid': return 'default';
    case 'sent': return 'secondary';
    case 'expired': return 'destructive';
    case 'cancelled': return 'outline';
    default: return 'secondary';
  }
};

function filterByStatus(list: Invoice[], filter: StatusFilter): Invoice[] {
  switch (filter) {
    case 'active':
      return list.filter((i) => i.status === 'draft' || i.status === 'sent');
    case 'paid':
      return list.filter((i) => i.status === 'paid');
    case 'closed':
      return list.filter((i) => i.status === 'expired' || i.status === 'cancelled');
    default:
      return list;
  }
}

function formatBtc(sats: number) {
  return (sats / 1e8).toFixed(8);
}

function formatFiat(amount: number | null, currency: string) {
  if (amount == null) return null;
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency.toUpperCase()}`;
}

function formatDate(date: string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString();
}

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [topTab, setTopTab] = useState<TopTab>('links');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data: portfolioList } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfolioApi.list(),
  });
  const portfolioId = portfolioList?.[0]?.id;

  const { data: allItems, isLoading } = useQuery({
    queryKey: ['invoices', portfolioId],
    queryFn: () => invoiceApi.list(portfolioId!),
    enabled: !!portfolioId,
  });

  const deleteItem = useMutation({
    mutationFn: (invoiceId: string) => invoiceApi.delete(portfolioId!, invoiceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  });

  const copyShareLink = (item: { id: string; share_token: string }) => {
    const url = `${window.location.origin}/pay/${item.share_token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const items = allItems ?? [];
  const links = items.filter((i) => i.type === 'payment_link');
  const invoices = items.filter((i) => i.type === 'invoice');

  const currentList = topTab === 'links' ? links : invoices;
  const active = currentList.filter((i) => i.status === 'draft' || i.status === 'sent');
  const paid = currentList.filter((i) => i.status === 'paid');
  const closed = currentList.filter((i) => i.status === 'expired' || i.status === 'cancelled');
  const filtered = filterByStatus(currentList, statusFilter);

  const activeSats = active.reduce((sum, i) => sum + i.amount_sat, 0);
  const activeFiat = active.reduce((sum, i) => sum + (i.amount_fiat ?? 0), 0);
  const paidSats = paid.reduce((sum, i) => sum + i.amount_sat, 0);
  const paidFiat = paid.reduce((sum, i) => sum + (i.amount_fiat ?? 0), 0);

  if (isLoading || !portfolioList) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading payments...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">Accept Bitcoin payments with links and invoices</p>
        </div>
        <div className="flex gap-2">
          <Link href="/payments/links/new">
            <Button variant="outline">
              <LinkIcon className="mr-2 h-4 w-4" />
              New Payment Link
            </Button>
          </Link>
          <Link href="/payments/invoices/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* Top-level tabs: Payment Links / Invoices */}
      <Tabs value={topTab} onValueChange={(v) => { setTopTab(v as TopTab); setStatusFilter('all'); }}>
        <TabsList>
          <TabsTrigger value="links">
            <LinkIcon className="mr-2 h-3.5 w-3.5" />
            Payment Links ({links.length})
          </TabsTrigger>
          <TabsTrigger value="invoices">
            <FileText className="mr-2 h-3.5 w-3.5" />
            Invoices ({invoices.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={topTab}>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total</CardTitle>
                {topTab === 'links' ? <LinkIcon className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{currentList.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Active</CardTitle>
                <Clock className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{active.length}</div>
                {active.length > 0 && activeSats > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formatBtc(activeSats)} BTC
                    {activeFiat > 0 && <> &middot; ${activeFiat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Paid</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500">{paid.length}</div>
                {paid.length > 0 && paidSats > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formatBtc(paidSats)} BTC
                    {paidFiat > 0 && <> &middot; ${paidFiat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Expired / Cancelled</CardTitle>
                <AlertCircle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{closed.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Status filter tabs */}
          {currentList.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20">
              {topTab === 'links' ? (
                <>
                  <LinkIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground mb-4">No payment links yet</p>
                  <Link href="/payments/links/new">
                    <Button variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      Create your first payment link
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground mb-4">No invoices yet</p>
                  <Link href="/payments/invoices/new">
                    <Button variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      Create your first invoice
                    </Button>
                  </Link>
                </>
              )}
            </div>
          ) : (
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <TabsList>
                <TabsTrigger value="all">All ({currentList.length})</TabsTrigger>
                <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
                <TabsTrigger value="paid">Paid ({paid.length})</TabsTrigger>
                <TabsTrigger value="closed">Closed ({closed.length})</TabsTrigger>
              </TabsList>

              <TabsContent value={statusFilter}>
                {filtered.length === 0 ? (
                  <div className="flex items-center justify-center rounded-lg border border-dashed py-12">
                    <p className="text-muted-foreground">No items in this category</p>
                  </div>
                ) : topTab === 'links' ? (
                  <PaymentLinksTable
                    items={filtered}
                    copiedId={copiedId}
                    onCopy={copyShareLink}
                    onDelete={(id) => { if (confirm('Delete this payment link?')) deleteItem.mutate(id); }}
                  />
                ) : (
                  <InvoicesTable
                    items={filtered}
                    copiedId={copiedId}
                    onCopy={copyShareLink}
                    onDelete={(id) => { if (confirm('Delete this invoice?')) deleteItem.mutate(id); }}
                  />
                )}
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PaymentLinksTable({
  items,
  copiedId,
  onCopy,
  onDelete,
}: {
  items: Invoice[];
  copiedId: string | null;
  onCopy: (item: Invoice) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reusable</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link href={`/payments/${item.id}`} className="text-sm hover:underline">
                    {item.description || 'Payment Link'}
                  </Link>
                </TableCell>
                <TableCell>
                  {item.amount_sat === 0 ? (
                    <span className="text-sm text-muted-foreground">Open amount</span>
                  ) : (
                    <div>
                      <div className="text-sm font-medium">{formatBtc(item.amount_sat)} BTC</div>
                      {item.amount_fiat != null && (
                        <div className="text-xs text-muted-foreground">
                          {formatFiat(item.amount_fiat, item.fiat_currency)}
                        </div>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(item.status) as 'default'}>
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {item.reusable ? (
                    <Badge variant="outline">Reusable</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">One-time</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{formatDate(item.created_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onCopy(item)} title="Copy share link">
                      {copiedId === item.id ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/payments/${item.id}`}>View</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function InvoicesTable({
  items,
  copiedId,
  onCopy,
  onDelete,
}: {
  items: Invoice[];
  copiedId: string | null;
  onCopy: (item: Invoice) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>
                  <Link href={`/payments/${inv.id}`} className="font-mono text-sm hover:underline">
                    {inv.invoice_number}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{inv.customer_name}</div>
                  {inv.customer_email && (
                    <div className="text-xs text-muted-foreground">{inv.customer_email}</div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{formatBtc(inv.amount_sat)} BTC</div>
                  {inv.amount_fiat != null && (
                    <div className="text-xs text-muted-foreground">
                      {formatFiat(inv.amount_fiat, inv.fiat_currency)}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(inv.status) as 'default'}>{inv.status}</Badge>
                </TableCell>
                <TableCell className="text-sm">{formatDate(inv.created_at)}</TableCell>
                <TableCell className="text-sm">{formatDate(inv.due_at)}</TableCell>
                <TableCell className="text-sm">
                  {inv.paid_at ? (
                    <span className="text-green-500 font-medium">{formatDate(inv.paid_at)}</span>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onCopy(inv)} title="Copy share link">
                      {copiedId === inv.id ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(inv.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/payments/${inv.id}`}>View</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
