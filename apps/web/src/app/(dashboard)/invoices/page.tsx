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
import { Plus, FileText, Copy, Check, Trash2, Clock, CheckCircle, AlertCircle } from 'lucide-react';

type TabValue = 'all' | 'outstanding' | 'paid' | 'closed';

const statusVariant = (status: string) => {
  switch (status) {
    case 'paid': return 'default';
    case 'sent': return 'secondary';
    case 'expired': return 'destructive';
    case 'cancelled': return 'outline';
    default: return 'secondary';
  }
};

function filterInvoices(list: Invoice[], tab: TabValue): Invoice[] {
  switch (tab) {
    case 'outstanding':
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

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabValue>('all');

  const { data: portfolioList } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfolioApi.list(),
  });
  const portfolioId = portfolioList?.[0]?.id;

  const { data: invoiceList, isLoading } = useQuery({
    queryKey: ['invoices', portfolioId],
    queryFn: () => invoiceApi.list(portfolioId!),
    enabled: !!portfolioId,
  });

  const deleteInvoice = useMutation({
    mutationFn: (invoiceId: string) => invoiceApi.delete(portfolioId!, invoiceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  });

  const copyShareLink = (invoice: { id: string; share_token: string }) => {
    const url = `${window.location.origin}/pay/${invoice.share_token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(invoice.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const allInvoices = invoiceList ?? [];
  const outstanding = allInvoices.filter((i) => i.status === 'draft' || i.status === 'sent');
  const paid = allInvoices.filter((i) => i.status === 'paid');
  const closed = allInvoices.filter((i) => i.status === 'expired' || i.status === 'cancelled');

  const outstandingSats = outstanding.reduce((sum, i) => sum + i.amount_sat, 0);
  const outstandingFiat = outstanding.reduce((sum, i) => sum + (i.amount_fiat ?? 0), 0);
  const paidSats = paid.reduce((sum, i) => sum + i.amount_sat, 0);
  const paidFiat = paid.reduce((sum, i) => sum + (i.amount_fiat ?? 0), 0);

  const filtered = filterInvoices(allInvoices, tab);

  if (isLoading || !portfolioList) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading invoices...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">Create and manage Bitcoin invoices</p>
        </div>
        <Link href="/invoices/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Invoice
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allInvoices.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{outstanding.length}</div>
            {outstanding.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatBtc(outstandingSats)} BTC
                {outstandingFiat > 0 && <> &middot; ${outstandingFiat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>}
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
            {paid.length > 0 && (
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

      {/* Tabs + Table */}
      {allInvoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20">
          <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground mb-4">No invoices yet</p>
          <Link href="/invoices/new">
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Create your first invoice
            </Button>
          </Link>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
          <TabsList>
            <TabsTrigger value="all">
              All ({allInvoices.length})
            </TabsTrigger>
            <TabsTrigger value="outstanding">
              Outstanding ({outstanding.length})
            </TabsTrigger>
            <TabsTrigger value="paid">
              Paid ({paid.length})
            </TabsTrigger>
            <TabsTrigger value="closed">
              Expired / Cancelled ({closed.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tab}>
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed py-12">
                <p className="text-muted-foreground">No invoices in this category</p>
              </div>
            ) : (
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
                      {filtered.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell>
                            <Link href={`/invoices/${inv.id}`} className="font-mono text-sm hover:underline">
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
                            <div className="text-sm font-medium">
                              {formatBtc(inv.amount_sat)} BTC
                            </div>
                            {inv.amount_fiat != null && (
                              <div className="text-xs text-muted-foreground">
                                {formatFiat(inv.amount_fiat, inv.fiat_currency)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(inv.status) as 'default'}>
                              {inv.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(inv.created_at)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(inv.due_at)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {inv.paid_at ? (
                              <span className="text-green-500 font-medium">
                                {formatDate(inv.paid_at)}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyShareLink(inv)}
                                title="Copy share link"
                              >
                                {copiedId === inv.id ? (
                                  <Check className="h-3.5 w-3.5 text-green-500" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm('Delete this invoice?')) {
                                    deleteInvoice.mutate(inv.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                              <Button variant="ghost" size="sm" asChild>
                                <Link href={`/invoices/${inv.id}`}>View</Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
