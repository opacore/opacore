'use client';

import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoices as invoiceApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@opacore/ui';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, ExternalLink, CheckCircle, XCircle, Clock } from 'lucide-react';

export default function PublicPayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [copied, setCopied] = useState(false);

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['public-invoice', token],
    queryFn: () => invoiceApi.publicGet(token),
    refetchInterval: 15_000,
  });

  const copyAddress = () => {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice.btc_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Not Found</h2>
            <p className="text-sm text-muted-foreground">
              This payment link may be invalid or has been removed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPaymentLink = invoice.type === 'payment_link';
  const isOpenAmount = invoice.amount_sat === 0;
  const btcAmount = (invoice.amount_sat / 1e8).toFixed(8);
  const bitcoinUri = isOpenAmount
    ? `bitcoin:${invoice.btc_address}`
    : `bitcoin:${invoice.btc_address}?amount=${btcAmount}`;

  // Expiry countdown
  let expiryText = '';
  if (invoice.expires_at && invoice.status !== 'paid') {
    const expiresAt = new Date(invoice.expires_at);
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();
    if (diff > 0) {
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      expiryText = days > 0 ? `Expires in ${days}d ${hours}h` : `Expires in ${hours}h`;
    }
  }

  const showQr = invoice.status !== 'expired' && invoice.status !== 'cancelled'
    && (invoice.status !== 'paid' || invoice.reusable);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold">opacore</h1>
          <p className="text-sm text-muted-foreground">
            {isPaymentLink ? 'Bitcoin Payment' : 'Bitcoin Invoice'}
          </p>
        </div>

        {/* Status Banner */}
        {invoice.status === 'paid' && (
          <Card className="border-green-500/50 bg-green-500/5">
            <CardContent className="pt-6 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
              <h2 className="text-lg font-semibold text-green-500">Payment Received</h2>
              {invoice.paid_txid && (
                <a
                  href={`https://mempool.space/tx/${invoice.paid_txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:underline flex items-center justify-center gap-1 mt-1"
                >
                  View transaction <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {invoice.reusable && (
                <p className="text-xs text-muted-foreground mt-2">
                  This link continues to accept payments.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {invoice.status === 'expired' && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6 text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
              <h2 className="text-lg font-semibold text-destructive">
                {isPaymentLink ? 'Payment Link Expired' : 'Invoice Expired'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                This {isPaymentLink ? 'payment link' : 'invoice'} is no longer accepting payments.
              </p>
            </CardContent>
          </Card>
        )}

        {invoice.status === 'cancelled' && (
          <Card className="border-muted">
            <CardContent className="pt-6 text-center">
              <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
              <h2 className="text-lg font-semibold">
                {isPaymentLink ? 'Payment Link Cancelled' : 'Invoice Cancelled'}
              </h2>
            </CardContent>
          </Card>
        )}

        {/* Details */}
        <Card>
          <CardHeader className="text-center pb-2">
            {!isPaymentLink && invoice.invoice_number && (
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Invoice #{invoice.invoice_number}
              </CardTitle>
            )}
            {!isPaymentLink && invoice.customer_name && (
              <p className="text-sm">For: {invoice.customer_name}</p>
            )}
            {invoice.description && (
              <p className="text-sm text-muted-foreground">{invoice.description}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Amount */}
            {isOpenAmount ? (
              <div className="text-center">
                <div className="text-2xl font-bold text-muted-foreground">Pay Any Amount</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Send any amount to the address below
                </p>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-3xl font-bold">{btcAmount} BTC</div>
                <p className="text-sm text-muted-foreground">
                  {invoice.amount_sat.toLocaleString()} sats
                </p>
                {invoice.amount_fiat != null && (
                  <p className="text-sm text-muted-foreground">
                    ${invoice.amount_fiat.toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.fiat_currency.toUpperCase()}
                  </p>
                )}
              </div>
            )}

            {/* QR Code */}
            {showQr && (
              <div className="flex justify-center py-4">
                <div className="rounded-lg border p-4 bg-white">
                  <QRCodeSVG
                    value={bitcoinUri}
                    size={220}
                    level="M"
                    includeMargin={false}
                  />
                </div>
              </div>
            )}

            {/* BTC Address */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">Payment Address</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-accent px-3 py-2 text-xs font-mono break-all text-center">
                  {invoice.btc_address}
                </code>
                <Button variant="ghost" size="sm" onClick={copyAddress}>
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Expiry */}
            {expiryText && (
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {expiryText}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Powered by opacore &mdash; Non-custodial Bitcoin payments
        </p>
      </div>
    </div>
  );
}
