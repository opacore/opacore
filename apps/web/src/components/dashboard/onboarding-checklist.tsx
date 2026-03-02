'use client';

import Link from 'next/link';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@opacore/ui';
import type { Wallet } from '@/lib/api';
import type { Transaction } from '@/lib/api';

interface Step {
  id: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
}

interface Props {
  wallets: Wallet[] | undefined;
  transactions: Transaction[] | undefined;
}

export function OnboardingChecklist({ wallets, transactions }: Props) {
  const hasWallet = (wallets?.length ?? 0) > 0;
  const hasSynced = wallets?.some((w) => !!w.last_synced_at) ?? false;
  const hasTransactions = (transactions?.length ?? 0) > 0;

  // Don't show once fully set up
  if (hasWallet && hasSynced && hasTransactions) return null;

  const steps: Step[] = [
    {
      id: 'import',
      title: 'Import a wallet',
      description: 'Connect a watch-only wallet using an xpub, descriptor, or config file from Sparrow, Unchained, or Coldcard.',
      href: '/wallets/import',
      cta: 'Import Wallet',
      done: hasWallet,
    },
    {
      id: 'sync',
      title: 'Sync your transactions',
      description: 'Opacore scans the blockchain for your transaction history and attaches historical USD prices automatically.',
      href: '/wallets',
      cta: 'Go to Wallets',
      done: hasSynced,
    },
    {
      id: 'explore',
      title: 'Explore your data',
      description: 'Review your transactions, check your DCA performance, and download your tax report.',
      href: '/transactions',
      cta: 'View Transactions',
      done: hasTransactions,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);

  return (
    <Card className="border-orange-200 bg-orange-50/40">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Get started with Opacore</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Complete {steps.length - completedCount} more step{steps.length - completedCount !== 1 ? 's' : ''} to set up your Bitcoin portfolio
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {steps.map((s) => (
              <div
                key={s.id}
                className={`h-2 w-8 rounded-full transition-colors ${s.done ? 'bg-orange-400' : 'bg-orange-100 border border-orange-200'}`}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                step.done
                  ? 'border-green-200 bg-white/60'
                  : step.id === nextStep?.id
                    ? 'border-orange-300 bg-white shadow-sm'
                    : 'border-transparent bg-white/40'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {step.done ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : step.id === nextStep?.id ? (
                  <Circle className="h-5 w-5 text-orange-400" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/30" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${step.done ? 'line-through text-muted-foreground' : ''}`}>
                  {step.title}
                </p>
                {!step.done && (
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                )}
              </div>
              {!step.done && step.id === nextStep?.id && (
                <Link
                  href={step.href}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md bg-[#F7931A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e8850f] transition-colors"
                >
                  {step.cta}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
