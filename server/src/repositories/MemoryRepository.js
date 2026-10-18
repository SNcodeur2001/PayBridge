import { nowIso } from '../core/utils.js'

/** Local operational state for reconciling requests initiated by this backend. */
export class MemoryRepository {
  constructor() {
    this.transfers = []
    this.seenWebhookEvents = new Set()
    this.listeners = new Set()
  }

  listTransfers() { return [...this.transfers] }
  getTransfer(id) { return this.transfers.find((transfer) => transfer.id === id) }
  getTransferByReference(reference) { return this.transfers.find((transfer) => transfer.reference === reference) }
  createTransfer(transfer) { this.transfers.unshift(transfer); this.persist(); return transfer }

  updateTransferStatus(id, status, extra = {}) {
    const transfer = this.getTransfer(id)
    if (!transfer) return transfer
    if (transfer.status === status) {
      Object.assign(transfer, extra)
      if (Object.keys(extra).length) this.persist()
      return transfer
    }
    transfer.status = status
    const stamp = { pending: 'pendingAt', processing: 'processingAt', completed: 'completedAt', failed: 'failedAt' }[status]
    if (stamp && !transfer[stamp]) transfer[stamp] = nowIso()
    Object.assign(transfer, extra)
    this.persist()
    const event = { type: 'transfer.status', data: { id, status } }
    for (const listener of this.listeners) {
      try { listener(event) } catch { /* a disconnected SSE client is removed on close */ }
    }
    return transfer
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  rememberWebhookEvent(eventId) {
    if (!eventId) return false
    if (this.seenWebhookEvents.has(eventId)) return true
    this.seenWebhookEvents.add(eventId)
    this.persist()
    return false
  }

  publish(event) {
    for (const listener of this.listeners) {
      try { listener(event) } catch { /* disconnected SSE clients are removed on close */ }
    }
  }

  persist() {}
}
