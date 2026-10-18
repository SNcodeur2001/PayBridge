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
    this.virtualAccountDeposits = []
    this.listeners = new Set()
  }

  listTransfers() { return [...this.transfers] }
  getTransfer(id) { return this.transfers.find((transfer) => transfer.id === id) }
  getTransferByReference(reference) { return this.transfers.find((transfer) => transfer.reference === reference) }
  createTransfer(transfer) { this.transfers.unshift(transfer); this.persist(); return transfer }
  listBeneficiaries() { return [...this.beneficiaries] }
  getBeneficiary(id) { return this.beneficiaries.find((beneficiary) => beneficiary.id === id) }
  findBeneficiary({ account, country }) { return this.beneficiaries.find((item) => item.account === account && item.country === country) }
  addBeneficiary(beneficiary) { this.beneficiaries.unshift(beneficiary); this.persist(); return beneficiary }

  replaceBeneficiaries(beneficiaries) {
    this.beneficiaries = structuredClone(beneficiaries)
    this.persist()
    return this.listBeneficiaries()
  }

  upsertBeneficiary(beneficiary) {
    const index = this.beneficiaries.findIndex((item) => item.id === beneficiary.id)
    if (index < 0) this.beneficiaries.unshift(structuredClone(beneficiary))
    else this.beneficiaries[index] = structuredClone(beneficiary)
    this.persist()
    return beneficiary
  }

  updateBeneficiary(id, changes) {
    const existing = this.getBeneficiary(id)
    if (!existing) return null
    Object.assign(existing, changes, { id: existing.id })
    this.persist()
    return existing
  }

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

  listVirtualAccountDeposits() { return [...this.virtualAccountDeposits] }

  addVirtualAccountDeposit(deposit) {
    this.virtualAccountDeposits.unshift(deposit)
    this.persist()
    const event = { type: 'virtual_account.deposit.success', data: deposit }
    for (const listener of this.listeners) {
      try { listener(event) } catch { /* disconnected SSE clients are removed on close */ }
    }
    return deposit
  }

  persist() {}
}
