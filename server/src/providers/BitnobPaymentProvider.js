import { AppError } from '../core/AppError.js'
import { CURRENCIES, MOBILE_NETWORK_CODES } from '../config/paybridge.js'
import { createReference, digitsOnly, publicCallbackUrl } from '../core/utils.js'

const ASSETS_BY_CURRENCY = Object.freeze({ USD: 'USDT', USDT: 'USDT', USDC: 'USDC', BTC: 'BTC' })
const CHAIN_ALIASES = Object.freeze({ BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', MATIC: 'polygon' })

function unwrapEntity(value, key) { return value?.[key] ?? value }
function parseDestination(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return {} }
}
function toNumber(value, fallback = 0) {
  const number = Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(number) ? number : fallback
}
function mapPayoutStatus(status = '') {
  const value = String(status).toUpperCase()
  if (['COMPLETED', 'SUCCESS'].includes(value)) return 'completed'
  if (['FAILED', 'EXPIRED'].includes(value)) return 'failed'
  if (['INITIATED', 'PENDING', 'PROCESSING', 'FUNDED'].includes(value)) return 'processing'
  return 'pending'
}
function mapPayout(payout = {}) {
  const beneficiary = payout.beneficiary ?? {}
  return {
    id: payout.reference ?? payout.id, reference: payout.reference ?? payout.id,
    createdAt: payout.created_at ?? null, updatedAt: payout.updated_at ?? null,
    beneficiaryId: beneficiary.id ?? null, beneficiaryName: beneficiary.account_name ?? null,
    fromCountry: 'API', toCountry: payout.country ?? beneficiary.country ?? '',
    sendCurrency: String(payout.from_asset ?? '').toUpperCase(),
    receiveCurrency: String(payout.to_currency ?? '').toUpperCase(),
    amount: toNumber(payout.amount), fee: toNumber(payout.fees),
    rate: toNumber(payout.exchange_rate?.effective_rate ?? payout.exchange_rate?.rate),
    received: toNumber(payout.settlement_amount),
    method: beneficiary.destination_type === 'mobile_money' ? 'mobile' : 'bank',
    paymentReason: payout.payment_reason ?? '', provider: 'bitnob',
    status: mapPayoutStatus(payout.status), demo: false,
  }
}

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
    const accounts = Array.isArray(data?.accounts) ? data.accounts : []
    const wallets = accounts.map((item) => {
      const currency = String(item.currency ?? '').toUpperCase()
      const rawBalance = Number(item.ledger_balance)
      const decimals = ['BTC'].includes(currency) ? 8 : ['USDT', 'USDC'].includes(currency) ? 6 : 0
      const balance = item.ledger_balance_formatted
        ? toNumber(item.ledger_balance_formatted)
        : Number.isFinite(rawBalance) ? rawBalance / (10 ** decimals) : 0
      return { currency, balance, label: item.ledger_balance_formatted ?? currency }
    }).filter((item) => item.currency)
    const usdWallet = wallets.find((item) => ['USDT', 'USDC', 'USD'].includes(item.currency))
    return { balance: usdWallet?.balance ?? 0, currency: 'USD', wallets }
  }

  async getRates() {
    const data = await this.client.request('GET', '/api/exchange-rates', { base: 'USD' })
    const list = Array.isArray(data?.rates) ? data.rates : Array.isArray(data) ? data : []
    const rates = { USD: 1 }
    for (const item of list) {
      const currency = String(item.target_currency ?? item.currency ?? '').toUpperCase()
      const buy = Number(item.buy_rate)
      const sell = Number(item.sell_rate)
      const rate = Number(item.mid_rate ?? item.rate ?? (Number.isFinite(buy) && Number.isFinite(sell) ? (buy + sell) / 2 : NaN))
      if (currency && Number.isFinite(rate)) rates[currency] = rate
    }
    return { updatedAt: data?.timestamp ?? new Date().toISOString(), source: this.mode, rates }
  }

  async getBanks(country) {
    const data = await this.client.request('GET', `/api/payouts/banks/${encodeURIComponent(country)}`)
    const list = Array.isArray(data?.banks) ? data.banks : Array.isArray(data) ? data : []
    return { banks: list.map((item) => ({ code: String(item.bank_code ?? item.code ?? ''), name: String(item.bank_name ?? item.name ?? '') })).filter((item) => item.code && item.name) }
  }

  async lookupAccount({ country, accountNumber, bankCode, method }) {
    const params = { country, bank_code: bankCode, account_number: digitsOnly(accountNumber) }
    if (method === 'mobile') params.type = 'mobile_money'
    const data = await this.client.request('GET', '/api/payouts/account-lookup', params)
    return { accountName: data?.account_name ?? null, accountNumber: data?.account_number ?? accountNumber, bankCode: data?.bank_code ?? bankCode, bankName: data?.bank_name ?? null, country: data?.country ?? country, isVerified: data?.is_verified ?? false }
  }

  async createQuote({ amount, sendCurrency = 'USD', toCountry, receiveCurrency, reference, paymentReason = 'family_support' }) {
    const fromAsset = ASSETS_BY_CURRENCY[sendCurrency]
    if (!fromAsset) throw new AppError(400, `Bitnob ne prend pas en charge la devise source ${sendCurrency} pour les payouts. Utilise USD, USDT, USDC ou BTC.`)
    const payoutReference = reference ?? createReference('PBQT')
    const data = await this.client.request('POST', '/api/payouts/quotes', {
      amount: String(amount), country: toCountry, from_asset: fromAsset,
      to_currency: receiveCurrency ?? CURRENCIES[toCountry] ?? toCountry,
      source: 'offchain', payment_reason: paymentReason, reference: payoutReference,
    })
    const payout = unwrapEntity(data, 'payout')
    return {
      amount: toNumber(payout.amount, Number(amount)), fee: toNumber(payout.fees),
      rate: toNumber(payout.exchange_rate?.effective_rate ?? payout.exchange_rate?.rate),
      received: toNumber(payout.settlement_amount), expiresAt: payout.expires_at,
      quoteId: payout.quote_id, payoutId: payout.id, reference: payout.reference ?? payoutReference,
    }
  }

  async submitPayout(transfer, quote, beneficiary) {
    const isMobile = beneficiary.method === 'mobile'
    const provider = String(beneficiary.provider ?? '').toUpperCase()
    const network = beneficiary.network ?? MOBILE_NETWORK_CODES[provider] ?? provider.replace(/\s+/g, '_')
    const callbackUrl = this.#callbackUrl()
    const destination = {
      destination_type: isMobile ? 'mobile_money' : 'bank',
      country: transfer.toCountry,
      account_name: beneficiary.accountName ?? beneficiary.name,
      account_number: digitsOnly(beneficiary.account),
      ...(isMobile ? { network } : { bank_code: beneficiary.bankCode }),
    }
    await this.client.request('POST', `/api/payouts/${encodeURIComponent(quote.quoteId)}/initialize`, {
      quote_id: quote.quoteId, reference: transfer.reference,
      payment_reason: transfer.paymentReason,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      beneficiary: destination,
    })
    return this.client.request('POST', `/api/payouts/${encodeURIComponent(quote.quoteId)}/finalize`)
  }

  async getPayoutStatus(reference) {
    const data = await this.client.request('GET', `/api/payouts/reference/${encodeURIComponent(reference)}`)
    return mapPayout(unwrapEntity(data, 'payout'))
  }

  async listPayouts({ limit = 100, offset = 0 } = {}) {
    const data = await this.client.request('GET', '/api/payouts', { limit, offset })
    const payouts = Array.isArray(data?.items) ? data.items : Array.isArray(data?.payouts) ? data.payouts : []
    return payouts.map(mapPayout)
  }

  async listBeneficiaries() {
    const data = await this.client.request('GET', '/api/beneficiaries')
    const list = Array.isArray(data?.beneficiaries) ? data.beneficiaries : Array.isArray(data) ? data : []
    return list.map((beneficiary) => this.#mapBeneficiary(beneficiary))
  }

  async getBeneficiary(id) {
    const data = await this.client.request('GET', `/api/beneficiaries/${encodeURIComponent(id)}`)
    return this.#mapBeneficiary(unwrapEntity(data, 'beneficiary'))
  }

  async createBeneficiary(input) {
    if (input.method === 'crypto') {
      throw new AppError(400, 'La route bénéficiaire actuelle accepte les destinations bancaires ou mobile money, pas les wallets crypto.')
    }
    const destination = {
      account_name: input.accountName ?? input.name,
      account_number: String(input.account),
      bank_code: input.bankCode,
      country: String(input.country).toUpperCase(),
      destination_type: input.method === 'mobile' ? 'mobile_money' : 'bank',
      ...(input.method === 'mobile' ? { network: input.network ?? MOBILE_NETWORK_CODES[String(input.provider ?? '').toUpperCase()] ?? input.provider } : {}),
    }
    const data = await this.client.request('POST', '/api/beneficiaries', {
      name: String(input.name).trim(), type: 'bank', destination: JSON.stringify(destination),
    })
    return this.#mapBeneficiary(unwrapEntity(data, 'beneficiary'))
  }

  async updateBeneficiary(id, changes, existing) {
    const current = existing ?? await this.getBeneficiary(id)
    const destination = {
      account_name: changes.accountName ?? changes.name ?? current.name,
      account_number: changes.account ?? current.account,
      bank_code: changes.bankCode ?? current.bankCode,
      country: changes.country ?? current.country,
      destination_type: changes.method === 'mobile' || current.method === 'mobile' ? 'mobile_money' : 'bank',
      ...(changes.network || current.network ? { network: changes.network ?? current.network } : {}),
    }
    const body = {
      ...(changes.name !== undefined ? { name: String(changes.name).trim() } : {}),
      destination,
    }
    const data = await this.client.request('PUT', `/api/beneficiaries/${encodeURIComponent(id)}`, body)
    return this.#mapBeneficiary(unwrapEntity(data, 'beneficiary'))
  }

  async decodeLightningInvoice(request) {
    const data = await this.client.request('POST', '/api/lightning/decode', { request })
    return {
      paymentHash: data.payment_hash ?? null,
      amountSat: Number(data.amount_sat ?? 0), description: data.description ?? '',
      expiresAt: this.#unixTimestamp(data.expires_at), isExpired: data.is_expired ?? false,
    }
  }

  async createLightningInvoice({ amountUsd, description }) {
    const conversion = await this.client.request('GET', '/api/exchange-rates/convert', {
      from: 'USD', to: 'BTC', amount: Number(amountUsd),
    })
    const amountSat = Math.round(Number(conversion.to_amount) * 100_000_000)
    if (!Number.isSafeInteger(amountSat) || amountSat < 1 || amountSat > 20_000_000) {
      throw new AppError(400, 'Le montant converti doit être compris entre 1 et 20 000 000 sats.')
    }
    const data = await this.client.request('POST', '/api/lightning/invoices', {
      amount: amountSat, description: description ?? 'PayBridge', reference: createReference('PBLN'),
    })
    return { id: data.id, paymentRequest: data.request, amountSat: Number(data.amount_sat ?? amountSat), description: data.description ?? description, expiresAt: data.expires_at ?? null, status: data.status ?? 'pending' }
  }

  async payLightningInvoice(paymentRequest) {
    const reference = createReference('PBLN')
    const data = await this.client.request('POST', '/api/lightning/pay', { request: paymentRequest, reference })
    return {
      id: data.id ?? data.transaction_id ?? reference, reference: data.reference ?? reference,
      status: data.status === 'paid' ? 'completed' : data.status,
      amountSat: Number(data.amount_sat ?? 0), feeSat: Number(data.fee_sat ?? 0),
    }
  }

  async validateAddress({ address, chain }) {
    const normalizedChain = this.#normalizeChain(chain)
    const data = await this.client.request('POST', '/api/addresses/validate', { address, chain: normalizedChain })
    return { address, chain, valid: data?.valid ?? false, source: this.mode }
  }

  async getDepositAddress(chain) {
    const normalizedChain = this.#normalizeChain(chain)
    const data = await this.client.request('POST', '/api/addresses', {
      chain: normalizedChain, label: `PayBridge ${normalizedChain} deposit`, reference: createReference('PBADDR'),
    })
    return { address: data?.address ?? null, chain, source: this.mode }
  }

  #mapBeneficiary(record = {}) {
    const destination = parseDestination(record.destination)
    return {
      id: record.id, name: record.name ?? destination.account_name ?? '',
      accountName: destination.account_name ?? record.account_name ?? record.name ?? '',
      country: String(destination.country ?? record.country ?? '').toUpperCase(),
      method: destination.destination_type === 'mobile_money' ? 'mobile' : record.type === 'crypto' ? 'crypto' : 'bank',
      provider: destination.network ?? destination.bank_name ?? destination.bank_code ?? '',
      network: destination.network, account: destination.account_number ?? record.wallet_address ?? '',
      bankCode: destination.bank_code, isActive: record.is_active ?? true,
      isBlacklisted: record.is_blacklisted ?? false,
    }
  }

  #normalizeChain(chain) {
    const key = String(chain ?? '').trim().toUpperCase()
    if (['USDT', 'USDC'].includes(key)) {
      throw new AppError(400, `${key} est un actif, pas un réseau. Indique le réseau, par exemple ethereum, polygon ou tron.`)
    }
    return CHAIN_ALIASES[key] ?? key.toLowerCase()
  }

  #callbackUrl() {
    try {
      const url = new URL(publicCallbackUrl('/api/webhooks/bitnob', this.settings))
      return url.protocol === 'https:' ? url.toString() : null
    } catch { return null }
  }

  #unixTimestamp(value) {
    if (value === null || value === undefined || value === '') return null
    const timestamp = Number(value)
    return Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : value
  }
}
