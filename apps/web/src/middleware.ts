import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const apiUrl = process.env.API_URL || 'http://localhost:4000';
  const url = request.nextUrl.clone();

  // Proxy /api/v1/* requests to the Rust backend
  // Skip sync endpoint — handled by a dedicated API route with a longer timeout
  if (url.pathname.startsWith('/api/v1/') && !url.pathname.endsWith('/sync')) {
    const target = `${apiUrl}${url.pathname}${url.search}`;

    const headers = new Headers(request.headers);
    // Forward the original host for CORS
    headers.set('x-forwarded-host', request.headers.get('host') || '');

    return NextResponse.rewrite(new URL(target), {
      request: { headers },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/v1/:path*',
};
