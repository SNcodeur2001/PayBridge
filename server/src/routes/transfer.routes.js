import { Router } from 'express'
import { AppError } from '../core/AppError.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { COUNTRIES, CURRENCIES } from '../config/paybridge.js'

export function createTransferRouter({ repository, paymentService }) {
  const router = Router()
  router.get('/', asyncHandler(async (_req, res) => {
    res.json(repository.listTransfers())
  }))
  router.get('/:id', asyncHandler(async (req, res) => {
    let transfer = repository.getTransfer(req.params.id)
    if (!transfer && paymentService.provider.isLive) {
      try { transfer = await paymentService.provider.getPayoutStatus(req.params.id) }
      catch { transfer = await paymentService.provider.getTransaction(req.params.id) }
    }
    if (!transfer) throw new AppError(404, 'Transfert introuvable.')
    res.json(transfer)
  }))
  router.post('/', asyncHandler(async (req, res) => {
    const body = req.body ?? {}
    const amount = Number(body.amount)
    const toCountry = String(body.toCountry ?? '').toUpperCase()
    const sendCurrency = String(body.sendCurrency ?? 'USD').toUpperCase()
    const beneficiary = repository.getBeneficiary(body.beneficiaryId)
    if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, 'montant invalide.')
    if (!beneficiary) throw new AppError(400, 'Bénéficiaire inconnu.')
    const channel = body.channel ?? beneficiary?.channels?.find((item) => item.id === body.channelId) ?? beneficiary?.channels?.find((item) => item.isDefault) ?? beneficiary
    const kind = channel?.kind ?? channel?.method ?? beneficiary?.method
    if (kind !== 'crypto' && kind !== 'lightning' && (!Object.hasOwn(COUNTRIES, toCountry) || (beneficiary.country && beneficiary.country !== toCountry))) throw new AppError(400, 'Pays incompatible avec le bénéficiaire.')
    if (!Object.hasOwn(CURRENCIES, sendCurrency)) throw new AppError(400, `Devise non supportée : ${sendCurrency}`)
    const transfer = await paymentService.createTransfer({
      amount, toCountry: toCountry || beneficiary.country || 'US', sendCurrency, beneficiary: { ...beneficiary, country: toCountry || beneficiary.country }, channel,
      fromCountry: body.fromCountry ?? 'SN', paymentReason: body.paymentReason ?? 'family_support',
      fundingMode: body.fundingMode === 'onchain' ? 'onchain' : 'offchain',
    })
    res.status(201).json(transfer)
  }))
  router.post('/:id/simulate-deposit', asyncHandler(async (req, res) => {
    const transfer = repository.getTransfer(req.params.id)
    if (!transfer) throw new AppError(404, 'Transfert introuvable.')
    if (transfer.fundingMode !== 'onchain') throw new AppError(400, 'Ce transfert ne nécessite pas de financement sandbox on-chain.')
    if (!transfer.quoteId) throw new AppError(400, 'Quote Bitnob introuvable pour ce transfert.')
    if (!paymentService.provider.isLive) throw new AppError(503, 'Le financement sandbox nécessite le fournisseur Bitnob.')
    await paymentService.provider.simulatePayoutDeposit(transfer.quoteId, transfer.amount)
    res.json(transfer)
  }))
  return router
}
