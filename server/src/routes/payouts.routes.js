import { Router } from 'express'
import { AppError } from '../core/AppError.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { SUPPORTED_SEND_CURRENCIES } from '../config/paybridge.js'
import { createApiKeyMiddleware } from '../middleware/apiKey.js'

export function createPayoutsRouter({ provider, apiKey }) {
  const router = Router()
  const requireApiKey = createApiKeyMiddleware(apiKey)

  router.get('/', asyncHandler(async (req, res) => res.json(await provider.listPayouts(req.query))))
  router.post('/quotes', requireApiKey, asyncHandler(async (req, res) => {
    const body = req.body ?? {}
    const amount = Number(body.amount)
    const toCountry = String(body.toCountry ?? body.country ?? '').toUpperCase()
    const sendCurrency = String(body.sendCurrency ?? body.from_asset ?? '').toUpperCase()
    const receiveCurrency = String(body.receiveCurrency ?? body.to_currency ?? '').toUpperCase()
    if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, 'amount doit être supérieur à zéro.')
    if (!toCountry || !receiveCurrency) throw new AppError(400, 'country et to_currency sont requis.')
    if (!SUPPORTED_SEND_CURRENCIES.includes(sendCurrency)) throw new AppError(400, `from_asset non pris en charge : ${sendCurrency || 'absent'}`)
    if (body.source !== undefined && !['offchain', 'onchain'].includes(String(body.source).toLowerCase())) {
      throw new AppError(400, 'source doit être offchain ou onchain.')
    }
    res.status(201).json(await provider.createQuote({
      amount, toCountry, sendCurrency, receiveCurrency,
      reference: body.reference,
      paymentReason: body.payment_reason ?? body.paymentReason,
      fundingMode: String(body.source ?? 'offchain').toLowerCase(),
      chain: body.chain,
    }))
  }))

  router.post('/:quoteId/initialize', requireApiKey, asyncHandler(async (req, res) => {
    const body = req.body ?? {}
    if (!String(body.reference ?? '').trim()) throw new AppError(400, 'reference unique requise pour initialiser le payout.')
    if (!body.beneficiary || typeof body.beneficiary !== 'object') throw new AppError(400, 'beneficiary est requis.')
    const result = await provider.initializePayout(req.params.quoteId, {
      ...body,
      quote_id: req.params.quoteId,
    })
    res.json(result)
  }))

  router.post('/:quoteId/finalize', requireApiKey, asyncHandler(async (req, res) => {
    res.json(await provider.finalizePayout(req.params.quoteId))
  }))

  router.get('/reference/:reference', asyncHandler(async (req, res) => {
    res.json(await provider.getPayoutStatus(req.params.reference))
  }))
  router.get('/:id', asyncHandler(async (req, res) => res.json(await provider.getPayout(req.params.id))))

  return router
}
