import { Router } from 'express'
import { AppError } from '../core/AppError.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { createApiKeyMiddleware } from '../middleware/apiKey.js'

const SUPPORTED_ASSETS = new Set(['BTC', 'USDC', 'USDT'])

export function createWithdrawalRouter({ provider, apiKey }) {
  const router = Router()

  router.post('/', createApiKeyMiddleware(apiKey), asyncHandler(async (req, res) => {
    const body = req.body ?? {}
    const address = String(body.to_address ?? body.address ?? '').trim()
    const currency = String(body.currency ?? '').toUpperCase()
    const chain = String(body.chain ?? '').trim()
    const amount = String(body.amount ?? '')
    const reference = String(body.reference ?? '').trim()

    if (!address || !chain || !reference) throw new AppError(400, 'to_address, chain et reference sont requis.')
    if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) throw new AppError(400, 'amount doit être un entier positif en unités minimales.')
    if (!SUPPORTED_ASSETS.has(currency)) throw new AppError(400, `currency non pris en charge : ${currency || 'absente'}`)

    const result = await provider.createCryptoWithdrawal({
      address, amount, currency, chain, reference,
      description: body.description,
      memo: body.memo,
    })
    res.status(201).json({ ...result, reference: result?.reference ?? reference, bitnob: result })
  }))

  return router
}
