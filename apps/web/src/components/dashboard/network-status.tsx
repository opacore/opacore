'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@opacore/ui';
import { Radio, Fuel } from 'lucide-react';

interface FeeEstimates {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

const NEXT_HALVING_BLOCK = 1_050_000;

export function NetworkStatus() {
  const { data: blockHeight } = useQuery({
    queryKey: ['network', 'block-height'],
    queryFn: async () => {
      const res = await fetch('https://mempool.space/api/blocks/tip/height');
      if (!res.ok) throw new Error('Failed to fetch block height');
      return res.json() as Promise<number>;
    },
    refetchInterval: 60_000,
  });

  const { data: fees } = useQuery({
    queryKey: ['network', 'fees'],
    queryFn: async () => {
      const res = await fetch('https://mempool.space/api/v1/fees/recommended');
      if (!res.ok) throw new Error('Failed to fetch fees');
      return res.json() as Promise<FeeEstimates>;
    },
    refetchInterval: 60_000,
  });

  const blocksToHalving = blockHeight != null ? NEXT_HALVING_BLOCK - blockHeight : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Network Status</CardTitle>
        <Radio className="h-4 w-4 text-green-500" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Block Height */}
          <div>
            <p className="text-xs text-muted-foreground">Block Height</p>
            <p className="text-2xl font-bold tabular-nums">
              {blockHeight != null ? blockHeight.toLocaleString() : '—'}
            </p>
            {blocksToHalving != null && blocksToHalving > 0 && (
              <p className="text-xs text-muted-foreground">
                ~{blocksToHalving.toLocaleString()} blocks to halving
              </p>
            )}
          </div>

          {/* Fee Rates */}
          <div className="border-t pt-3">
            <div className="flex items-center gap-1 mb-2">
              <Fuel className="h-3 w-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Fee Rates (sat/vB)</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md bg-accent/50 p-2 text-center">
                <p className="text-xs text-muted-foreground">Economy</p>
                <p className="text-sm font-bold tabular-nums">
                  {fees?.economyFee ?? '—'}
                </p>
              </div>
              <div className="rounded-md bg-accent/50 p-2 text-center">
                <p className="text-xs text-muted-foreground">Normal</p>
                <p className="text-sm font-bold tabular-nums">
                  {fees?.halfHourFee ?? '—'}
                </p>
              </div>
              <div className="rounded-md bg-accent/50 p-2 text-center">
                <p className="text-xs text-muted-foreground">Priority</p>
                <p className="text-sm font-bold tabular-nums">
                  {fees?.fastestFee ?? '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
