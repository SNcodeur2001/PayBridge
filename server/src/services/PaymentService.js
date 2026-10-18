import { AppError } from '../core/AppError.js'
import { createReference, nowIso } from '../core/utils.js'
import { SUPPORTED_SEND_CURRENCIES } from '../config/paybridge.js'

const PAYOUT_STATUSES = Object.freeze({ COMPLETED: 'completed', FAILED: 'failed', EXPIRED: 'failed', PENDING: 'processing', PROCESSING: 'processing', FUNDED: 'processing' })

/** Business workflows independent of HTTP and of the payment provider implementation. */
export class PaymentService {
  constructor({ provider, repository }) {
    this.provider = provider
    this.repository = repository
  }

  async createQuote({ amount, toCountry, sendCurrency = 'USD', receiveCurrency, reference, paymentReason, fundingMode = 'offchain', chain }) {
    if (!SUPPORTED_SEND_CURRENCIES.includes(sendCurrency)) throw new AppError(400, `Devise non supportée par Bitnob : ${sendCurrency}`)
    const catalog = await this.provider.getSupportedPayoutCountries()
    const country = catalog.countries.find((item) => item.code === String(toCountry).toUpperCase())
    if (!country) throw new AppError(400, `Pays non pris en charge par Bitnob : ${toCountry}`)
    const targetCurrency = receiveCurrency ? String(receiveCurrency).toUpperCase() : undefined
    const corridor = country.corridors?.find((item) => item.currency === targetCurrency) ?? (!targetCurrency ? country.corridors?.[0] : null)
    if (!corridor) throw new AppError(400, `Devise de réception non prise en charge par Bitnob pour ${toCountry} : ${receiveCurrency}`)
    return this.provider.createQuote({ amount: Number(amount), toCountry: country.code, sendCurrency, receiveCurrency: corridor.currency, reference, paymentReason, fundingMode, chain })
  }

  async createTransfer({ amount, toCountry, sendCurrency = 'USD', receiveCurrency, beneficiary, channel, fromCountry, paymentReason = 'family_support', fundingMode = 'offchain', chain }) {
    const selectedChannel = channel ?? beneficiary.channels?.find((item) => item.isDefault) ?? beneficiary
    const kind = selectedChannel.kind ?? selectedChannel.method ?? beneficiary.method
    if (kind === 'crypto') return this.#createCryptoTransfer({ amount, toCountry, sendCurrency, beneficiary, channel: selectedChannel, fromCountry })
    if (kind === 'lightning') return this.#createLightningTransfer({ amount, toCountry, sendCurrency, beneficiary, channel: selectedChannel, fromCountry })

    const reference = createReference()
    const quote = await this.createQuote({ amount: Number(amount), toCountry, sendCurrency, receiveCurrency, reference, paymentReason, fundingMode, chain })
    const transfer = this.repository.createTransfer({
      id: reference, reference, createdAt: nowIso(), pendingAt: nowIso(),
      beneficiaryId: beneficiary.id, beneficiaryName: beneficiary.name,
      fromCountry, toCountry, sendCurrency, amount: quote.amount, fee: quote.fee,
      rate: quote.rate, receiveCurrency: quote.receiveCurrency, received: quote.received,
      method: kind === 'mobile' ? 'mobile' : 'bank', provider: selectedChannel.label ?? selectedChannel.provider ?? beneficiary.provider, paymentReason,
      fundingMode, quoteId: quote.quoteId, status: 'pending',
    })
    try {
      const payout = await this.provider.submitPayout(transfer, quote, { ...beneficiary, ...selectedChannel, method: kind === 'mobile' ? 'mobile' : 'bank' })
      const { status, id: bitnobId, ...payoutFields } = payout
      Object.assign(transfer, payoutFields, { id: transfer.id, reference: transfer.reference, bitnobId, bitnob: payout.bitnob })
      this.repository.persist?.()
      if (status) this.repository.updateTransferStatus(transfer.id, status)
    } catch (error) {
      // Once a live request has reached Bitnob, a 5xx/timeout can mean the remote
      // payout succeeded but its response was lost. Keep it reconcilable by reference.
      if (Number(error.status) < 500) {
        this.repository.updateTransferStatus(transfer.id, 'failed', { failureReason: error.message })
      }
      if (Number(error.status) >= 500) {
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
      fromCountry, toCountry, sendCurrency, amount: Number(amount), fee: null,
      rate: null, receiveCurrency: String(channel.asset).toUpperCase(),
      received: null, method: 'crypto', provider: channel.label ?? channel.provider ?? channel.chain ?? 'crypto',
      status: 'pending',
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
      fromCountry, toCountry, sendCurrency, amount: Number(amount), fee: null,
      rate: null, receiveCurrency: 'SATS', received: null,
      method: 'lightning', provider: channel.label ?? 'Lightning',
      status: 'pending',
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

  async createExternalPayout({ amount, toCountry, sendCurrency = 'USD', receiveCurrency, chain, fromCountry, beneficiary: input, paymentReason = 'business_payment' }) {
    const beneficiary = {
      ...input,
      id: input.id ?? null,
      name: String(input.name).trim(),
      country: toCountry,
      method: input.method ?? 'bank',
      account: String(input.account),
    }
    const transfer = await this.createTransfer({ amount, toCountry, sendCurrency, receiveCurrency, chain, fromCountry, beneficiary, paymentReason })
    return {
      id: transfer.id, reference: transfer.reference, status: transfer.status,
      amount: transfer.amount, fee: transfer.fee, rate: transfer.rate,
      received: transfer.received, receiveCurrency: transfer.receiveCurrency, sendCurrency,
      ...(transfer.bitnob ? { bitnob: transfer.bitnob, bitnobStatus: transfer.bitnobStatus } : {}),
    }
  }

  mapPayoutStatus(status = '') {
    const normalized = String(status).toUpperCase()
    if (normalized === 'SUCCESS') return 'completed'
    return PAYOUT_STATUSES[normalized] ?? (normalized.toLowerCase() || null)
  }

  async refreshPendingTransfers() {
    for (const transfer of this.repository.listTransfers()) {
      if (['completed', 'failed'].includes(transfer.status)) continue
      try {
        const payout = ['crypto', 'lightning'].includes(transfer.method)
          ? await this.provider.getTransaction(transfer.providerRef ?? transfer.reference)
          : await this.provider.getPayoutStatus(transfer.reference)
        const nextStatus = ['crypto', 'lightning'].includes(transfer.method)
          ? payout?.status
          : this.mapPayoutStatus(payout?.status)
        if (nextStatus && nextStatus !== transfer.status) this.repository.updateTransferStatus(transfer.id, nextStatus)
      } catch { /* next polling cycle retries transient errors */ }
    }
  }
}
