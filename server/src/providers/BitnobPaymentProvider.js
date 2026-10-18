import { AppError } from '../core/AppError.js'
import { CURRENCIES, MOBILE_NETWORK_CODES } from '../config/paybridge.js'
import { createReference, digitsOnly, publicCallbackUrl } from '../core/utils.js'

const ASSETS_BY_CURRENCY = Object.freeze({ USD: 'USDT', USDT: 'USDT', USDC: 'USDC', BTC: 'BTC' })
const CHAIN_ALIASES = Object.freeze({ BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', MATIC: 'polygon' })
const ASSETS_BY_CHAIN = Object.freeze({
  bitcoin: ['BTC'], ethereum: ['USDT', 'USDC'], optimism: ['USDT', 'USDC'],
  polygon: ['USDT', 'USDC'], base: ['USDC'], solana: ['USDT', 'USDC'],
  stellar: ['USDC'], avalanche: ['USDT', 'USDC'], tron: ['USDT', 'USDC'],
})

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
function mapTransactionStatus(status = '') {
  const value = String(status).toUpperCase()
  if (['SETTLED', 'COMPLETED', 'SUCCESS'].includes(value)) return 'completed'
  if (['FAILED', 'EXPIRED', 'REVERSED'].includes(value)) return 'failed'
  if (['PENDING', 'IN_PROGRESS', 'PROCESSING', 'INITIATED'].includes(value)) return 'processing'
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
    const accounts = Array.isArray(data?.accounts) ? data.accounts : Array.isArray(data) ? data : []
    const wallets = accounts.map((item) => {
      const currency = String(item.currency ?? '').toUpperCase()
      const rawBalance = Number(item.available_balance ?? item.ledger_balance ?? item.balance)
      const decimals = ['BTC'].includes(currency) ? 8 : ['USDT', 'USDC'].includes(currency) ? 6 : 0
      const formatted = item.available_balance_formatted ?? item.ledger_balance_formatted ?? item.balance_formatted
      const balance = formatted
        ? toNumber(formatted)
        : Number.isFinite(rawBalance) ? rawBalance / (10 ** decimals) : 0
      return { currency, balance, label: formatted ?? currency }
    }).filter((item) => item.currency)
    if (wallets.length && wallets.every((wallet) => wallet.balance === 0)) {
      try {
        const history = await this.client.request('GET', '/api/transactions', { limit: 100 })
        const transactions = Array.isArray(history?.transactions) ? history.transactions : []
        for (const transaction of transactions) {
          if (transaction.side !== 'Credit' && !String(transaction.type ?? '').startsWith('DEPOSIT')) continue
          const currency = String(transaction.currency ?? '').toUpperCase()
          const wallet = wallets.find((item) => item.currency === currency)
          if (wallet) wallet.balance += Math.abs(toNumber(transaction.amount_formatted, Number(transaction.amount) / (10 ** (currency === 'BTC' ? 8 : ['USDT', 'USDC'].includes(currency) ? 6 : 2))))
        }
      } catch { /* balance remains the authoritative first response when history is unavailable */ }
    }
    const usdWallet = wallets.find((item) => ['USDT', 'USDC', 'USD'].includes(item.currency))
    return { balance: usdWallet?.balance ?? 0, currency: 'USD', wallets }
  }

  async getDeposits() {
    let cursor
    let transactions = []
    for (let page = 0; page < 10; page += 1) {
      const data = await this.client.request('GET', '/api/transactions', { limit: 100, ...(cursor ? { cursor } : {}) })
      transactions = transactions.concat(Array.isArray(data?.transactions) ? data.transactions : Array.isArray(data) ? data : [])
      if (!data?.has_more || !data?.next_cursor) break
      cursor = data.next_cursor
    }
    return transactions.filter((item) => item.side === 'Credit' || Number(item.amount) > 0 || String(item.type ?? '').startsWith('DEPOSIT'))
      .map((item) => {
        const metadata = typeof item.metadata === 'string' ? parseDestination(item.metadata) : item.metadata ?? {}
        return {
          id: String(item.transaction_id ?? item.id ?? item.reference ?? ''),
          reference: item.reference ?? null, direction: 'in',
          amount: toNumber(item.amount_formatted ?? item.original_amount_formatted, Number(item.amount) / (10 ** (['BTC'].includes(String(item.currency).toUpperCase()) ? 8 : ['USDC', 'USDT'].includes(String(item.currency).toUpperCase()) ? 6 : 2))),
          currency: String(item.currency ?? '').toUpperCase(),
          status: mapTransactionStatus(item.state), type: item.type ?? 'DEPOSIT',
          chain: metadata.chain ?? null, address: metadata.address ?? null,
          txHash: metadata.tx_hash ?? null, source: 'bitnob',
          createdAt: item.created_at ?? null,
        }
      })
  }

  async getDepositAddresses() {
    const data = await this.client.request('GET', '/api/addresses')
    const addresses = Array.isArray(data?.addresses) ? data.addresses : Array.isArray(data) ? data : []
    return addresses.map((item) => ({ id: item.id ?? null, chain: String(item.chain ?? '').toLowerCase(), address: item.address ?? '', label: item.label ?? item.description ?? null }))
      .filter((item) => item.chain && item.address)
  }

  async listCustomers(params = {}) { return this.client.request('GET', '/api/customers', params) }
  async createCustomer(customer) { return this.client.request('POST', '/api/customers', customer) }
  async getSupportedVirtualAccountCurrencies() { return this.client.request('GET', '/api/virtual-accounts/supported-currencies') }
  async listVirtualAccounts(params = {}) { return this.client.request('GET', '/api/virtual-accounts', params) }
  async createVirtualAccount(input) { return this.client.request('POST', '/api/virtual-accounts', input) }
  async getVirtualAccount(id) { return this.client.request('GET', `/api/virtual-accounts/${encodeURIComponent(id)}`) }
  async getVirtualAccountTransactions(id, params = {}) { return this.client.request('GET', `/api/virtual-accounts/${encodeURIComponent(id)}/transactions`, params) }
  async updateVirtualAccountAlias(id, alias) { return this.client.request('PATCH', `/api/virtual-accounts/${encodeURIComponent(id)}/alias`, { account_alias: alias }) }
  async simulateVirtualAccountDeposit(id) { return this.client.request('POST', `/api/virtual-accounts/${encodeURIComponent(id)}/simulate-deposit`) }

  async simulatePayoutDeposit(quoteId, amount) {
    return this.client.request('POST', `/api/payouts/quotes/${encodeURIComponent(quoteId)}/deposits`, { amount: String(amount) })
  }

  async submitCryptoTransfer({ transfer, channel, sourceCurrency }) {
    const address = String(channel.account ?? channel.address ?? '').trim()
    const asset = String(channel.asset ?? sourceCurrency).toUpperCase()
    const chain = this.#normalizeChain(channel.chain ?? (asset === 'BTC' ? 'bitcoin' : 'ethereum'))
    if (!address) throw new AppError(400, 'Adresse crypto manquante.')
    if (!['BTC', 'USDT', 'USDC'].includes(asset)) throw new AppError(400, `Actif crypto non supporté : ${asset}`)
    if (!ASSETS_BY_CHAIN[chain]?.includes(asset)) throw new AppError(400, `L’actif ${asset} n’est pas pris en charge sur le réseau ${chain}.`)

    const conversion = await this.client.request('GET', '/api/exchange-rates/convert', {
      from: String(sourceCurrency).toUpperCase(), to: asset, amount: Number(transfer.amount),
    })
    const majorAmount = Number(conversion.to_amount)
    const decimals = asset === 'BTC' ? 8 : 6
    const minorAmount = Math.round(majorAmount * (10 ** decimals))
    if (!Number.isSafeInteger(minorAmount) || minorAmount <= 0) throw new AppError(400, 'Montant converti invalide pour le retrait crypto.')

    const data = await this.createCryptoWithdrawal({
      address, amount: minorAmount, currency: asset, chain,
      reference: transfer.reference,
      description: `PayBridge — ${transfer.beneficiaryName}`,
      memo: channel.memo,
    })
    const withdrawal = unwrapEntity(data, 'withdrawal')
    return {
      providerRef: withdrawal.transaction_id ?? withdrawal.id ?? null,
      amount: majorAmount, currency: asset,
      fee: toNumber(withdrawal.fee_formatted ?? withdrawal.fee),
      status: mapTransactionStatus(withdrawal.state ?? withdrawal.status),
    }
  }

  async getTransaction(reference) {
    const data = await this.client.request('GET', `/api/transactions/${encodeURIComponent(reference)}`)
    const transaction = unwrapEntity(data, 'transaction')
    return { ...transaction, status: mapTransactionStatus(transaction.state ?? transaction.status) }
  }

  async createCryptoWithdrawal({ address, amount, currency, chain, reference, description, memo }) {
    return this.client.request('POST', '/api/withdrawals', {
      to_address: address, amount: String(amount), currency, chain, reference,
      ...(description ? { description } : {}), ...(memo ? { memo } : {}),
    })
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

  async createQuote({ amount, sendCurrency = 'USD', toCountry, receiveCurrency, reference, paymentReason = 'family_support', fundingMode = 'offchain' }) {
    const fromAsset = ASSETS_BY_CURRENCY[sendCurrency]
    if (!fromAsset) throw new AppError(400, `Bitnob ne prend pas en charge la devise source ${sendCurrency} pour les payouts. Utilise USD, USDT, USDC ou BTC.`)
    const payoutReference = reference ?? createReference('PBQT')
    const data = await this.client.request('POST', '/api/payouts/quotes', {
      amount: String(amount), country: toCountry, from_asset: fromAsset,
      to_currency: receiveCurrency ?? CURRENCIES[toCountry] ?? toCountry,
      source: fundingMode === 'onchain' ? 'onchain' : 'offchain',
      ...(fundingMode === 'onchain' ? { chain: fromAsset === 'BTC' ? 'bitcoin' : 'polygon' } : {}),
      payment_reason: paymentReason, reference: payoutReference,
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
    const network = String(beneficiary.network ?? MOBILE_NETWORK_CODES[provider] ?? provider.replace(/\s+/g, '_')).toLowerCase()
    const callbackUrl = this.#callbackUrl()
    const destination = {
      destination_type: isMobile ? 'mobile_money' : 'bank',
      country: transfer.toCountry,
      account_name: beneficiary.accountName ?? beneficiary.name,
      account_number: digitsOnly(beneficiary.account),
      ...(isMobile ? { network } : { bank_code: beneficiary.bankCode }),
      ...(isMobile && ['SN', 'CI'].includes(String(transfer.toCountry).toUpperCase())
        ? { sender: { account_name: this.settings.payoutSenderName ?? 'PayBridge Africa', country: transfer.fromCountry ?? 'SN' } }
        : {}),
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
      const data = await this.client.request('POST', '/api/beneficiaries', {
        name: String(input.name).trim(), type: 'crypto',
        wallet_address: String(input.account ?? input.walletAddress).trim(),
        currency: String(input.asset ?? input.currency ?? 'USDT').toUpperCase(),
        network: this.#normalizeChain(input.chain ?? input.network ?? 'ethereum'),
      })
      return this.#mapBeneficiary(unwrapEntity(data, 'beneficiary'))
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
    if (current.method === 'crypto') {
      const data = await this.client.request('PUT', `/api/beneficiaries/${encodeURIComponent(id)}`, {
        ...(changes.name !== undefined ? { name: String(changes.name).trim() } : {}),
        ...(changes.account !== undefined ? { wallet_address: String(changes.account).trim() } : {}),
        ...(changes.asset !== undefined ? { currency: String(changes.asset).toUpperCase() } : {}),
        ...(changes.chain !== undefined ? { network: this.#normalizeChain(changes.chain) } : {}),
      })
      return this.#mapBeneficiary(unwrapEntity(data, 'beneficiary'))
    }
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
      asset: String(record.currency ?? destination.currency ?? '').toUpperCase(),
      chain: record.network ?? destination.network ?? null,
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
