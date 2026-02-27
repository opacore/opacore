'use client';

import { useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoices as invoiceApi, portfolios as portfolioApi } from '@/lib/api';
import {
  Button, Badge, Card, CardContent, CardHeader, CardTitle,
} from '@opacore/ui';
import {
  ArrowLeft, Copy, Check, ExternalLink, RefreshCw, Send,
  XCircle, Trash2,
} from 'lucide-react';

const statusVariant = (status: string) => {
  switch (status) {
    case 'paid': return 'default';
    case 'sent': return 'secondary';
    case 'expired': return 'destructive';
    case 'cancelled': return 'outline';
    default: return 'secondary';
  }
};

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data: portfolioList } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfolioApi.list(),
  });
  const portfolioId = portfolioList?.[0]?.id;

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', portfolioId, id],
    queryFn: () => invoiceApi.get(portfolioId!, id),
    enabled: !!portfolioId,
  });

  const updateInvoice = useMutation({
    mutationFn: (data: { status?: string }) =>
      invoiceApi.update(portfolioId!, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', portfolioId, id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const checkPayment = useMutation({
    mutationFn: () => invoiceApi.checkPayment(portfolioId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', portfolioId, id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const deleteInvoice = useMutation({
    mutationFn: () => invoiceApi.delete(portfolioId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      router.push('/invoices');
    },
  });

  const copyShareLink = () => {
    if (!invoice) return;
    const url = `${window.location.origin}/pay/${invoice.share_token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyAddress = () => {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice.btc_address);
  };

  if (isLoading || !portfolioList) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading invoice...</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Invoice not found</p>
      </div>
    );
  }

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/pay/${invoice.share_token}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/invoices">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight font-mono">
              {invoice.invoice_number}
            </h1>
            <Badge variant={statusVariant(invoice.status) as 'default'} className="text-sm">
              {invoice.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">{invoice.customer_name}</p>
        </div>
      </div>

      {/* Amount & Details */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {(invoice.amount_sat / 1e8).toFixed(8)} BTC
            </div>
            <p className="text-sm text-muted-foreground">
              {invoice.amount_sat.toLocaleString()} sats
            </p>
            {invoice.amount_fiat != null && (
              <p className="text-sm text-muted-foreground mt-1">
                ${invoice.amount_fiat.toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.fiat_currency.toUpperCase()}
                {invoice.btc_price_at_creation && (
                  <> @ ${invoice.btc_price_at_creation.toLocaleString()}/BTC</>
                )}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Dates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(invoice.created_at).toLocaleDateString()}</span>
            </div>
            {invoice.due_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Due</span>
                <span>{new Date(invoice.due_at).toLocaleDateString()}</span>
              </div>
            )}
            {invoice.expires_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Expires</span>
                <span>{new Date(invoice.expires_at).toLocaleDateString()}</span>
              </div>
            )}
            {invoice.paid_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="text-green-500 font-medium">
                  {new Date(invoice.paid_at).toLocaleDateString()}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* BTC Address */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Payment Address</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-accent px-3 py-2 text-sm font-mono break-all">
              {invoice.btc_address}
            </code>
            <Button variant="ghost" size="sm" onClick={copyAddress}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payment Info (if paid) */}
      {invoice.paid_txid && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-green-500">Payment Received</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Transaction:</span>
              <a
                href={`https://mempool.space/tx/${invoice.paid_txid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono hover:underline flex items-center gap-1"
              >
                {invoice.paid_txid.slice(0, 16)}...
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            {invoice.paid_amount_sat != null && (
              <div className="text-sm">
                <span className="text-muted-foreground">Amount received: </span>
                {(invoice.paid_amount_sat / 1e8).toFixed(8)} BTC
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Share Link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Share Link</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-accent px-3 py-2 text-sm break-all">
              {shareUrl}
            </code>
            <Button variant="outline" size="sm" onClick={copyShareLink}>
              {copied ? (
                <><Check className="h-4 w-4 mr-1 text-green-500" /> Copied</>
              ) : (
                <><Copy className="h-4 w-4 mr-1" /> Copy</>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Send this link to your customer. They can view the invoice and pay via QR code.
          </p>
        </CardContent>
      </Card>

      {/* Description */}
      {invoice.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{invoice.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {invoice.status === 'draft' && (
          <Button
            onClick={() => updateInvoice.mutate({ status: 'sent' })}
            disabled={updateInvoice.isPending}
          >
            <Send className="h-4 w-4 mr-2" />
            Mark as Sent
          </Button>
        )}
        {(invoice.status === 'sent' || invoice.status === 'draft') && (
          <Button
            variant="outline"
            onClick={() => checkPayment.mutate()}
            disabled={checkPayment.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${checkPayment.isPending ? 'animate-spin' : ''}`} />
            Check Payment
          </Button>
        )}
        {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
          <Button
            variant="outline"
            onClick={() => updateInvoice.mutate({ status: 'cancelled' })}
            disabled={updateInvoice.isPending}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        )}
        <Button
          variant="destructive"
          onClick={() => {
            if (confirm('Are you sure you want to delete this invoice?')) {
              deleteInvoice.mutate();
            }
          }}
          disabled={deleteInvoice.isPending}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </div>
    </div>
  );
}
