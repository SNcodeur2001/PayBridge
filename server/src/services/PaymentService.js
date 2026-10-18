import crypto from 'node:crypto'
import { AppError } from '../core/AppError.js'
import { createReference, nowIso } from '../core/utils.js'
import { COUNTRIES, CURRENCIES } from '../config/paybridge.js'

const PAYOUT_STATUSES = Object.freeze({ COMPLETED: 'completed', FAILED: 'failed', EXPIRED: 'failed', PENDING: 'processing', PROCESSING: 'processing', FUNDED: 'processing' })

/** Business workflows independent of HTTP and of the payment provider implementation. */
export class PaymentService {
  constructor({ provider, repository }) {
    this.provider = provider
    this.repository = repository
  }

  async createQuote({ amount, toCountry, sendCurrency = 'USD', fundingMode = 'offchain' }) {
    const receiveCurrency = Object.hasOwn(COUNTRIES, toCountry) ? COUNTRIES[toCountry] : null
    if (!receiveCurrency) throw new AppError(400, `Pays non supporté : ${toCountry}`)
    if (!Object.hasOwn(CURRENCIES, sendCurrency)) throw new AppError(400, `Devise non supportée : ${sendCurrency}`)
    return this.provider.createQuote({ amount: Number(amount), toCountry, sendCurrency, receiveCurrency, fundingMode })
  }

  async createTransfer({ amount, toCountry, sendCurrency = 'USD', beneficiary, channel, fromCountry = 'SN', paymentReason = 'family_support', fundingMode = 'offchain' }) {
    const selectedChannel = channel ?? beneficiary.channels?.find((item) => item.isDefault) ?? beneficiary
    const kind = selectedChannel.kind ?? selectedChannel.method ?? beneficiary.method
    if (kind === 'crypto') return this.#createCryptoTransfer({ amount, toCountry, sendCurrency, beneficiary, channel: selectedChannel, fromCountry })
    if (kind === 'lightning') return this.#createLightningTransfer({ amount, toCountry, sendCurrency, beneficiary, channel: selectedChannel, fromCountry })

    const reference = createReference()
    const receiveCurrency = COUNTRIES[toCountry]
    const quote = await this.provider.createQuote({ amount: Number(amount), toCountry, sendCurrency, receiveCurrency, reference, paymentReason, fundingMode })
    const transfer = this.repository.createTransfer({
      id: reference, reference, createdAt: nowIso(), pendingAt: nowIso(),
      beneficiaryId: beneficiary.id, beneficiaryName: beneficiary.name,
      fromCountry, toCountry, sendCurrency, amount: quote.amount, fee: quote.fee,
      rate: quote.rate, receiveCurrency: COUNTRIES[toCountry], received: quote.received,
      method: kind === 'mobile' ? 'mobile' : 'bank', provider: selectedChannel.label ?? selectedChannel.provider ?? beneficiary.provider, paymentReason,
      fundingMode, quoteId: quote.quoteId, status: 'pending', demo: !this.provider.isLive,
    })
    try {
      await this.provider.submitPayout(transfer, quote, { ...beneficiary, ...selectedChannel, method: kind === 'mobile' ? 'mobile' : 'bank' }, this.repository)
    } catch (error) {
      // Once a live request has reached Bitnob, a 5xx/timeout can mean the remote
      // payout succeeded but its response was lost. Keep it reconcilable by reference.
      if (!this.provider.isLive || Number(error.status) < 500) {
        this.repository.updateTransferStatus(transfer.id, 'failed', { failureReason: error.message })
      }
      if (this.provider.isLive && Number(error.status) >= 500) {
        throw new AppError(502, error.message, {
          ...(error.details && typeof error.details === 'object' ? error.details : {}),
          transferId: transfer.id, reference: transfer.reference,
          reconciliationRequired: true,
        })
      }
      throw error
    }
    return transfer
  }

