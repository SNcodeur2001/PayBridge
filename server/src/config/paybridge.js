export const SUPPORTED_SEND_CURRENCIES = Object.freeze(['USD', 'USDT', 'USDC', 'BTC'])
export const MOBILE_NETWORK_CODES = Object.freeze({ WAVE: 'WAVE', 'ORANGE MONEY': 'ORANGE', 'MTN MOMO': 'MTN', 'M-PESA': 'M_PESA' })
export const WEBHOOK_STATUS = Object.freeze({
  'payouts.initialized': 'pending', 'payouts.processing': 'processing',
  'payouts.withdrawal.success': 'completed', 'payouts.withdrawal.expired': 'failed',
  'payout.transfer.success': 'completed', 'payout.transfer.failed': 'failed',
})
