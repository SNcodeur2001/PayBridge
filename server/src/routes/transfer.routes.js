import { Router } from 'express'
import { AppError } from '../core/AppError.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { COUNTRIES, CURRENCIES } from '../config/paybridge.js'

export function createTransferRouter({ repository, paymentService }) {
  const router = Router()
  router.get('/', (_req, res) => res.json(repository.listTransfers()))
  router.get('/:id', (req, res) => {
    const transfer = repository.getTransfer(req.params.id)
    if (!transfer) throw new AppError(404, 'Transfert introuvable.')
    res.json(transfer)
  })
  router.post('/', asyncHandler(async (req, res) => {
    const body = req.body ?? {}
    const amount = Number(body.amount)
    const toCountry = String(body.toCountry ?? '').toUpperCase()
    const sendCurrency = String(body.sendCurrency ?? 'USD').toUpperCase()
    const beneficiary = repository.getBeneficiary(body.beneficiaryId)
    if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, 'montant invalide.')
    if (!beneficiary) throw new AppError(400, 'Bénéficiaire inconnu.')
    if (!Object.hasOwn(COUNTRIES, toCountry) || beneficiary.country !== toCountry) throw new AppError(400, 'Pays incompatible avec le bénéficiaire.')
    if (!Object.hasOwn(CURRENCIES, sendCurrency)) throw new AppError(400, `Devise non supportée : ${sendCurrency}`)
    const transfer = await paymentService.createTransfer({
      amount, toCountry, sendCurrency, beneficiary,
      fromCountry: body.fromCountry ?? 'SN', paymentReason: body.paymentReason ?? 'family_support',
    })
    res.status(201).json(transfer)
  }))
  return router
}
