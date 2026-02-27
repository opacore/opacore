'use client';

import { useQuery } from '@tanstack/react-query';
import { prices } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@opacore/ui';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

export function PriceChart() {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { data: priceData, isLoading } = useQuery({
    queryKey: ['prices', 'range', start, end],
    queryFn: () => prices.range(start, end),
  });

  const chartData = (priceData ?? []).map((p) => ({
    date: p.date,
    price: p.price,
  }));

  const minPrice = chartData.length > 0
    ? Math.floor(Math.min(...chartData.map((d) => d.price)) * 0.995)
    : 0;
  const maxPrice = chartData.length > 0
    ? Math.ceil(Math.max(...chartData.map((d) => d.price)) * 1.005)
    : 100000;

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Bitcoin Price (30d)</CardTitle>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-muted-foreground text-sm">Loading chart...</p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-muted-foreground text-sm">No price data available</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(36, 93%, 53%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(36, 93%, 53%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[minPrice, maxPrice]}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip
                labelFormatter={(d) => new Date(d).toLocaleDateString()}
                formatter={(value: number) => [`$${value.toLocaleString()}`, 'BTC Price']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="hsl(36, 93%, 53%)"
                strokeWidth={2}
                fill="url(#priceGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
