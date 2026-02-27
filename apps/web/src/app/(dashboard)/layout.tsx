'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from '@/lib/auth';
import { Button } from '@opacore/ui';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  HardDrive,
  Settings,
  LogOut,
  FileText,
  CreditCard,
  Server,
  Shield,
  Bell,
  Calculator,
  Zap,
  Pickaxe,
  Code,
  Bot,
  KeyRound,
  ScrollText,
  Repeat,
  Gauge,
  Lock,
} from 'lucide-react';
import { cn } from '@opacore/ui';

const activeTools = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/wallets', label: 'Wallets', icon: HardDrive },
  { href: '/portfolios', label: 'Portfolios', icon: Wallet },
  { href: '/payments', label: 'Payments', icon: CreditCard },
];

const plannedTools = [
  { label: 'Node Monitor', icon: Server },
  { label: 'Coin Control', icon: Shield },
  { label: 'Alerts', icon: Bell },
  { label: 'Tax Reports', icon: Calculator },
  { label: 'Nostr', icon: Zap },
  { label: 'Mining', icon: Pickaxe },
  { label: 'API', icon: Code },
  { label: 'Opacore Agent', icon: Bot },
  { label: 'Multisig', icon: KeyRound },
  { label: 'Inheritance', icon: ScrollText },
  { label: 'DCA Tracker', icon: Repeat },
  { label: 'Fee Estimator', icon: Gauge },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();

  // Remove dark mode class if set
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!session) {
    router.push('/login');
    return null;
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r bg-card">
        <div className="flex h-14 items-center gap-2 border-b px-6">
          <img src="/logo.jpg" alt="Opacore" className="h-9 w-9 object-contain mix-blend-multiply" />
          <span className="text-lg font-bold">opacore</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          {/* Active tools */}
          <div className="space-y-1">
            {activeTools.map((item) => {
              const isActive =
                item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Divider */}
          <div className="my-4 border-t" />

          {/* Planned tools (coming soon) */}
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Coming Soon
          </div>
          <div className="space-y-1">
            {plannedTools.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/50 cursor-default"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                <Lock className="ml-auto h-3 w-3" />
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="my-4 border-t" />

          {/* Settings */}
          <Link
            href="/settings"
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith('/settings')
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </nav>

        <div className="border-t p-4">
          <div className="mb-3 px-3 text-sm text-muted-foreground">
            {session.user.email}
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground"
            onClick={async () => {
              await signOut();
              router.push('/');
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-6">{children}</div>
      </main>
    </div>
  );
}
