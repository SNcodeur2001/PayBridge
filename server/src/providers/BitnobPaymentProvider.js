import crypto from 'node:crypto'
import { CURRENCIES, MOBILE_NETWORK_CODES } from '../config/paybridge.js'
import { digitsOnly, publicCallbackUrl } from '../core/utils.js'

/** Bitnob implementation of the payment provider contract. */
export class BitnobPaymentProvider {
  constructor(client, settings) {
    this.client = client
    this.settings = settings
    this.mode = 'bitnob'
    this.isLive = true
  }

  async getHealth() { return { ok: true, mode: this.mode, time: new Date().toISOString() } }

  async getWallet() {
    const data = await this.client.request('GET', '/api/balances')
    const ledger = data?.ledger_balance ?? (Array.isArray(data) ? data : [])
    const wallets = ledger.map((item) => ({ currency: String(item.currency ?? '').toUpperCase(), balance: Number(item.balance ?? 0), label: item.description ?? String(item.currency ?? '') })).filter((item) => item.currency && Number.isFinite(item.balance))
    const usd = wallets.find((item) => item.currency.startsWith('USD') || item.currency === 'USDT')
    return { balance: Number(usd?.balance ?? 0), currency: 'USD', wallets }
  }

  async getRates() {
    const data = await this.client.request('GET', '/api/exchange-rates', { base: 'USD' })
    const list = Array.isArray(data?.rates) ? data.rates : Array.isArray(data) ? data : []
    const rates = { USD: 1 }
    for (const item of list) {
      const currency = String(item.target_currency ?? item.currency ?? '').toUpperCase()
      const rate = Number(item.mid_rate ?? item.rate)
      if (currency && Number.isFinite(rate)) rates[currency] = rate
    }
    return { updatedAt: data?.timestamp ?? new Date().toISOString(), source: this.mode, rates }
  }

  async getBanks(country) {
    const data = await this.client.request('GET', `/api/payouts/banks/${encodeURIComponent(country)}`)
    const list = Array.isArray(data?.banks) ? data.banks : Array.isArray(data) ? data : data?.data ?? []
    return { banks: list.map((item) => ({ code: String(item.bank_code ?? item.code ?? ''), name: String(item.bank_name ?? item.name ?? '') })).filter((item) => item.code && item.name) }
  }

  async lookupAccount({ country, accountNumber, bankCode, method }) {
    const params = { country, bank_code: bankCode, account_number: digitsOnly(accountNumber) }
    if (method === 'mobile') params.type = 'mobile_money'
    const data = await this.client.request('GET', '/api/payouts/account-lookup', params)
    return { accountName: data?.account_name ?? null, accountNumber: data?.account_number ?? accountNumber, bankCode: data?.bank_code ?? bankCode, bankName: data?.bank_name ?? null, country: data?.country ?? country, isVerified: data?.is_verified ?? false }
  }

  async createQuote({ amount, sendCurrency = 'USD', toCountry, receiveCurrency }) {
    const currency = receiveCurrency ?? CURRENCIES[toCountry] ?? toCountry
    const data = await this.client.request('POST', '/api/payouts/quotes', {
      amount: String(amount), country: toCountry,
      from_asset: sendCurrency === 'USD' ? 'USDT' : sendCurrency,
      to_currency: currency, source: 'offchain',
      reference: `PB-QT-${crypto.randomBytes(6).toString('hex')}`,
    })
    const payout = data?.payout ?? data
    return { amount: Number(payout.amount), fee: Number(payout.fees ?? 0), rate: Number(payout.exchange_rate?.effective_rate ?? payout.exchange_rate?.rate), received: Number(payout.settlement_amount), expiresAt: payout.expires_at, quoteId: payout.quote_id, payoutId: payout.id }
  }

  async submitPayout(transfer, quote, beneficiary) {
    const bankCode = beneficiary.bankCode ?? (beneficiary.method === 'mobile'
      ? (MOBILE_NETWORK_CODES[String(beneficiary.provider).toUpperCase()] ?? String(beneficiary.provider).toUpperCase().replace(/\s+/g, '_'))
      : undefined)
    await this.client.request('POST', `/api/payouts/${encodeURIComponent(quote.quoteId)}/initialize`, {
      quote_id: quote.quoteId, reference: transfer.reference, payment_reason: transfer.paymentReason,
      callback_url: publicCallbackUrl('/api/webhooks/bitnob', this.settings),
      beneficiary: {
        destination_type: beneficiary.method === 'mobile' ? 'mobile_money' : 'bank',
        country: transfer.toCountry, account_name: beneficiary.name,
        account_number: digitsOnly(beneficiary.account), ...(bankCode ? { bank_code: bankCode } : {}),
      },
    })
    await this.client.request('POST', `/api/payouts/${encodeURIComponent(quote.quoteId)}/finalize`)
  }

  async getPayoutStatus(reference) {
    const data = await this.client.request('GET', `/api/payouts/${encodeURIComponent(reference)}`)
    return data?.payout ?? data
  }

  async decodeLightningInvoice(request) {
    const data = await this.client.request('POST', '/api/lightning/decode', { payment_request: request })
    return { paymentHash: data.payment_hash ?? data.paymentHash ?? null, amountSat: Number(data.amount_sat ?? data.numSatoshis ?? data.amount ?? 0), description: data.description ?? '', expiresAt: data.expires_at ?? null, isExpired: data.is_expired ?? false }
  }

  async createLightningInvoice({ amountUsd, description }) {
    const amountSat = Math.max(1, Math.round((Number(amountUsd) || 0) * CURRENCIES.SATS))
    const data = await this.client.request('POST', '/api/lightning/invoices', { amount: amountSat, description: description ?? 'PayBridge', reference: `PB-LN-${crypto.randomBytes(6).toString('hex')}` })
    return { id: data.id ?? data.reference, paymentRequest: data.payment_request ?? data.paymentRequest, amountSat: Number(data.amount ?? amountSat), description: data.description ?? description, expiresAt: data.expires_at ?? null, status: data.status ?? 'pending' }
  }

  async payLightningInvoice(paymentRequest) {
    const reference = `PB-LN-${crypto.randomBytes(6).toString('hex')}`
    const data = await this.client.request('POST', '/api/lightning/pay', { payment_request: paymentRequest, reference, callback_url: publicCallbackUrl('/api/webhooks/bitnob', this.settings) })
    return { id: data.id ?? reference, reference, status: data.status ?? 'pending', amountSat: Number(data.amount ?? 0), feeSat: Number(data.fee ?? 0) }
  }

  async validateAddress({ address, chain }) {
    const data = await this.client.request('POST', '/api/addresses/validate', { address, chain })
    return { address, chain, valid: data?.is_valid ?? data?.valid ?? false, source: this.mode }
  }

  async getDepositAddress(chain) {
    const data = await this.client.request('GET', '/api/addresses', { currency: chain })
    const address = data?.address ?? data?.walletAddress ?? (Array.isArray(data) ? data[0]?.address : null)
    return { address, chain, source: this.mode }
  }
}
