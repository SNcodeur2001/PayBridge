export const COUNTRIES = Object.freeze({
  SN: 'XOF', CI: 'XOF', NG: 'NGN', GH: 'GHS', KE: 'KES', CM: 'XAF', ZA: 'ZAR', FR: 'EUR', US: 'USD',
})
export const CURRENCIES = Object.freeze({ USD: 1, EUR: 0.92, XOF: 603.5, XAF: 603.5, NGN: 1548, GHS: 15.4, KES: 129.2, ZAR: 18.1, SATS: 95_000 })
export const SIMULATED_BALANCE = Object.freeze({ balanceUsd: 12480.35, currency: 'USD' })
export const SIMULATED_WALLETS = Object.freeze([
  { currency: 'USD', balance: 12480.35, label: 'Portefeuille USD' },
  { currency: 'EUR', balance: 2840, label: 'Compte Euro' },
  { currency: 'USDC', balance: 3150, label: 'USD Coin (Polygon)' },
])
export const SIMULATED_BANKS = Object.freeze({
  GH: [{ code: 'GCB', name: 'GCB Bank' }, { code: 'ECB', name: 'Ecobank Ghana' }, { code: 'GTB', name: 'GTBank Ghana' }],
  NG: [{ code: '058', name: 'GTBank Nigeria' }, { code: '011', name: 'First Bank NG' }, { code: '050', name: 'Access Bank' }],
  SN: [{ code: 'BSIC', name: 'BSIC Sénégal' }, { code: 'BOA', name: 'BOA Sénégal' }, { code: 'ECOBANK', name: 'Ecobank Sénégal' }],
  KE: [{ code: 'KCB', name: 'KCB Bank' }, { code: 'EQTY', name: 'Equity Bank' }, { code: 'COOP', name: 'Co-op Bank' }],
  CI: [{ code: 'SGCI', name: 'SGBCI' }, { code: 'BOACI', name: 'BOA CI' }, { code: 'ECOBANK', name: 'Ecobank CI' }],
  CM: [{ code: 'AFRILAND', name: 'Afriland First Bank' }, { code: 'SGBC', name: 'Société Générale CM' }],
  ZA: [{ code: 'FNB', name: 'FNB' }, { code: 'STD', name: 'Standard Bank' }, { code: 'NED', name: 'Nedbank' }],
})
export const SIMULATED_ADDRESSES = Object.freeze({
  BTC: '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf6',
  USDT: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m8',
  USDC: '0x742d35Cc6634C0532925a3b844Bc454e7595f89',
})
export const MOBILE_NETWORK_CODES = Object.freeze({ WAVE: 'WAVE', 'ORANGE MONEY': 'ORANGE', 'MTN MOMO': 'MTN', 'M-PESA': 'M_PESA' })
export const WEBHOOK_STATUS = Object.freeze({
  'payouts.initialized': 'pending', 'payouts.processing': 'processing',
  'payouts.withdrawal.success': 'completed', 'payouts.withdrawal.expired': 'failed',
  'payout.transfer.success': 'completed', 'payout.transfer.failed': 'failed',
})
