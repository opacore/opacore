import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@opacore/ui'],
  async redirects() {
    return [
      { source: '/invoices', destination: '/payments', permanent: false },
      { source: '/invoices/new', destination: '/payments/invoices/new', permanent: false },
      { source: '/invoices/:id', destination: '/payments/:id', permanent: false },
    ];
  },
};

export default nextConfig;
