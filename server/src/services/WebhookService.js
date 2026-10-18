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
    if (this.repository.rememberWebhookEvent(event.event_id ?? event.eventId)) return { received: true, dedup: true }

    const payout = event.data?.payout ?? event.data ?? {}
    const transfer = this.repository.getTransferByReference(payout.reference ?? event.data?.reference)
    const nextStatus = WEBHOOK_STATUS[event.event]
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
