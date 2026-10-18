import { Router } from 'express'
import { AppError } from '../core/AppError.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { digitsOnly } from '../core/utils.js'

export function createBeneficiaryRouter({ provider }) {
  const router = Router()
  router.get('/', asyncHandler(async (_req, res) => {
    res.json(await provider.listBeneficiaries())
  }))

  router.post('/', asyncHandler(async (req, res) => {
    const body = req.body ?? {}
    const name = String(body.name ?? '').trim()
    const country = String(body.country ?? '').toUpperCase()
    if (name.length < 3) throw new AppError(400, 'Nom complet requis.')
    const isCrypto = body.method === 'crypto'
    if (isCrypto ? String(body.account ?? body.walletAddress ?? '').trim().length < 12 : digitsOnly(body.account).length < 6) throw new AppError(400, isCrypto ? 'Adresse crypto invalide.' : 'Numéro de compte invalide.')
    if (isCrypto && (!body.asset || !body.chain)) throw new AppError(400, 'asset et chain sont requis pour un bénéficiaire crypto.')
    if (!country) throw new AppError(400, 'Pays requis.')
    const beneficiary = await provider.createBeneficiary({ ...body, name, country })
    res.status(201).json(beneficiary)
  }))

  router.put('/:id', asyncHandler(async (req, res) => {
    const existing = await provider.getBeneficiary(req.params.id)
    const changes = { ...req.body }
    if (changes.name !== undefined && String(changes.name).trim().length < 3) throw new AppError(400, 'Nom complet requis.')
    const cryptoBeneficiary = existing.method === 'crypto' || changes.method === 'crypto'
    if (changes.account !== undefined && (cryptoBeneficiary ? String(changes.account).trim().length < 12 : digitsOnly(changes.account).length < 6)) throw new AppError(400, cryptoBeneficiary ? 'Adresse crypto invalide.' : 'Numéro de compte invalide.')
    if (changes.country !== undefined) {
      changes.country = String(changes.country).toUpperCase()
      if (!changes.country) throw new AppError(400, 'Pays requis.')
    }
    if (changes.name !== undefined) changes.name = String(changes.name).trim()
    const beneficiary = await provider.updateBeneficiary(req.params.id, changes, existing)
    res.json(beneficiary)
  }))
  return router
}
