import { Router } from 'express'
import { AppError } from '../core/AppError.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { SUPPORTED_SEND_CURRENCIES } from '../config/paybridge.js'
import { createApiKeyMiddleware } from '../middleware/apiKey.js'

export function createPayoutRouter({ paymentService, apiKey }) {
  const router = Router()
  router.post('/', createApiKeyMiddleware(apiKey), asyncHandler(async (req, res) => {
    const body = req.body ?? {}
    const amount = Number(body.amount)
    const toCountry = String(body.toCountry ?? '').toUpperCase()
    const sendCurrency = String(body.sendCurrency ?? 'USD').toUpperCase()
    const beneficiary = body.beneficiary
    if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, 'montant invalide.')
    if (!SUPPORTED_SEND_CURRENCIES.includes(sendCurrency)) throw new AppError(400, `Devise non supportée par Bitnob : ${sendCurrency}`)
    if (!beneficiary?.name || !beneficiary?.account) throw new AppError(400, 'beneficiary.name et beneficiary.account sont requis.')
    const result = await paymentService.createExternalPayout({ amount, toCountry, sendCurrency, receiveCurrency: body.receiveCurrency, chain: body.chain, fromCountry: body.fromCountry, beneficiary, paymentReason: body.paymentReason ?? 'business_payment' })
    res.status(201).json(result)
  }))
  return router
}
