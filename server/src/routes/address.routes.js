import { Router } from 'express'
import { AppError } from '../core/AppError.js'
import { asyncHandler } from '../middleware/asyncHandler.js'

export function createAddressRouter({ provider }) {
  const router = Router()
  router.post('/validate', asyncHandler(async (req, res) => {
    const { address, chain = 'BTC' } = req.body ?? {}
    if (!address) throw new AppError(400, 'Adresse manquante.')
    res.json(await provider.validateAddress({ address: String(address), chain: String(chain).toUpperCase() }))
  }))
  router.get('/deposit', asyncHandler(async (req, res) => {
    const chain = String(req.query.chain ?? 'BTC').toUpperCase()
    const result = await provider.getDepositAddress(chain)
    if (!result.address) throw new AppError(502, 'Adresse de dépôt indisponible.')
    res.json(result)
  }))
  return router
}
