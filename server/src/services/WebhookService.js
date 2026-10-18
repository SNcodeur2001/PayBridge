import crypto from 'node:crypto'
import { AppError } from '../core/AppError.js'
import { WEBHOOK_STATUS } from '../config/paybridge.js'

export class WebhookService {
  constructor({ repository, settings, provider }) {
    this.repository = repository
    this.settings = settings
    this.provider = provider
  }

  handle(rawBody, signature) {
    this.#verifySignature(rawBody, signature)
    let event
    try { event = JSON.parse(rawBody.toString('utf8') || '{}') } catch { throw new AppError(400, 'Corps JSON du webhook invalide.') }
    const eventId = event.event_id ?? event.eventId
    const eventType = event.event ?? event.eventType
    if (eventType === 'virtual_account.deposit.success') {
      const payload = event.payload ?? {}
      if (!payload.virtual_account_id || payload.amount === undefined || !payload.currency) {
        throw new AppError(400, 'Payload de dépôt de compte virtuel incomplet.')
      }
      if (this.repository.rememberWebhookEvent(eventId)) return { received: true, dedup: true }
      this.repository.addVirtualAccountDeposit({
        eventId: eventId ?? null,
        virtualAccountId: payload.virtual_account_id,
        amount: String(payload.amount),
        currency: String(payload.currency).toUpperCase(),
        reference: payload.reference ?? null,
        ledgerTransactionId: payload.ledger_transaction_id ?? null,
        providerTransactionId: payload.provider_transaction_id ?? null,
        receivedAt: new Date().toISOString(),
      })
      return { received: true }
    }

    if (this.repository.rememberWebhookEvent(eventId)) return { received: true, dedup: true }

    const payout = event.data?.payout ?? event.data?.withdrawal ?? event.data ?? {}
    const transfer = this.repository.getTransferByReference(payout.reference ?? event.data?.reference)
    const transferWebhookStatus = {
      'transfer.success': 'completed', 'transfer.failed': 'failed',
      'payouts.initialized': 'pending', 'payouts.processing': 'processing',
      'payouts.withdrawal.success': 'completed', 'payouts.withdrawal.expired': 'failed',
    }
    const nextStatus = transferWebhookStatus[eventType] ?? WEBHOOK_STATUS[eventType]
    if (transfer && nextStatus) this.repository.updateTransferStatus(transfer.id, nextStatus)
    return { received: true }
  }

  #verifySignature(rawBody, signature) {
    const secret = this.settings.bitnob.webhookSecret
    if (!secret) {
      if (!this.provider.isLive) return
      throw new AppError(401, 'Secret de webhook Bitnob non configuré.')
    }
    if (!signature) throw new AppError(401, 'Signature webhook manquante.')
    const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex')
    const expectedBuffer = Buffer.from(expected)
    const signatureBuffer = Buffer.from(signature)
    if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
      throw new AppError(401, 'Signature webhook invalide.')
    }
  }
}
