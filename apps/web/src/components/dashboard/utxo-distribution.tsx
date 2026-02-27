'use client';

import { useQuery } from '@tanstack/react-query';
import { wallets } from '@/lib/api';
import type { UtxoInfo } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@opacore/ui';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Layers } from 'lucide-react';

const BUCKETS = [
  { label: '< 10k', max: 10_000 },
  { label: '10k–100k', max: 100_000 },
  { label: '100k–1M', max: 1_000_000 },
  { label: '1M–10M', max: 10_000_000 },
  { label: '> 10M', max: Infinity },
];

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function UtxoDistribution({ portfolioId }: { portfolioId: string | undefined }) {
  const { data: walletList } = useQuery({
    queryKey: ['wallets', portfolioId],
    queryFn: () => wallets.list(portfolioId!),
    enabled: !!portfolioId,
  });

  // Fetch UTXOs for the first wallet (avoid excessive API calls)
  const firstWalletId = walletList?.[0]?.id;
  const { data: utxoData, isLoading } = useQuery({
    queryKey: ['utxos', portfolioId, firstWalletId],
    queryFn: () => wallets.utxos(portfolioId!, firstWalletId!),
    enabled: !!portfolioId && !!firstWalletId,
  });

  const allUtxos: UtxoInfo[] = utxoData?.utxos ?? [];

  // Bucket UTXOs by size
  const bucketCounts = BUCKETS.map((bucket) => {
    const prev = BUCKETS[BUCKETS.indexOf(bucket) - 1];
    const min = prev ? prev.max : 0;
    const count = allUtxos.filter((u) => u.value_sat >= min && u.value_sat < bucket.max).length;
    return { name: bucket.label, value: count };
  }).filter((b) => b.value > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">UTXO Distribution</CardTitle>
        <Layers className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-muted-foreground text-sm">Loading...</p>
          </div>
        ) : bucketCounts.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-muted-foreground text-sm text-center">
              Sync a wallet to see UTXO data
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={bucketCounts}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={3}
                dataKey="value"
              >
                {bucketCounts.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [`${value} UTXOs`, name]}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              />
              <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
