import { NextRequest, NextResponse } from 'next/server';

// Node.js runtime — no 30-second Edge Runtime limit
export const runtime = 'nodejs';
// Allow up to 5 minutes for long wallet scans
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ portfolioId: string; walletId: string }> }
) {
  const { portfolioId, walletId } = await params;
  const apiUrl = process.env.API_URL || 'http://localhost:4000';
  const target = `${apiUrl}/api/v1/portfolios/${portfolioId}/wallets/${walletId}/sync${request.nextUrl.search}`;

  const headers = new Headers(request.headers);
  headers.set('x-forwarded-host', request.headers.get('host') || '');

  const body = await request.text();

  const response = await fetch(target, {
    method: 'POST',
    headers,
    body: body || undefined,
    signal: AbortSignal.timeout(290_000),
  });

  const responseBody = await response.text();
  return new NextResponse(responseBody, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
  });
}
