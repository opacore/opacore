const API_BASE = '/api/v1';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText);
  }

  // Handle empty responses (204, etc)
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

// ── Auth ──

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  default_currency: string;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface RegisterResponse {
  message: string;
  email: string;
}

export const auth = {
  register: (data: { email: string; password: string; name: string }) =>
    request<RegisterResponse>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  login: (data: { email: string; password: string }) =>
    request<UserPublic>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  me: () => request<UserPublic>('/auth/me'),

  verifyEmail: (token: string) =>
    request<UserPublic>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),

  resendVerification: (email: string) =>
    request<{ message: string }>('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),
};

// ── Portfolios ──

export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export const portfolios = {
  list: () => request<Portfolio[]>('/portfolios'),

  get: (id: string) => request<Portfolio>(`/portfolios/${id}`),

  create: (data: { name: string; description?: string }) =>
    request<Portfolio>('/portfolios', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: { name?: string; description?: string }) =>
    request<Portfolio>(`/portfolios/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/portfolios/${id}`, { method: 'DELETE' }),

  summary: (id: string, method = 'fifo') =>
    request<PortfolioSummary>(`/portfolios/${id}/summary?method=${method}`),

  costBasis: (id: string, method = 'fifo', year?: number) => {
    let url = `/portfolios/${id}/cost-basis?method=${method}`;
    if (year) url += `&year=${year}`;
    return request<CostBasisResult>(url);
  },
};

export interface PortfolioSummary {
  total_balance_sat: number;
  total_cost_basis_usd: number;
  current_value_usd: number;
  unrealized_gain_usd: number;
  realized_gain_usd: number;
  total_received_sat: number;
  total_sent_sat: number;
  transaction_count: number;
}

export interface CostBasisResult {
  method: string;
  gains: GainLoss[];
  total_realized_gain_usd: number;
  total_short_term_gain_usd: number;
  total_long_term_gain_usd: number;
  remaining_lots: number;
  remaining_balance_sat: number;
  remaining_cost_basis_usd: number;
}

export interface GainLoss {
  sell_date: string;
  sell_amount_sat: number;
  sell_price_usd: number;
  cost_basis_usd: number;
  proceeds_usd: number;
  gain_usd: number;
  is_long_term: boolean;
  holding_period_days: number;
}

// ── Transactions ──

export interface Transaction {
  id: string;
  portfolio_id: string;
  wallet_id: string | null;
  tx_type: string;
  amount_sat: number;
  fee_sat: number | null;
  price_usd: number | null;
  fiat_amount: number | null;
  fiat_currency: string;
  txid: string | null;
  block_height: number | null;
  block_time: string | null;
  source: string;
  transacted_at: string;
  created_at: string;
  updated_at: string;
}

