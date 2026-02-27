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
  Bot,
  KeyRound,
  ScrollText,
  Repeat,
  Gauge,
  Github,
} from 'lucide-react';

const liveTools = [
  { icon: Wallet, name: 'Portfolio Tracker' },
  { icon: ArrowLeftRight, name: 'Transactions' },
  { icon: Calculator, name: 'Tax Reports' },
];

const comingSoon = [
  { icon: FileText, name: 'Invoicing' },
  { icon: CreditCard, name: 'Payments' },
  { icon: Server, name: 'Node Monitor' },
  { icon: Shield, name: 'Coin Control' },
  { icon: Bell, name: 'Alerts' },
  { icon: Zap, name: 'Nostr' },
  { icon: Pickaxe, name: 'Mining' },
  { icon: Code, name: 'API' },
  { icon: Bot, name: 'Opacore Agent' },
  { icon: KeyRound, name: 'Multisig' },
  { icon: ScrollText, name: 'Inheritance' },
  { icon: Repeat, name: 'DCA Tracker' },
  { icon: Gauge, name: 'Fee Estimator' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF7F2' }}>
      {/* Hero */}
      <section className="flex min-h-screen flex-col items-center justify-center px-4">
        <img
          src="/logo.jpg"
          alt="Opacore"
          className="mb-6 h-48 w-48 object-contain mix-blend-multiply"
        />

        <p className="mb-10 text-2xl font-bold tracking-wide text-[#1a1a1a]">opacore</p>

        <h1
          className="max-w-3xl text-center text-5xl font-black tracking-tight text-[#1a1a1a] sm:text-6xl md:text-7xl"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Your bitcoin.
          <br />
          Your rules.
        </h1>

        <p className="mt-8 max-w-lg text-center text-lg leading-relaxed text-[#555]">
          Open-source operating system for bitcoiners.
          <br />
          Track, manage, and control — no altcoins, no compromise.
        </p>

        <div className="mt-12 flex gap-4">
          <Link
            href="/register"
            className="inline-flex h-13 items-center justify-center rounded-lg bg-[#F7931A] px-8 text-base font-semibold text-white transition-all hover:bg-[#e8850f] hover:shadow-lg hover:shadow-[#F7931A]/20"
          >
            Get Started
          </Link>
          <a
            href="https://github.com/opacore/opacore"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-13 items-center justify-center gap-2.5 rounded-lg border-2 border-[#1a1a1a] px-8 text-base font-semibold text-[#1a1a1a] transition-colors hover:bg-[#1a1a1a] hover:text-white"
          >
            <Github className="h-5 w-5" />
            Source
          </a>
        </div>
      </section>

      {/* What's Live */}
      <section className="px-4 pb-16 pt-24">
        <div className="mx-auto max-w-3xl">
          <p className="mb-8 text-center text-xs font-bold uppercase tracking-[0.2em] text-[#F7931A]">
            Live now
          </p>
          <div className="grid grid-cols-3 gap-4">
            {liveTools.map((tool) => (
              <div
                key={tool.name}
                className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-[#F7931A]/20 bg-white p-8 text-center transition-all hover:border-[#F7931A] hover:shadow-lg hover:shadow-[#F7931A]/10"
              >
                <tool.icon className="h-8 w-8 text-[#F7931A]" strokeWidth={1.5} />
                <span className="text-sm font-bold text-[#1a1a1a]">{tool.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coming Soon */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-3xl">
          <p className="mb-8 text-center text-xs font-bold uppercase tracking-[0.2em] text-[#999]">
            On the roadmap
          </p>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-4">
            {comingSoon.map((tool) => (
              <div
                key={tool.name}
                className="flex flex-col items-center gap-2 rounded-xl border border-[#ddd5cc] bg-white p-5 text-center"
              >
                <tool.icon className="h-6 w-6 text-[#888]" strokeWidth={1.5} />
                <span className="text-xs font-semibold text-[#777]">{tool.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Manifesto */}
      <section className="border-t border-[#e8e4de] px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="text-3xl font-bold text-[#1a1a1a] sm:text-4xl"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Built different
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-6 text-left sm:grid-cols-3">
            <div>
              <p className="text-sm font-bold text-[#1a1a1a]">Bitcoin only</p>
              <p className="mt-1 text-sm text-[#666]">No shitcoins. No tokens. No distractions.</p>
            </div>
            <div>
              <p className="text-sm font-bold text-[#1a1a1a]">Self-host or cloud</p>
              <p className="mt-1 text-sm text-[#666]">Run it yourself or let us handle it.</p>
            </div>
            <div>
              <p className="text-sm font-bold text-[#1a1a1a]">Open source</p>
              <p className="mt-1 text-sm text-[#666]">MIT licensed. Audit it. Fork it. Own it.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-lg text-center">
          <Link
            href="/register"
            className="inline-flex h-14 items-center justify-center rounded-lg bg-[#1a1a1a] px-10 text-base font-semibold text-white transition-all hover:bg-[#333]"
          >
            Start using opacore
          </Link>
          <p className="mt-4 text-sm text-[#999]">
            Open source.{' '}
            <a
              href="https://github.com/opacore/opacore"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#F7931A] hover:underline"
            >
              Self-host
            </a>{' '}
            or{' '}
            <Link href="/login" className="text-[#F7931A] hover:underline">
              sign in
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e8e4de] px-4 py-8">
        <div className="mx-auto max-w-3xl text-center text-sm text-[#999]">
          <p>Watch-only only. No private keys ever. Boating accidents not covered.</p>
        </div>
      </footer>
    </div>
  );
}
