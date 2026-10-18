import { nowIso } from '../core/utils.js'

const DEFAULT_BENEFICIARIES = [
  { id: 'b1', name: 'Kwame Mensah', country: 'GH', method: 'mobile', provider: 'MTN MoMo', account: '+233 24 ••• 4412' },
  { id: 'b2', name: 'Chiamaka Obi', country: 'NG', method: 'bank', provider: 'GTBank Nigeria', account: '0123456789', bankCode: '058' },
  { id: 'b3', name: 'Moussa Ndiaye', country: 'SN', method: 'mobile', provider: 'Wave', account: '+221 77 ••• 2208' },
  { id: 'b4', name: 'Wanjiku Kamau', country: 'KE', method: 'mobile', provider: 'M-Pesa', account: '+254 7•• ••• 118' },
  { id: 'b5', name: 'Aïcha Koné', country: 'CI', method: 'mobile', provider: 'Orange Money', account: '+225 07 ••• 5560' },
  { id: 'b6', name: 'Jean-Paul Ekané', country: 'CM', method: 'bank', provider: 'Afriland', account: '1234567890', bankCode: '00012' },
  { id: 'b7', name: 'Thandi Nkosi', country: 'ZA', method: 'bank', provider: 'FNB', account: '62834123456', bankCode: 'FNB' },
]

/** In-memory persistence adapter for the hackathon prototype. */
export class MemoryRepository {
  constructor() {
    this.transfers = []
    this.beneficiaries = structuredClone(DEFAULT_BENEFICIARIES)
    this.seenWebhookEvents = new Set()
    this.listeners = new Set()
  }

  listTransfers() { return [...this.transfers] }
  getTransfer(id) { return this.transfers.find((transfer) => transfer.id === id) }
  getTransferByReference(reference) { return this.transfers.find((transfer) => transfer.reference === reference) }
  createTransfer(transfer) { this.transfers.unshift(transfer); return transfer }
  listBeneficiaries() { return [...this.beneficiaries] }
  getBeneficiary(id) { return this.beneficiaries.find((beneficiary) => beneficiary.id === id) }
  findBeneficiary({ account, country }) { return this.beneficiaries.find((item) => item.account === account && item.country === country) }
  addBeneficiary(beneficiary) { this.beneficiaries.unshift(beneficiary); return beneficiary }

  replaceBeneficiaries(beneficiaries) {
    this.beneficiaries = structuredClone(beneficiaries)
    return this.listBeneficiaries()
  }

  upsertBeneficiary(beneficiary) {
    const index = this.beneficiaries.findIndex((item) => item.id === beneficiary.id)
    if (index < 0) this.beneficiaries.unshift(structuredClone(beneficiary))
    else this.beneficiaries[index] = structuredClone(beneficiary)
    return beneficiary
  }

  updateBeneficiary(id, changes) {
    const existing = this.getBeneficiary(id)
    if (!existing) return null
    Object.assign(existing, changes, { id: existing.id })
    return existing
  }

  updateTransferStatus(id, status, extra = {}) {
    const transfer = this.getTransfer(id)
    if (!transfer || transfer.status === status) return transfer
    transfer.status = status
    const stamp = { pending: 'pendingAt', processing: 'processingAt', completed: 'completedAt', failed: 'failedAt' }[status]
    if (stamp && !transfer[stamp]) transfer[stamp] = nowIso()
    Object.assign(transfer, extra)
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
    return false
  }
}