export const transactions = {
  list: async (params: { portfolioId: string; txType?: string; walletId?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params.txType) qs.set('tx_type', params.txType);
    if (params.walletId) qs.set('wallet_id', params.walletId);
    if (params.limit) qs.set('limit', params.limit.toString());
    if (params.offset) qs.set('offset', params.offset.toString());
    const res = await request<{ data: Transaction[] }>(`/portfolios/${params.portfolioId}/transactions?${qs}`);
    return res.data;
  },

  get: (portfolioId: string, txId: string) =>
    request<Transaction>(`/portfolios/${portfolioId}/transactions/${txId}`),

  create: (data: {
    portfolio_id: string;
    tx_type: string;
    amount_sat: number;
    fee_sat?: number;
    price_usd?: number;
    fiat_amount?: number;
    fiat_currency?: string;
    txid?: string;
    source?: string;
    transacted_at: string;
  }) => request<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(data) }),

  update: (portfolioId: string, txId: string, data: Record<string, unknown>) =>
    request<Transaction>(`/portfolios/${portfolioId}/transactions/${txId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (portfolioId: string, txId: string) =>
    request<void>(`/portfolios/${portfolioId}/transactions/${txId}`, { method: 'DELETE' }),
};

// ── Prices ──

export interface CurrentPrice {
  currency: string;
  price: number;
}

export interface HistoricalPrice {
  date: string;
  currency: string;
  price: number;
  source: string;
}

export const prices = {
  current: (currency = 'usd') =>
    request<CurrentPrice>(`/prices/current?currency=${currency}`),

  historical: (date: string, currency = 'usd') =>
    request<HistoricalPrice>(`/prices/historical?date=${date}&currency=${currency}`),

  range: (start: string, end: string, currency = 'usd') =>
    request<HistoricalPrice[]>(`/prices/range?start=${start}&end=${end}&currency=${currency}`),
};

// ── Wallets ──

export interface Wallet {
  id: string;
  portfolio_id: string;
  label: string;
  wallet_type: string;
  descriptor: string | null;
  xpub: string | null;
  address: string | null;
  network: string;
  gap_limit: number;
  last_synced_at: string | null;
  last_sync_height: number | null;
  created_at: string;
  updated_at: string;
}

export interface AddressInfo {
  index: number;
  address: string;
  keychain: string;
}

export interface UtxoInfo {
  txid: string;
  vout: number;
  value_sat: number;
  keychain: string;
}

export interface SyncResult {
  transactions_found: number;
  new_transactions: number;
  balance_sat: number;
  last_sync_height: number | null;
}

export const wallets = {
  list: (portfolioId: string) =>
    request<Wallet[]>(`/portfolios/${portfolioId}/wallets`),

  get: (portfolioId: string, walletId: string) =>
    request<Wallet>(`/portfolios/${portfolioId}/wallets/${walletId}`),

  create: (data: {
    portfolio_id: string;
    label: string;
    wallet_type: string;
    descriptor?: string;
    xpub?: string;
    derivation_path?: string;
    address?: string;
    network?: string;
    gap_limit?: number;
  }) => request<Wallet>('/wallets', { method: 'POST', body: JSON.stringify(data) }),

  update: (portfolioId: string, walletId: string, data: { label?: string; gap_limit?: number }) =>
    request<Wallet>(`/portfolios/${portfolioId}/wallets/${walletId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (portfolioId: string, walletId: string) =>
    request<void>(`/portfolios/${portfolioId}/wallets/${walletId}`, { method: 'DELETE' }),

  sync: (portfolioId: string, walletId: string, gapLimit?: number) =>
    request<SyncResult>(
      `/portfolios/${portfolioId}/wallets/${walletId}/sync`,
      { method: 'POST', body: JSON.stringify({ gap_limit: gapLimit }) },
    ),

  addresses: (portfolioId: string, walletId: string) =>
    request<{ addresses: AddressInfo[] }>(`/portfolios/${portfolioId}/wallets/${walletId}/addresses`),

  utxos: (portfolioId: string, walletId: string) =>
    request<{ utxos: UtxoInfo[]; total_sat: number }>(`/portfolios/${portfolioId}/wallets/${walletId}/utxos`),
};

// ── Tax ──

export interface TaxReport {
  year: number;
  method: string;
  short_term_gains: number;
  long_term_gains: number;
  total_gains: number;
  total_proceeds: number;
  total_cost_basis: number;
  disposition_count: number;
  dispositions: TaxDisposition[];
}

export interface TaxDisposition {
  description: string;
  date_acquired: string;
  date_sold: string;
  proceeds: number;
  cost_basis: number;
  gain_or_loss: number;
  holding_period: string;
  holding_days: number;
}

export const tax = {
  report: (portfolioId: string, year: number, method = 'fifo') =>
    request<TaxReport>(`/portfolios/${portfolioId}/tax/report?year=${year}&method=${method}`),

  csvUrl: (portfolioId: string, year: number, method = 'fifo') =>
    `${API_BASE}/portfolios/${portfolioId}/tax/csv?year=${year}&method=${method}`,
};

// ── Invoices ──

export interface Invoice {
  id: string;
  portfolio_id: string;
  type: string;
  reusable: boolean;
  invoice_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  description: string | null;
  amount_sat: number;
  amount_fiat: number | null;
  fiat_currency: string;
  btc_price_at_creation: number | null;
  btc_address: string;
  wallet_id: string | null;
  status: string;
  share_token: string;
  issued_at: string | null;
  due_at: string | null;
  expires_at: string | null;
  paid_at: string | null;
  paid_txid: string | null;
  paid_amount_sat: number | null;
  created_at: string;
  updated_at: string;
}

export interface PublicInvoice {
  type: string;
  reusable: boolean;
  invoice_number: string | null;
  customer_name: string | null;
  description: string | null;
  amount_sat: number;
  amount_fiat: number | null;
  fiat_currency: string;
  btc_address: string;
  status: string;
  expires_at: string | null;
  paid_at: string | null;
  paid_txid: string | null;
  paid_amount_sat: number | null;
}

export const invoices = {
  list: (portfolioId: string, params?: { status?: string; type?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.type) qs.set('type', params.type);
    return request<Invoice[]>(`/portfolios/${portfolioId}/invoices?${qs}`);
  },

  get: (portfolioId: string, invoiceId: string) =>
    request<Invoice>(`/portfolios/${portfolioId}/invoices/${invoiceId}`),

  create: (data: {
    portfolio_id: string;
    type?: string;
    reusable?: boolean;
    invoice_number?: string;
    customer_name?: string;
    customer_email?: string;
    description?: string;
    amount_sat?: number;
    amount_fiat?: number;
    fiat_currency?: string;
    btc_price_at_creation?: number;
    btc_address: string;
    wallet_id?: string;
    due_at?: string;
    expires_at?: string;
  }) => request<Invoice>('/invoices', { method: 'POST', body: JSON.stringify(data) }),

  update: (portfolioId: string, invoiceId: string, data: {
    status?: string;
    customer_name?: string;
    customer_email?: string;
    description?: string;
    due_at?: string;
    expires_at?: string;
  }) =>
    request<Invoice>(`/portfolios/${portfolioId}/invoices/${invoiceId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (portfolioId: string, invoiceId: string) =>
    request<void>(`/portfolios/${portfolioId}/invoices/${invoiceId}`, { method: 'DELETE' }),

  checkPayment: (portfolioId: string, invoiceId: string) =>
    request<Invoice>(`/portfolios/${portfolioId}/invoices/${invoiceId}/check-payment`, { method: 'POST' }),

  publicGet: (shareToken: string) =>
    request<PublicInvoice>(`/invoices/pay/${shareToken}`),
};

// ── Labels ──

export interface Label {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export const labels = {
  list: () => request<Label[]>('/labels'),

  create: (data: { name: string; color?: string }) =>
    request<Label>('/labels', { method: 'POST', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/labels/${id}`, { method: 'DELETE' }),
};

export { ApiError };
