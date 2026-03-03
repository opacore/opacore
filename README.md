# Opacore

**The open-source Bitcoin operating system.**

Track your portfolio, generate tax reports, create invoices, and manage your Bitcoin stack — free, forever. Self-host it on your own server or use the managed version at [opacore.com](https://opacore.com).

---

## Why Opacore

- **Free tax reports** — generate Form 8949-ready CSV exports without paying $150/year
- **Self-hostable** — your wallet data stays on your server, not ours
- **Bitcoin-only** — no altcoin noise, built for serious holders
- **Open source** — MIT licensed, audit the code yourself

---

## Features

| Feature | Free |
|---|---|
| Portfolio tracker | ✓ |
| Wallet import (xpub, descriptor, Sparrow, Coldcard, Unchained) | ✓ |
| Auto-sync via Esplora | ✓ |
| Transaction history | ✓ |
| Cost basis (FIFO / LIFO / HIFO) | ✓ |
| Tax reports (Form 8949 CSV) | ✓ |
| DCA tracker | ✓ |
| Bitcoin invoices + payment links | ✓ |
| Fee estimator | ✓ |
| Price alerts | ✓ |

Screenshots and live demo at [opacore.com](https://opacore.com).

---

## Self-hosting with Docker

**Requirements:** Docker + Docker Compose

```bash
git clone https://github.com/opacore/opacore.git
cd opacore
cp .env.example .env   # edit SESSION_SECRET and other values
docker compose -f docker/docker-compose.yml up -d
```

Open `http://localhost:3000`.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | Yes | Random 32+ char string for session signing |
| `RESEND_API_KEY` | No | Email provider for verification emails. If unset, users are auto-verified |
| `FROM_EMAIL` | No | Sender address (default: noreply@opacore.com) |
| `CORS_ORIGIN` | No | Frontend URL (default: http://localhost:3000) |
| `APP_URL` | No | Public app URL used in emails (default: http://localhost:3000) |
| `ESPLORA_URL` | No | Esplora API for wallet sync (default: blockstream.info) |
| `STRIPE_SECRET_KEY` | No | Enables paid tier. If unset, all Pro features are free |
| `STRIPE_WEBHOOK_SECRET` | No | Required if Stripe is enabled |
| `STRIPE_PRICE_ID` | No | Stripe price ID for the Pro plan |

When `STRIPE_SECRET_KEY` is not set, billing is disabled and all features are unlocked. This is the recommended configuration for self-hosters.

---

## Tech stack

- **Backend:** Rust (Axum), SQLite, BDK
- **Frontend:** Next.js 15, React Query, Tailwind CSS
- **Wallet sync:** BDK + Esplora (no node required)
- **Deployment:** Docker Compose

---

## Development

**Requirements:** Rust, Node.js, pnpm

```bash
# Terminal 1 — API server
cargo run -p opacore-server

# Terminal 2 — Frontend
cd apps/web && pnpm dev
```

Open `http://localhost:3000`.

---

## License

MIT — free to use, modify, and self-host.
