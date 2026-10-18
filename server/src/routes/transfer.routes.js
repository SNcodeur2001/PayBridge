import { Router } from 'express'
import { AppError } from '../core/AppError.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { SUPPORTED_SEND_CURRENCIES } from '../config/paybridge.js'

export function createTransferRouter({ paymentService, provider }) {
  const router = Router()
  router.get('/', asyncHandler(async (req, res) => {
    res.json(await provider.listTransfers(req.query))
  }))
  router.get('/:id', asyncHandler(async (req, res) => {
    const transfer = await provider.getTransfer(req.params.id)
    res.json(transfer)
  }))
  router.post('/', asyncHandler(async (req, res) => {
    const body = req.body ?? {}
    const amount = Number(body.amount)
    const toCountry = String(body.toCountry ?? '').toUpperCase()
    const sendCurrency = String(body.sendCurrency ?? 'USD').toUpperCase()
    const beneficiaryId = body.beneficiaryId ?? body.beneficiary?.id
    const beneficiary = beneficiaryId ? await provider.getBeneficiary(beneficiaryId) : body.beneficiary
    if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, 'montant invalide.')
    if (!beneficiary) throw new AppError(400, 'Bénéficiaire inconnu.')
    const channel = body.channel ?? beneficiary?.channels?.find((item) => item.id === body.channelId) ?? beneficiary?.channels?.find((item) => item.isDefault) ?? beneficiary
    const kind = channel?.kind ?? channel?.method ?? beneficiary?.method
    if (kind !== 'crypto' && kind !== 'lightning' && (!toCountry || (beneficiary.country && beneficiary.country !== toCountry))) throw new AppError(400, 'Pays incompatible avec le bénéficiaire.')
    if (!SUPPORTED_SEND_CURRENCIES.includes(sendCurrency)) throw new AppError(400, `Devise non supportée par Bitnob : ${sendCurrency}`)
    const transfer = await paymentService.createTransfer({
      amount, toCountry: toCountry || beneficiary.country, sendCurrency, receiveCurrency: body.receiveCurrency, beneficiary: { ...beneficiary, country: toCountry || beneficiary.country }, channel,
      fromCountry: body.fromCountry, paymentReason: body.paymentReason ?? 'family_support',
      fundingMode: body.fundingMode === 'onchain' ? 'onchain' : 'offchain', chain: body.chain,
    })
    res.status(201).json(transfer)
  }))
  return router
}
