'use client';

import { useQuery } from '@tanstack/react-query';
import { transactions as txApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@opacore/ui';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Activity } from 'lucide-react';

export function TransactionActivity({ portfolioId }: { portfolioId: string | undefined }) {
  const { data: txs, isLoading } = useQuery({
    queryKey: ['transactions', portfolioId, 'activity'],
    queryFn: () => txApi.list({ portfolioId: portfolioId!, limit: 200 }),
    enabled: !!portfolioId,
  });

  // Group transactions by month
  const monthlyData: Record<string, { receive: number; send: number }> = {};
  (txs ?? []).forEach((tx) => {
    const date = new Date(tx.transacted_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyData[key]) monthlyData[key] = { receive: 0, send: 0 };
    const btc = tx.amount_sat / 1e8;
    if (tx.tx_type === 'receive' || tx.tx_type === 'buy') {
      monthlyData[key].receive += btc;
    } else {
      monthlyData[key].send += btc;
    }
  });

  const chartData = Object.entries(monthlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, data]) => ({
      month,
      label: new Date(month + '-01').toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
      receive: parseFloat(data.receive.toFixed(8)),
      send: parseFloat(data.send.toFixed(8)),
    }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Transaction Activity</CardTitle>
        <Activity className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-muted-foreground text-sm">Loading...</p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-muted-foreground text-sm">No transaction data</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v) => `${v}`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value.toFixed(8)} BTC`,
                  name === 'receive' ? 'Received' : 'Sent',
                ]}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              />
              <Legend
                iconSize={8}
                wrapperStyle={{ fontSize: '11px' }}
              />
              <Bar dataKey="receive" name="Received" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
              <Bar dataKey="send" name="Sent" fill="hsl(var(--chart-2))" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
