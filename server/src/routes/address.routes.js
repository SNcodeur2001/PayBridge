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
    const requested = String(req.query.chain ?? req.query.asset ?? req.query.currency ?? '').trim()
    const addresses = await provider.getDepositAddresses()
    const chains = [...new Set(addresses.map((item) => item.chain))]
    if (!requested) return res.json({ addresses, chains, source: provider.mode })
    const aliases = { BTC: 'bitcoin', BITCOIN: 'bitcoin', ETH: 'ethereum', ETHEREUM: 'ethereum', MATIC: 'polygon', POLYGON: 'polygon', AVAX: 'avalanche', AVALANCHE: 'avalanche' }
    const chain = aliases[requested.toUpperCase()] ?? requested.toLowerCase()
    const match = addresses.find((item) => item.chain === chain)
      ?? addresses.find((item) => String(item.label ?? '').toUpperCase().includes(requested.toUpperCase()))
    if (!match) throw new AppError(404, `Aucune adresse de dépôt pour « ${requested} ». Réseaux disponibles : ${chains.join(', ') || 'aucun'}.`)
    res.json({ ...match, addresses, chains, source: provider.mode })
  }))
  return router
}
