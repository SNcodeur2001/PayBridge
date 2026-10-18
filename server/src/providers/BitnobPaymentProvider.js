import { AppError } from '../core/AppError.js'
import { MOBILE_NETWORK_CODES } from '../config/paybridge.js'
import { createReference, digitsOnly, publicCallbackUrl } from '../core/utils.js'

const ASSETS_BY_CURRENCY = Object.freeze({ USD: 'USDT', USDT: 'USDT', USDC: 'USDC', BTC: 'BTC' })
const TRANSACTION_DECIMALS = Object.freeze({ BTC: 8, USDT: 6, USDC: 6, NGN: 2 })
const CHAIN_ALIASES = Object.freeze({ BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', MATIC: 'polygon' })
const ASSETS_BY_CHAIN = Object.freeze({
  bitcoin: ['BTC'], ethereum: ['USDT', 'USDC'], optimism: ['USDT', 'USDC'],
  polygon: ['USDT', 'USDC'], base: ['USDC'], solana: ['USDT', 'USDC'],
  stellar: ['USDC'], avalanche: ['USDT', 'USDC'], tron: ['USDT', 'USDC'],
})

function unwrapEntity(value, key) { return value?.[key] ?? value }
function parseDestination(value) {
  if (value === null || value === undefined || value === '') return {}
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { throw new AppError(502, 'Réponse Bitnob invalide : destination bénéficiaire illisible.') }
}
function toNumber(value) {
  const number = Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(number) ? number : null
}
function mapPayoutStatus(status = '') {
  const value = String(status).toUpperCase()
  if (['COMPLETED', 'SUCCESS'].includes(value)) return 'completed'
  if (['FAILED', 'EXPIRED'].includes(value)) return 'failed'
  if (['INITIATED', 'PENDING', 'PROCESSING', 'FUNDED'].includes(value)) return 'processing'
  return String(status || '').toLowerCase() || null
}
function mapTransactionStatus(status = '') {
  const value = String(status).toUpperCase()
  if (['SETTLED', 'COMPLETED', 'SUCCESS'].includes(value)) return 'completed'
  if (['FAILED', 'EXPIRED', 'REVERSED'].includes(value)) return 'failed'
  if (['PENDING', 'IN_PROGRESS', 'PROCESSING', 'INITIATED'].includes(value)) return 'processing'
  return String(status || '').toLowerCase() || null
}
function displayTransactionAmount(transaction) {
  if (transaction.amount_formatted) {
    const amount = toNumber(transaction.amount_formatted)
    if (amount === null) throw new AppError(502, 'Réponse Bitnob invalide : amount_formatted illisible.')
    return amount
  }
  const currency = String(transaction.currency ?? '').toUpperCase()
  const decimals = TRANSACTION_DECIMALS[currency]
  if (decimals === undefined || !/^-?\d+$/.test(String(transaction.amount ?? ''))) {
    throw new AppError(502, `Réponse Bitnob invalide : montant de transaction invalide (${currency}).`)
  }
  return Number(transaction.amount) / (10 ** decimals)
}
function mapPayout(payout = {}) {
  const beneficiary = payout.beneficiary ?? {}
  return {
    ...payout,
    bitnob: payout,
    id: payout.id, reference: payout.reference,
    createdAt: payout.created_at ?? null, updatedAt: payout.updated_at ?? null,
    beneficiaryId: beneficiary.id ?? null, beneficiaryName: beneficiary.account_name ?? null,
    fromCountry: payout.sender?.country ?? null, toCountry: payout.country ?? beneficiary.country ?? null,
    sendCurrency: String(payout.from_asset ?? '').toUpperCase(),
    receiveCurrency: String(payout.to_currency ?? '').toUpperCase(),
    amount: toNumber(payout.amount), fee: toNumber(payout.fees),
    rate: toNumber(payout.exchange_rate?.effective_rate ?? payout.exchange_rate?.rate),
    received: toNumber(payout.settlement_amount),
    method: beneficiary.destination_type === 'mobile_money' ? 'mobile' : beneficiary.destination_type === 'bank' ? 'bank' : undefined,
    paymentReason: payout.payment_reason ?? null, provider: 'bitnob',
    status: mapPayoutStatus(payout.status), bitnobStatus: payout.status, source: 'bitnob',
  }
}

/** Bitnob implementation of the payment provider contract. */
export class BitnobPaymentProvider {
  constructor(client, settings) {
    this.client = client
    this.settings = settings
    this.mode = 'bitnob'
  }

  async getHealth() { return { ok: true, mode: this.mode, time: new Date().toISOString() } }

  async getWallet() {
    const data = await this.client.request('GET', '/api/balances')
    if (!Array.isArray(data?.accounts)) {
      throw new AppError(502, 'Réponse Bitnob invalide : la liste accounts est absente.')
    }

    const wallets = data.accounts.map((item) => {
      if (!item || typeof item !== 'object') {
        throw new AppError(502, 'Réponse Bitnob invalide : un compte de portefeuille est mal formé.')
      }

      const currency = String(item.currency ?? '').toUpperCase()
      const rawBalance = item.available_balance
      const formattedBalance = item.available_balance_formatted

      if (!currency) throw new AppError(502, 'Réponse Bitnob invalide : devise du portefeuille absente.')
      if (rawBalance === undefined || rawBalance === null || !Number.isFinite(Number(rawBalance))) {
        throw new AppError(502, `Réponse Bitnob invalide : available_balance absent ou invalide pour ${currency}.`)
      }
      if (typeof formattedBalance !== 'string' || !formattedBalance.trim()) {
        throw new AppError(502, `Réponse Bitnob invalide : available_balance_formatted absent pour ${currency}.`)
      }
      const balance = toNumber(formattedBalance)
      if (balance === null) throw new AppError(502, `Réponse Bitnob invalide : available_balance_formatted illisible pour ${currency}.`)

      return { ...item, currency, balance, label: formattedBalance }
    })

    const usdWallet = wallets.find((item) => ['USDT', 'USDC', 'USD'].includes(item.currency))
    return { ...(usdWallet ? { balance: usdWallet.balance, currency: usdWallet.currency } : {}), wallets }
  }

  async getWalletBalance(currency) {
    return this.client.request('GET', `/api/balances/${encodeURIComponent(String(currency).toUpperCase())}`)
  }

  async getSupportedStablecoinChains() {
    return this.client.request('GET', '/api/stablecoins/supported-chains')
  }

  async getTransactions(params = {}) {
    const query = {}
    if (params.limit !== undefined) query.limit = params.limit
    if (params.cursor !== undefined) query.cursor = params.cursor
    return this.client.request('GET', '/api/transactions', Object.keys(query).length ? query : undefined)
  }

  async getVirtualAccountDeposits() {
    const accounts = []
    for (let page = 1; page <= 100; page += 1) {
      const data = await this.client.request('GET', '/api/virtual-accounts', { page, page_size: 100 })
      if (!Array.isArray(data?.virtual_accounts) || !data?.page_info) {
        throw new AppError(502, 'Réponse Bitnob invalide : virtual_accounts ou page_info absent.')
      }
      accounts.push(...data.virtual_accounts)
      if (!data.page_info.has_next_page) break
      if (page === 100) throw new AppError(502, 'Liste des comptes virtuels Bitnob trop volumineuse pour être récupérée en une requête.')
    }
    const deposits = await Promise.all(accounts.map(async (account) => {
      const transactions = []
      let offset = 0
      for (let page = 0; page < 100; page += 1) {
        const result = await this.getVirtualAccountTransactions(account.id, { limit: 100, offset })
        if (!Array.isArray(result?.transactions) || !Number.isFinite(Number(result.total))) {
          throw new AppError(502, `Réponse Bitnob invalide : transactions ou total absent pour le compte virtuel ${account.id}.`)
        }
        transactions.push(...result.transactions)
        if (transactions.length >= Number(result.total)) break
        offset += result.transactions.length
        if (!result.transactions.length || page === 99) {
          throw new AppError(502, `Pagination Bitnob incomplète pour le compte virtuel ${account.id}.`)
        }
      }
      return transactions.map((transaction) => {
        if (!/^\d+$/.test(String(transaction.amount ?? ''))) {
          throw new AppError(502, `Réponse Bitnob invalide : montant de dépôt NGN invalide pour ${account.id}.`)
        }
        return {
          ...transaction,
          bitnob: transaction,
          amountMinor: transaction.amount,
          amount: Number(transaction.amount) / 100,
          account_id: transaction.virtual_account_id,
          source: 'bitnob',
        }
      })
    }))
    return deposits.flat()
  }

  async listTransfers(params = {}) {
    const [payouts, transactionData] = await Promise.all([
      this.listPayouts(params),
      this.#listTransactions(params),
    ])
    const payoutReferences = new Set(payouts.map((payout) => payout.reference))
    const withdrawals = transactionData.filter((item) => {
      const side = String(item.side ?? item.direction ?? '').toLowerCase()
      const type = String(item.type ?? '').toUpperCase()
      const outgoing = ['debit', 'out', 'outbound'].includes(side) || /WITHDRAWAL|PAYOUT|LIGHTNING/.test(type)
      return outgoing && !payoutReferences.has(item.reference)
    }).map((item) => ({
      ...item,
      bitnob: item,
      id: item.reference ?? item.transaction_id ?? item.id,
      amount: displayTransactionAmount(item),
      currency: String(item.currency ?? '').toUpperCase(),
      status: mapTransactionStatus(item.state ?? item.status),
      source: 'bitnob',
    }))
    return [...payouts, ...withdrawals].sort((left, right) => new Date(right.createdAt ?? right.created_at ?? 0) - new Date(left.createdAt ?? left.created_at ?? 0))
  }

  async getTransfer(reference) {
    if (/^PB(?:CR|LN)-/i.test(reference)) return this.getTransaction(reference)
    if (/^PB-/i.test(reference)) return this.getPayoutStatus(reference)
    const data = await this.client.request('GET', `/api/payouts/${encodeURIComponent(reference)}`)
    return mapPayout(unwrapEntity(data, 'payout'))
  }

  async #listTransactions(params = {}) {
    let cursor
    let transactions = []
    for (let page = 0; page < 10; page += 1) {
      const data = await this.client.request('GET', '/api/transactions', { limit: params.limit ?? 100, ...(cursor ? { cursor } : {}) })
      if (!Array.isArray(data?.transactions)) throw new AppError(502, 'Réponse Bitnob invalide : transactions absentes.')
      transactions = transactions.concat(data.transactions)
      if (!data.has_more) break
      if (!data.next_cursor) throw new AppError(502, 'Réponse Bitnob invalide : curseur de pagination absent.')
      cursor = data.next_cursor
    }
    if (cursor) throw new AppError(502, 'Historique Bitnob trop volumineux : pagination incomplète après 10 pages.')
    return transactions
  }

  async getDepositAddresses() {
    let cursor
    const addresses = []
    for (let page = 0; page < 10; page += 1) {
      const data = await this.client.request('GET', '/api/addresses', { limit: 100, ...(cursor ? { cursor } : {}) })
      if (!Array.isArray(data?.addresses)) throw new AppError(502, 'Réponse Bitnob invalide : addresses absent.')
      addresses.push(...data.addresses.map((item) => ({ ...item, chain: String(item.chain).toLowerCase() })))
      if (!data.has_more) break
      if (!data.next_cursor) throw new AppError(502, 'Réponse Bitnob invalide : curseur de pagination des adresses absent.')
      cursor = data.next_cursor
    }
    if (cursor) throw new AppError(502, 'Liste des adresses Bitnob trop volumineuse : pagination incomplète après 10 pages.')
    return addresses
  }

  async listCustomers(params = {}) { return this.client.request('GET', '/api/customers', params) }
  async createCustomer(customer) { return this.client.request('POST', '/api/customers', customer) }
  async getSupportedVirtualAccountCurrencies() { return this.client.request('GET', '/api/virtual-accounts/supported-currencies') }
  async listVirtualAccounts(params = {}) { return this.client.request('GET', '/api/virtual-accounts', params) }
  async createVirtualAccount(input) { return this.client.request('POST', '/api/virtual-accounts', input) }
  async getVirtualAccount(id) { return this.client.request('GET', `/api/virtual-accounts/${encodeURIComponent(id)}`) }
  async getVirtualAccountTransactions(id, params = {}) { return this.client.request('GET', `/api/virtual-accounts/${encodeURIComponent(id)}/transactions`, params) }
  async updateVirtualAccountAlias(id, alias) { return this.client.request('PATCH', `/api/virtual-accounts/${encodeURIComponent(id)}/alias`, { account_alias: alias }) }
  async submitCryptoTransfer({ transfer, channel, sourceCurrency }) {
    const address = String(channel.account ?? channel.address ?? '').trim()
    const asset = String(channel.asset ?? '').toUpperCase()
    if (!channel.chain) throw new AppError(400, 'Réseau crypto requis.')
    if (!asset) throw new AppError(400, 'Actif crypto requis.')
    const chain = this.#normalizeChain(channel.chain)
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
    return { ...transaction, status: mapTransactionStatus(transaction.state ?? transaction.status), bitnobStatus: transaction.state ?? transaction.status }
  }

  async createCryptoWithdrawal({ address, amount, currency, chain, reference, description, memo }) {
    return this.client.request('POST', '/api/withdrawals', {
      to_address: address, amount: String(amount), currency, chain, reference,
      ...(description ? { description } : {}), ...(memo ? { memo } : {}),
    })
  }

  async getRates() {
    const data = await this.client.request('GET', '/api/exchange-rates', { base: 'USD' })
    if (!Array.isArray(data?.rates)) throw new AppError(502, 'Réponse Bitnob invalide : rates absent.')
    const rates = {}
    for (const item of data.rates) {
      const currency = String(item.target_currency ?? item.currency ?? '').toUpperCase()
      const rate = Number(item.mid_rate ?? item.rate)
      if (currency && Number.isFinite(rate)) rates[currency] = rate
    }
    return { updatedAt: data.timestamp, source: this.mode, rates, rateDetails: data.rates, skippedCurrencies: data.skipped_currencies }
  }

  async getSupportedPayoutCountries() {
    const data = await this.client.request('GET', '/api/payouts/supported-countries')
    if (!Array.isArray(data?.countries)) throw new AppError(502, 'Réponse Bitnob invalide : countries absent.')
    return data
  }

  async getPayoutCountryDetails(country) {
    return this.client.request('GET', `/api/payouts/supported-countries/${encodeURIComponent(country)}`)
  }

  async lookupAccount({ country, accountNumber, bankCode, method }) {
    const params = { country, bank_code: bankCode, account_number: digitsOnly(accountNumber) }
    if (method === 'mobile') params.type = 'mobile_money'
    const data = await this.client.request('GET', '/api/payouts/account-lookup', params)
    return {
      ...data,
      ...(data?.account_name !== undefined ? { accountName: data.account_name } : {}),
      ...(data?.account_number !== undefined ? { accountNumber: data.account_number } : {}),
      ...(data?.bank_code !== undefined ? { bankCode: data.bank_code } : {}),
      ...(data?.bank_name !== undefined ? { bankName: data.bank_name } : {}),
      ...(data?.is_verified !== undefined ? { isVerified: data.is_verified } : {}),
    }
  }

  async createQuote({ amount, sendCurrency = 'USD', toCountry, receiveCurrency, reference, paymentReason = 'family_support', fundingMode = 'offchain', chain }) {
    const fromAsset = ASSETS_BY_CURRENCY[sendCurrency]
    if (!fromAsset) throw new AppError(400, `Bitnob ne prend pas en charge la devise source ${sendCurrency} pour les payouts. Utilise USD, USDT, USDC ou BTC.`)
    if (fundingMode === 'onchain' && !chain) throw new AppError(400, 'Le réseau de financement Bitnob est requis en mode on-chain.')
    const payoutReference = reference ?? createReference('PBQT')
    const data = await this.client.request('POST', '/api/payouts/quotes', {
      amount: String(amount), country: toCountry, from_asset: fromAsset,
      to_currency: receiveCurrency,
      source: fundingMode === 'onchain' ? 'onchain' : 'offchain',
      ...(fundingMode === 'onchain' ? { chain: this.#normalizeChain(chain) } : {}),
      payment_reason: paymentReason, reference: payoutReference,
    })
    const payout = data?.quote ?? data?.payout ?? data
    return {
      amount: toNumber(payout.amount), fee: toNumber(payout.fees),
      rate: toNumber(payout.exchange_rate?.effective_rate ?? payout.exchange_rate?.rate),
      received: toNumber(payout.settlement_amount), expiresAt: payout.expires_at,
      receiveCurrency: payout.to_currency, quoteId: payout.quote_id, payoutId: payout.id, reference: payout.reference ?? payoutReference,
      bitnob: payout,
    }
  }

  async submitPayout(transfer, quote, beneficiary) {
    const isMobile = beneficiary.method === 'mobile'
    const provider = String(beneficiary.provider ?? '').toUpperCase()
    const network = beneficiary.network ?? MOBILE_NETWORK_CODES[provider]
    if (isMobile && !network) throw new AppError(400, 'Code réseau Bitnob requis pour ce bénéficiaire mobile money.')
    const callbackUrl = this.#callbackUrl()
    const destination = {
      destination_type: isMobile ? 'mobile_money' : 'bank',
      country: transfer.toCountry,
      account_name: beneficiary.accountName ?? beneficiary.name,
      account_number: digitsOnly(beneficiary.account),
      ...(isMobile ? { network } : { bank_code: beneficiary.bankCode }),
      ...(isMobile && ['SN', 'CI'].includes(String(transfer.toCountry).toUpperCase()) && this.settings.payoutSenderName && transfer.fromCountry
        ? { sender: { account_name: this.settings.payoutSenderName, country: transfer.fromCountry } }
        : {}),
    }
    await this.initializePayout(quote.quoteId, {
      quote_id: quote.quoteId, reference: transfer.reference,
      payment_reason: transfer.paymentReason,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      beneficiary: destination,
    })
    const finalized = await this.finalizePayout(quote.quoteId)
    return mapPayout(unwrapEntity(finalized, 'payout'))
  }

  async initializePayout(quoteId, input) {
    return this.client.request('POST', `/api/payouts/${encodeURIComponent(quoteId)}/initialize`, input)
  }

  async finalizePayout(quoteId) {
    return this.client.request('POST', `/api/payouts/${encodeURIComponent(quoteId)}/finalize`)
  }

  async getPayoutStatus(reference) {
    const data = await this.client.request('GET', `/api/payouts/reference/${encodeURIComponent(reference)}`)
    return mapPayout(unwrapEntity(data, 'payout'))
  }

  async getPayout(id) {
    const data = await this.client.request('GET', `/api/payouts/${encodeURIComponent(id)}`)
    return mapPayout(unwrapEntity(data, 'payout'))
  }

  async listPayouts({ limit = 100, offset = 0 } = {}) {
    const data = await this.client.request('GET', '/api/payouts', { limit, offset })
    if (!Array.isArray(data?.items)) throw new AppError(502, 'Réponse Bitnob invalide : items des payouts absent.')
    return data.items.map(mapPayout)
  }

  async listBeneficiaries() {
    const data = await this.client.request('GET', '/api/beneficiaries')
    const list = data?.beneficiaries
    if (!Array.isArray(list)) throw new AppError(502, 'Réponse Bitnob invalide : beneficiaries absent.')
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
        currency: String(input.asset ?? input.currency).toUpperCase(),
        network: this.#normalizeChain(input.chain ?? input.network),
      })
      return this.#mapBeneficiary(unwrapEntity(data, 'beneficiary'))
    }
    const mobileNetwork = input.network ?? MOBILE_NETWORK_CODES[String(input.provider ?? '').toUpperCase()]
    if (input.method === 'mobile' && !mobileNetwork) throw new AppError(400, 'network est requis pour un bénéficiaire mobile money.')
    const destination = {
      account_name: input.accountName ?? input.name,
      account_number: String(input.account),
      bank_code: input.bankCode,
      country: String(input.country).toUpperCase(),
      destination_type: input.method === 'mobile' ? 'mobile_money' : 'bank',
      ...(input.method === 'mobile' ? { network: mobileNetwork } : {}),
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
      ...data,
      paymentHash: data.payment_hash,
      amountSat: Number(data.amount_sat),
      expiresAt: this.#unixTimestamp(data.expires_at),
      isExpired: data.is_expired,
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
    if (!description) throw new AppError(400, 'description est requis pour créer une facture Lightning Bitnob.')
    const data = await this.client.request('POST', '/api/lightning/invoices', {
      amount: amountSat, description, reference: createReference('PBLN'),
    })
    return { ...data, paymentRequest: data.request, amountSat: Number(data.amount_sat) }
  }

  async payLightningInvoice(paymentRequest) {
    const reference = createReference('PBLN')
    const data = await this.client.request('POST', '/api/lightning/pay', { request: paymentRequest, reference })
    return { ...data, id: data.id ?? data.transaction_id, amountSat: Number(data.amount_sat), feeSat: Number(data.fee_sat) }
  }

  async validateAddress({ address, chain }) {
    const normalizedChain = this.#normalizeChain(chain)
    const data = await this.client.request('POST', '/api/addresses/validate', { address, chain: normalizedChain })
    return { ...data, source: this.mode }
  }

  async getDepositAddress(chain) {
    const normalizedChain = this.#normalizeChain(chain)
    const data = await this.client.request('POST', '/api/addresses', {
      chain: normalizedChain, label: `PayBridge ${normalizedChain} deposit`, reference: createReference('PBADDR'),
    })
    return { ...data, source: this.mode }
  }

  #mapBeneficiary(record = {}) {
    const destination = parseDestination(record.destination)
    return {
      ...record,
      id: record.id,
      name: record.name ?? destination.account_name,
      accountName: destination.account_name ?? record.account_name ?? record.name,
      country: String(destination.country ?? record.country ?? '').toUpperCase() || undefined,
      method: destination.destination_type === 'mobile_money' ? 'mobile' : record.type === 'crypto' ? 'crypto' : record.type === 'bank' ? 'bank' : undefined,
      provider: destination.network ?? destination.bank_name ?? destination.bank_code,
      network: destination.network,
      account: destination.account_number ?? record.wallet_address,
      asset: String(record.currency ?? destination.currency ?? '').toUpperCase() || undefined,
      chain: record.network ?? destination.network,
      bankCode: destination.bank_code,
      isActive: record.is_active,
      isBlacklisted: record.is_blacklisted,
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
