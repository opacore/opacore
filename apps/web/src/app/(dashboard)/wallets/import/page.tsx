'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { portfolios as portfolioApi, wallets as walletApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@opacore/ui';
import { Button, Input, Label, Select } from '@opacore/ui';
import { ArrowLeft, Upload, CheckCircle2, AlertCircle } from 'lucide-react';

// ── Config file parsers ────────────────────────────────────────────────────────

type ParsedWallet = {
  label: string;
  walletType: 'xpub' | 'descriptor';
  value: string;
  network: 'bitcoin' | 'testnet';
  detectedAs: string;
};

function isTestnet(s: string | undefined): boolean {
  if (!s) return false;
  return s.toLowerCase().includes('test') || s.toLowerCase() === 'signet';
}

function buildMultisigDescriptor(
  threshold: number,
  keys: Array<{ xpub: string; fingerprint?: string; path?: string }>,
  scriptType: string,
): string {
  const keyExprs = keys.map(({ xpub, fingerprint, path }) => {
    const normPath = path?.replace(/^m\//, '').replace(/'/g, 'h');
    if (fingerprint && normPath) return `[${fingerprint}/${normPath}]${xpub}/0/*`;
    return `${xpub}/0/*`;
  });
  const multi = `multi(${threshold},${keyExprs.join(',')})`;
  if (scriptType === 'P2WSH') return `wsh(${multi})`;
  if (scriptType === 'P2SH-P2WSH' || scriptType === 'P2SH_P2WSH') return `sh(wsh(${multi}))`;
  if (scriptType === 'P2SH') return `sh(${multi})`;
  return `wsh(${multi})`; // default to native segwit multisig
}

function parseUnchained(data: Record<string, unknown>): ParsedWallet | null {
  if (!data.extendedPublicKeys || !data.quorum) return null;
  const xpubArr = data.extendedPublicKeys as Array<{
    xpub: string; bip32Path?: string; rootFingerprint?: string; name?: string;
  }>;
  const quorum = data.quorum as { requiredSigners: number; totalSigners: number };
  const addressType = (data.addressType as string | undefined) ?? 'P2WSH';
  const name = (data.name as string | undefined) ?? 'Unchained Vault';
  const network = isTestnet(data.network as string | undefined) ? 'testnet' : 'bitcoin';

  const keys = xpubArr.map((k) => ({
    xpub: k.xpub,
    fingerprint: k.rootFingerprint,
    path: k.bip32Path,
  }));
  const descriptor = buildMultisigDescriptor(quorum.requiredSigners, keys, addressType);

  return {
    label: name,
    walletType: 'descriptor',
    value: descriptor,
    network,
    detectedAs: `Unchained ${quorum.requiredSigners}-of-${quorum.totalSigners} vault (${addressType})`,
  };
}

function parseSparrow(data: Record<string, unknown>): ParsedWallet | null {
  if (!data.keystores) return null;
  const keystores = data.keystores as Array<{
    xpub?: string; extendedPublicKey?: string;
    masterFingerprint?: string; keyDerivationPath?: string; label?: string;
  }>;
  if (!keystores.length) return null;

  const label = (data.label as string | undefined) ?? 'Sparrow Wallet';
  const network = isTestnet(data.network as string | undefined) ? 'testnet' : 'bitcoin';
  const scriptType = data.scriptType as string | undefined;
  const defaultPolicy = data.defaultPolicy as string | undefined;

  if (keystores.length === 1) {
    const ks = keystores[0]!;
    const xpub = ks.xpub ?? ks.extendedPublicKey ?? '';
    if (!xpub) return null;
    // Single-sig: if we have fingerprint + path, build a descriptor; else return as xpub
    if (ks.masterFingerprint && ks.keyDerivationPath) {
      const normPath = ks.keyDerivationPath.replace(/^m\//, '').replace(/'/g, 'h');
      const scriptPrefix = scriptType === 'P2WPKH' ? 'wpkh' : scriptType === 'P2SH_P2WPKH' ? 'sh(wpkh' : 'wpkh';
      const needsClose = scriptType === 'P2SH_P2WPKH';
      const descriptor = `${scriptPrefix}([${ks.masterFingerprint}/${normPath}]${xpub}/0/*)${needsClose ? ')' : ''}`;
      return { label, walletType: 'descriptor', value: descriptor, network, detectedAs: 'Sparrow single-sig wallet' };
    }
    return { label, walletType: 'xpub', value: xpub, network, detectedAs: 'Sparrow single-sig wallet' };
  }

  // Multisig
  const threshold = defaultPolicy ? parseInt(defaultPolicy.split(' ')[0]!, 10) : 2;
  const keys = keystores.map((ks) => ({
    xpub: ks.xpub ?? ks.extendedPublicKey ?? '',
    fingerprint: ks.masterFingerprint,
    path: ks.keyDerivationPath,
  }));
  const descriptor = buildMultisigDescriptor(threshold, keys, scriptType ?? 'P2WSH');
  return {
    label,
    walletType: 'descriptor',
    value: descriptor,
    network,
    detectedAs: `Sparrow ${threshold}-of-${keystores.length} multisig`,
  };
}

function parseColdcard(data: Record<string, unknown>): ParsedWallet | null {
  // Coldcard exports descriptors directly in p2wsh / p2sh_p2wsh / p2sh fields
  const descriptor =
    (typeof data.p2wsh === 'string' ? data.p2wsh : null) ??
    (typeof data.p2sh_p2wsh === 'string' ? data.p2sh_p2wsh : null) ??
    (typeof data.p2sh === 'string' ? data.p2sh : null);
  if (!descriptor) return null;
  const type = data.p2wsh ? 'P2WSH' : data.p2sh_p2wsh ? 'P2SH-P2WSH' : 'P2SH';
  return {
    label: 'Coldcard Multisig',
    walletType: 'descriptor',
    value: descriptor,
    network: 'bitcoin',
    detectedAs: `Coldcard multisig (${type})`,
  };
}

function parseGenericJson(data: Record<string, unknown>): ParsedWallet | null {
  // Generic: top-level xpub/descriptor/account string
  if (typeof data.descriptor === 'string') {
    return {
      label: (data.label as string | undefined) ?? (data.name as string | undefined) ?? 'Imported Wallet',
      walletType: 'descriptor',
      value: data.descriptor,
      network: 'bitcoin',
      detectedAs: 'Descriptor',
    };
  }
  if (typeof data.xpub === 'string') {
    return {
      label: (data.label as string | undefined) ?? (data.name as string | undefined) ?? 'Imported Wallet',
      walletType: 'xpub',
      value: data.xpub,
      network: 'bitcoin',
      detectedAs: 'Extended public key',
    };
  }
  return null;
}

function parseWalletConfig(json: unknown): ParsedWallet | null {
  if (typeof json !== 'object' || !json) return null;
  const data = json as Record<string, unknown>;
  return parseColdcard(data) ?? parseUnchained(data) ?? parseSparrow(data) ?? parseGenericJson(data);
}

// ── Page component ─────────────────────────────────────────────────────────────

export default function ImportWalletPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [fileDetected, setFileDetected] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [form, setForm] = useState({
    label: '',
    walletType: 'xpub',
    value: '',
    network: 'bitcoin',
    gapLimit: '20',
  });

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfolioApi.list(),
  });

  const firstPortfolioId = portfolios?.[0]?.id;

  function handleFile(file: File) {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      setError('Please upload a JSON config file (Unchained, Sparrow, or Coldcard).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const parsed = parseWalletConfig(json);
        if (!parsed) {
          setError('Could not detect wallet format. Try pasting the xpub or descriptor manually below.');
          return;
        }
        setForm((f) => ({
          ...f,
          label: parsed.label,
          walletType: parsed.walletType,
          value: parsed.value,
          network: parsed.network,
        }));
        setFileDetected(parsed.detectedAs);
        setError('');
      } catch {
        setError('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
  }

  const importWallet = useMutation({
    mutationFn: async () => {
      if (!firstPortfolioId) throw new Error('No portfolio found. Create a portfolio first.');

      let walletType = form.walletType;
      const val = form.value.trim().replace(/[\u2018\u2019\u02BC]/g, "'");

      // Auto-detect address if user selected xpub but pasted a Bitcoin address
      if (walletType === 'xpub' && (val.startsWith('1') || val.startsWith('3') || val.startsWith('bc1') || val.startsWith('tb1'))) {
        if (!val.startsWith('xpub') && !val.startsWith('ypub') && !val.startsWith('zpub') && !val.startsWith('tpub')) {
          walletType = 'address';
        }
      }

      const data: Parameters<typeof walletApi.create>[0] = {
        portfolio_id: firstPortfolioId,
        label: form.label,
        wallet_type: walletType,
        network: form.network,
        gap_limit: parseInt(form.gapLimit, 10) || 20,
      };

      if (walletType === 'xpub') {
        data.xpub = val;
      } else if (walletType === 'descriptor') {
        data.descriptor = val;
      } else if (walletType === 'address') {
        data.address = val;
      }

      const wallet = await walletApi.create(data);

      walletApi.sync(wallet.portfolio_id, wallet.id, 500).catch(() => {});

      return wallet;
    },
    onSuccess: (wallet) => {
      router.push(`/wallets/${wallet.id}`);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Failed to import wallet';
      setError(message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    importWallet.mutate();
  }

  const inputLabel =
    form.walletType === 'xpub'
      ? 'Extended Public Key (xpub/ypub/zpub)'
      : form.walletType === 'descriptor'
        ? 'Output Descriptor'
        : 'Bitcoin Address';

  const inputPlaceholder =
    form.walletType === 'xpub'
      ? 'xpub6CUGRUo...'
      : form.walletType === 'descriptor'
        ? "wsh(multi(2,[fp/48h/0h/0h/2h]xpub.../0/*,...))"
        : 'bc1q...';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/wallets">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Import Wallet</h1>
          <p className="text-muted-foreground">Add a watch-only wallet to track on-chain activity</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Wallet Details</CardTitle>
          <CardDescription>
            Import from a Sparrow, Unchained, or Coldcard config file — or paste an xpub/descriptor manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* File drop zone */}
          <div
            className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors cursor-pointer ${
              isDragging ? 'border-primary bg-accent' : 'border-border hover:border-muted-foreground/50 hover:bg-accent/40'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
          >
            <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">Drop config file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports Sparrow, Unchained, and Coldcard JSON exports
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          {/* File detected banner */}
          {fileDetected && (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Detected: <strong>{fileDetected}</strong> — form pre-filled below. Review and import.</span>
            </div>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-3 text-xs text-muted-foreground">or enter manually</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                type="text"
                placeholder="e.g. Cold Storage, Trezor, Savings"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="walletType">Import Type</Label>
              <Select
                id="walletType"
                value={form.walletType}
                onChange={(e) => setForm({ ...form, walletType: e.target.value, value: '' })}
              >
                <option value="xpub">Extended Public Key (xpub)</option>
                <option value="descriptor">Output Descriptor</option>
                <option value="address">Single Address</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="value">{inputLabel}</Label>
              <Input
                id="value"
                type="text"
                placeholder={inputPlaceholder}
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                required
                className="font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="network">Network</Label>
                <Select
                  id="network"
                  value={form.network}
                  onChange={(e) => setForm({ ...form, network: e.target.value })}
                >
                  <option value="bitcoin">Mainnet</option>
                  <option value="testnet">Testnet</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gapLimit">Gap Limit</Label>
                <Input
                  id="gapLimit"
                  type="number"
                  min={1}
                  max={100}
                  value={form.gapLimit}
                  onChange={(e) => setForm({ ...form, gapLimit: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Number of empty addresses to scan (default: 20)
                </p>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={importWallet.isPending}>
              {importWallet.isPending ? 'Importing...' : 'Import Wallet'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
