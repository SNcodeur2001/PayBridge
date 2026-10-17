const beneficiaries = [
  { id: 'b1', name: 'Kwame Mensah', country: 'GH', method: 'mobile', provider: 'MTN MoMo', account: '+233 24 ••• 4412' },
  { id: 'b2', name: 'Chiamaka Obi', country: 'NG', method: 'bank', provider: 'GTBank Nigeria', account: '0123456789', bankCode: '058' },
  { id: 'b3', name: 'Moussa Ndiaye', country: 'SN', method: 'mobile', provider: 'Wave', account: '+221 77 ••• 2208' },
  { id: 'b4', name: 'Wanjiku Kamau', country: 'KE', method: 'mobile', provider: 'M-Pesa', account: '+254 7•• ••• 118' },
  { id: 'b5', name: 'Aïcha Koné', country: 'CI', method: 'mobile', provider: 'Orange Money', account: '+225 07 ••• 5560' },
  { id: 'b6', name: 'Jean-Paul Ekané', country: 'CM', method: 'bank', provider: 'Afriland', account: '1234567890', bankCode: '00012' },
  { id: 'b7', name: 'Thandi Nkosi', country: 'ZA', method: 'bank', provider: 'FNB', account: '62834123456', bankCode: 'FNB' },
]
const transfers = []
const listeners = new Set()

export const repository = {
  listBeneficiaries: () => [...beneficiaries],
  getBeneficiary: (id) => beneficiaries.find((item) => item.id === id),
  addBeneficiary: (item) => (beneficiaries.unshift(item), item),
  listTransfers: () => [...transfers],
  getTransfer: (id) => transfers.find((item) => item.id === id),
  getTransferByReference: (reference) => transfers.find((item) => item.reference === reference),
  createTransfer: (item) => (transfers.unshift(item), item),
  subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
  updateTransferStatus(id, status, extra = {}) {
    const transfer = transfers.find((item) => item.id === id)
    if (!transfer || transfer.status === status) return transfer
    transfer.status = status
    const stamp = { pending: 'pendingAt', processing: 'processingAt', completed: 'completedAt', failed: 'failedAt' }[status]
    if (stamp && !transfer[stamp]) transfer[stamp] = new Date().toISOString()
    Object.assign(transfer, extra)
    for (const listener of listeners) listener({ type: 'transfer.status', data: { id, status } })
    return transfer
  },
}