  async #createCryptoTransfer({ amount, toCountry, sendCurrency, beneficiary, channel, fromCountry }) {
    const reference = createReference('PBCR')
    const transfer = this.repository.createTransfer({
      id: reference, reference, createdAt: nowIso(), pendingAt: nowIso(),
      beneficiaryId: beneficiary.id, beneficiaryName: beneficiary.name,
      fromCountry, toCountry, sendCurrency, amount: Number(amount), fee: 0,
      rate: null, receiveCurrency: String(channel.asset ?? sendCurrency).toUpperCase(),
      received: null, method: 'crypto', provider: channel.label ?? channel.provider ?? channel.chain ?? 'crypto',
      status: 'pending', demo: !this.provider.isLive,
    })
    try {
      const result = await this.provider.submitCryptoTransfer({ transfer, channel, sourceCurrency: sendCurrency })
      Object.assign(transfer, { providerRef: result.providerRef, received: result.amount, receiveCurrency: result.currency, fee: result.fee })
      this.repository.persist?.()
      if (result.status !== 'pending') this.repository.updateTransferStatus(reference, result.status)
      return transfer
    } catch (error) {
      if (Number(error.status) < 500) this.repository.updateTransferStatus(reference, 'failed', { failureReason: error.message })
      if (Number(error.status) >= 500) throw new AppError(502, error.message, { ...(error.details ?? {}), transferId: reference, reference, reconciliationRequired: true })
      throw error
    }
  }

  async #createLightningTransfer({ amount, toCountry, sendCurrency, beneficiary, channel, fromCountry }) {
    const paymentRequest = String(channel.account ?? channel.paymentRequest ?? '').trim()
    if (!paymentRequest) throw new AppError(400, 'Facture Lightning (BOLT11) manquante.')
    const reference = createReference('PBLN')
    const transfer = this.repository.createTransfer({
      id: reference, reference, createdAt: nowIso(), pendingAt: nowIso(),
      beneficiaryId: beneficiary.id, beneficiaryName: beneficiary.name,
      fromCountry, toCountry, sendCurrency, amount: Number(amount), fee: 0,
      rate: null, receiveCurrency: 'SATS', received: null,
      method: 'lightning', provider: channel.label ?? 'Lightning',
      status: 'pending', demo: !this.provider.isLive,
    })
    try {
      const result = await this.provider.payLightningInvoice(paymentRequest, reference)
      Object.assign(transfer, { providerRef: result.id, received: result.amountSat, fee: result.feeSat })
      this.repository.persist?.()
      if (result.status === 'paid' || result.status === 'completed') this.repository.updateTransferStatus(reference, 'completed')
      else if (result.status === 'failed') this.repository.updateTransferStatus(reference, 'failed')
      else this.repository.updateTransferStatus(reference, 'processing')
      return transfer
    } catch (error) {
      if (Number(error.status) < 500) this.repository.updateTransferStatus(reference, 'failed', { failureReason: error.message })
      if (Number(error.status) >= 500) throw new AppError(502, error.message, { ...(error.details ?? {}), transferId: reference, reference, reconciliationRequired: true })
      throw error
    }
  }

  async createExternalPayout({ amount, toCountry, sendCurrency = 'USD', beneficiary: input, paymentReason = 'business_payment' }) {
    const beneficiary = this.repository.findBeneficiary({ account: input.account, country: toCountry })
      ?? this.repository.addBeneficiary({
        id: `b-${crypto.randomUUID()}`, name: String(input.name).trim(), country: toCountry,
        method: input.method ?? 'bank', provider: input.provider ?? '',
        account: String(input.account), bankCode: input.bankCode,
      })
    const transfer = await this.createTransfer({ amount, toCountry, sendCurrency, beneficiary, fromCountry: 'API', paymentReason })
    return {
      id: transfer.id, reference: transfer.reference, status: transfer.status,
      amount: transfer.amount, fee: transfer.fee, rate: transfer.rate,
      received: transfer.received, receiveCurrency: transfer.receiveCurrency, sendCurrency,
    }
  }

  mapPayoutStatus(status = '') {
    const normalized = String(status).toUpperCase()
    if (normalized === 'SUCCESS') return 'completed'
    return PAYOUT_STATUSES[normalized] ?? 'pending'
  }

  async refreshPendingTransfers() {
    if (!this.provider.isLive) return
    for (const transfer of this.repository.listTransfers()) {
      if (['completed', 'failed'].includes(transfer.status)) continue
      try {
        const payout = ['crypto', 'lightning'].includes(transfer.method)
          ? await this.provider.getTransaction(transfer.providerRef ?? transfer.reference)
          : await this.provider.getPayoutStatus(transfer.reference)
        const nextStatus = ['crypto', 'lightning'].includes(transfer.method)
          ? payout?.status ?? 'pending'
          : this.mapPayoutStatus(payout?.status)
        if (nextStatus !== transfer.status) this.repository.updateTransferStatus(transfer.id, nextStatus)
      } catch { /* next polling cycle retries transient errors */ }
    }
  }
}
