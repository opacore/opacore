'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@opacore/ui';
import { Lock, type LucideIcon } from 'lucide-react';

interface PlaceholderCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function PlaceholderCard({ title, description, icon: Icon }: PlaceholderCardProps) {
  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground/50" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center py-4 gap-2">
          <Lock className="h-3.5 w-3.5 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground/60">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
