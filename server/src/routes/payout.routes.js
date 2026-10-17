import { Router } from 'express'
import { AppError } from '../core/AppError.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { COUNTRIES, CURRENCIES } from '../config/paybridge.js'
import { createApiKeyMiddleware } from '../middleware/apiKey.js'

export function createPayoutRouter({ repository, paymentService, apiKey }) {
  const router = Router()
  router.post('/', createApiKeyMiddleware(apiKey), asyncHandler(async (req, res) => {
    const body = req.body ?? {}
    const amount = Number(body.amount)
    const toCountry = String(body.toCountry ?? '').toUpperCase()
    const sendCurrency = String(body.sendCurrency ?? 'USD').toUpperCase()
    const beneficiary = body.beneficiary
    if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, 'montant invalide.')
    if (!Object.hasOwn(COUNTRIES, toCountry)) throw new AppError(400, `Pays non supporté : ${toCountry}`)
    if (!Object.hasOwn(CURRENCIES, sendCurrency)) throw new AppError(400, `Devise non supportée : ${sendCurrency}`)
    if (!beneficiary?.name || !beneficiary?.account) throw new AppError(400, 'beneficiary.name et beneficiary.account sont requis.')
    const result = await paymentService.createExternalPayout({ amount, toCountry, sendCurrency, beneficiary, paymentReason: body.paymentReason ?? 'business_payment' })
    res.status(201).json(result)
  }))
  return router
}
