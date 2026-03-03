'use client';

import { useEffect, useState } from 'react';
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
  CreditCard,
  Server,
  Shield,
  Bell,
  Calculator,
  Zap,
  Pickaxe,
  Code,
  Bot,
  ScrollText,
  Repeat,
  Gauge,
  Lock,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@opacore/ui';

const activeTools = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/wallets', label: 'Wallets', icon: HardDrive },
  { href: '/portfolios', label: 'Portfolios', icon: Wallet },
  { href: '/payments', label: 'Payments', icon: CreditCard },
  { href: '/fee-estimator', label: 'Fee Estimator', icon: Gauge },
  { href: '/dca-tracker', label: 'DCA Tracker', icon: Repeat },
  { href: '/tax-reports', label: 'Tax Reports', icon: Calculator },
  { href: '/alerts', label: 'Alerts', icon: Bell },
];

const plannedTools = [
  { label: 'Node Monitor', icon: Server },
  { label: 'Coin Control', icon: Shield },
  { label: 'Nostr', icon: Zap },
  { label: 'Mining', icon: Pickaxe },
  { label: 'API', icon: Code },
  { label: 'Opacore Agent', icon: Bot },
  { label: 'Inheritance', icon: ScrollText },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Remove dark mode class if set
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

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

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center gap-2 border-b px-6">
        <img src="/logo.jpg" alt="Opacore" className="h-9 w-9 object-contain mix-blend-multiply" />
        <span className="text-lg font-bold">opacore</span>
        {/* Close button — mobile only */}
        <button
          className="ml-auto lg:hidden text-muted-foreground"
          onClick={() => setSidebarOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
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

        <div className="my-4 border-t" />

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

        <div className="my-4 border-t" />

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
        <div className="mb-3 px-3 text-sm text-muted-foreground truncate">
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
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed on mobile, static on desktop */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="flex min-h-screen flex-1 flex-col overflow-auto">
        {/* Mobile top bar */}
        <div className="flex h-14 items-center gap-3 border-b bg-card px-4 lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground">
            <Menu className="h-5 w-5" />
          </button>
          <img src="/logo.jpg" alt="Opacore" className="h-7 w-7 object-contain mix-blend-multiply" />
          <span className="font-bold">opacore</span>
        </div>

        <div className="flex-1 p-4 lg:p-6">
          <div className="mx-auto max-w-screen-xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
