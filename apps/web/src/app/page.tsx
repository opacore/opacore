import Link from 'next/link';
import {
  ArrowLeftRight,
  Wallet,
  FileText,
  CreditCard,
  Server,
  Shield,
  Bell,
  Calculator,
  Zap,
  Pickaxe,
  Code,
  ArrowRight,
  Github,
} from 'lucide-react';

const tools = [
  {
    icon: Wallet,
    name: 'Portfolio Tracker',
    description: 'Track your Bitcoin holdings across wallets, view real-time value, and monitor performance.',
  },
  {
    icon: ArrowLeftRight,
    name: 'Transaction Manager',
    description: 'Record purchases, sales, sends, and receives with automatic price lookups and gain/loss tracking.',
  },
  {
    icon: FileText,
    name: 'Invoicing',
    description: 'Generate and manage invoices with on-chain and Lightning payment options.',
  },
  {
    icon: CreditCard,
    name: 'Payment Processor',
    description: 'Accept Bitcoin payments with webhooks, POS integration, and payment status tracking.',
  },
  {
    icon: Server,
    name: 'Node Monitor',
    description: 'Monitor your Bitcoin Core, LND, or CLN node with real-time stats and alerts.',
  },
  {
    icon: Shield,
    name: 'Privacy & Coin Control',
    description: 'UTXO management, coin selection, and PSBT support for privacy-conscious transactions.',
  },
  {
    icon: Bell,
    name: 'Alerts & Notifications',
    description: 'Price alerts, transaction notifications, and custom triggers for your Bitcoin activity.',
  },
  {
    icon: Calculator,
    name: 'Tax Reports',
    description: 'Generate Form 8949, capital gains summaries, and CSV exports for tax compliance.',
  },
  {
    icon: Zap,
    name: 'Nostr Integration',
    description: 'Nostr Wallet Connect, zaps, and social payments built into your workflow.',
  },
  {
    icon: Pickaxe,
    name: 'Mining Monitor',
    description: 'Track hashrate, earnings, pool performance, and mining hardware status.',
  },
  {
    icon: Code,
    name: 'API Layer',
    description: 'REST and GraphQL endpoints to build your own integrations and automations.',
  },
];

function OpacoreLogo() {
  // Placeholder: replace src with actual logo file when available
  // To replace: drop your logo into /public/logo.svg and update the src below
  return (
    <div className="mb-10 flex h-16 w-16 items-center justify-center text-4xl font-bold text-[#F7931A]">
      ✳
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF7F2' }}>
      {/* Hero Section */}
      <section className="flex min-h-screen flex-col items-center justify-center px-4">
        <OpacoreLogo />

        <h1
          className="text-center text-5xl font-bold tracking-tight text-[#1a1a1a] sm:text-6xl md:text-7xl"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Bitcoin is for the world
        </h1>

        <p className="mt-6 text-center text-lg text-[#666] sm:text-xl">
          opacore is a complete operating system for bitcoiners
        </p>

        <div className="mt-10 flex gap-4">
          <a
            href="https://github.com/opacore/opacore"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2.5 rounded-lg bg-[#1a1a1a] px-7 text-sm font-medium text-white transition-colors hover:bg-[#333]"
          >
            <Github className="h-4 w-4" />
            Github
          </a>
          <a
            href="#tools"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#F7931A] px-7 text-sm font-medium text-white transition-colors hover:bg-[#e8850f]"
          >
            Explore opacore
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* Tools Section */}
      <section id="tools" className="px-4 pb-24 pt-16">
        <div className="mx-auto max-w-4xl">
          <div className="mb-16 text-center">
            <h2
              className="text-3xl font-bold tracking-tight text-[#1a1a1a] sm:text-4xl"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              Everything you need, one platform
            </h2>
            <p className="mt-4 text-lg text-[#666]">
              Each tool works on its own. Together, they become your complete Bitcoin operating system.
            </p>
          </div>

          <div className="space-y-4">
            {tools.map((tool) => (
              <div
                key={tool.name}
                className="flex items-start gap-5 rounded-xl border border-[#e8e4de] bg-white p-6 transition-colors hover:border-[#F7931A]/40"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F7931A]/10">
                  <tool.icon className="h-5 w-5 text-[#F7931A]" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[#1a1a1a]">{tool.name}</h3>
                  <p className="mt-1 text-sm text-[#666]">{tool.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-[#e8e4de] px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="text-2xl font-bold text-[#1a1a1a] sm:text-3xl"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Ready to get started?
          </h2>
          <p className="mt-3 text-[#666]">
            Self-host for free or use the managed version. Your keys, your data, your choice.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-[#F7931A] px-8 text-sm font-medium text-white transition-colors hover:bg-[#e8850f]"
            >
              Create Account
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-[#e8e4de] bg-white px-8 text-sm font-medium text-[#1a1a1a] transition-colors hover:bg-[#f5f2ed]"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e8e4de] px-4 py-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between text-sm text-[#999]">
          <span>opacore</span>
          <span>Open source. MIT License.</span>
        </div>
      </footer>
    </div>
  );
}
