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

  async createQuote({ amount, toCountry, sendCurrency = 'USD' }) {
    const receiveCurrency = Object.hasOwn(COUNTRIES, toCountry) ? COUNTRIES[toCountry] : null
    if (!receiveCurrency) throw new AppError(400, `Pays non supporté : ${toCountry}`)
    if (!Object.hasOwn(CURRENCIES, sendCurrency)) throw new AppError(400, `Devise non supportée : ${sendCurrency}`)
    return this.provider.createQuote({ amount: Number(amount), toCountry, sendCurrency, receiveCurrency })
  }

  async createTransfer({ amount, toCountry, sendCurrency = 'USD', beneficiary, fromCountry = 'SN', paymentReason = 'family_support' }) {
    const quote = await this.createQuote({ amount, toCountry, sendCurrency })
    const reference = createReference()
    const transfer = this.repository.createTransfer({
      id: reference, reference, createdAt: nowIso(), pendingAt: nowIso(),
      beneficiaryId: beneficiary.id, beneficiaryName: beneficiary.name,
      fromCountry, toCountry, sendCurrency, amount: quote.amount, fee: quote.fee,
      rate: quote.rate, receiveCurrency: COUNTRIES[toCountry], received: quote.received,
      method: beneficiary.method, provider: beneficiary.provider, paymentReason,
      status: 'pending', demo: !this.provider.isLive,
    })
    try {
      await this.provider.submitPayout(transfer, quote, beneficiary, this.repository)
    } catch (error) {
      this.repository.updateTransferStatus(transfer.id, 'failed', { failureReason: error.message })
      throw error
    }
    return transfer
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

  mapPayoutStatus(status = '') { return PAYOUT_STATUSES[String(status).toUpperCase()] ?? 'pending' }

  async refreshPendingTransfers() {
    if (!this.provider.isLive) return
    for (const transfer of this.repository.listTransfers()) {
      if (['completed', 'failed'].includes(transfer.status)) continue
      try {
        const payout = await this.provider.getPayoutStatus(transfer.reference)
        const nextStatus = this.mapPayoutStatus(payout?.status)
        if (nextStatus !== transfer.status) this.repository.updateTransferStatus(transfer.id, nextStatus)
      } catch { /* next polling cycle retries transient errors */ }
    }
  }
}
