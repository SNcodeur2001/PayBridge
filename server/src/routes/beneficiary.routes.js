import { Router } from 'express'
import crypto from 'node:crypto'
import { AppError } from '../core/AppError.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { COUNTRIES } from '../config/paybridge.js'
import { digitsOnly } from '../core/utils.js'

export function createBeneficiaryRouter({ repository, provider }) {
  const router = Router()
  router.get('/', asyncHandler(async (_req, res) => {
    if (!provider.isLive) return res.json(repository.listBeneficiaries())
    const beneficiaries = await provider.listBeneficiaries()
    repository.replaceBeneficiaries(beneficiaries)
    res.json(beneficiaries)
  }))

  router.post('/', asyncHandler(async (req, res) => {
    const body = req.body ?? {}
    const name = String(body.name ?? '').trim()
    const country = String(body.country ?? '').toUpperCase()
    if (name.length < 3) throw new AppError(400, 'Nom complet requis.')
    if (digitsOnly(body.account).length < 6) throw new AppError(400, 'Numéro de compte invalide.')
    if (!Object.hasOwn(COUNTRIES, country)) throw new AppError(400, `Pays non supporté : ${country}`)
    const beneficiary = provider.isLive
      ? await provider.createBeneficiary({ ...body, name, country })
      : repository.addBeneficiary({ ...body, id: `b-${crypto.randomUUID()}`, name, country })
    if (provider.isLive) repository.upsertBeneficiary(beneficiary)
    res.status(201).json(beneficiary)
  }))

  router.put('/:id', asyncHandler(async (req, res) => {
    const existing = provider.isLive
      ? await provider.getBeneficiary(req.params.id)
      : repository.getBeneficiary(req.params.id)
    if (!existing) throw new AppError(404, 'Bénéficiaire introuvable.')
    const changes = { ...req.body }
    if (changes.name !== undefined && String(changes.name).trim().length < 3) throw new AppError(400, 'Nom complet requis.')
    if (changes.account !== undefined && digitsOnly(changes.account).length < 6) throw new AppError(400, 'Numéro de compte invalide.')
    if (changes.country !== undefined) {
      changes.country = String(changes.country).toUpperCase()
      if (!Object.hasOwn(COUNTRIES, changes.country)) throw new AppError(400, `Pays non supporté : ${changes.country}`)
    }
    if (changes.name !== undefined) changes.name = String(changes.name).trim()
    const beneficiary = provider.isLive
      ? await provider.updateBeneficiary(req.params.id, changes, existing)
      : repository.updateBeneficiary(req.params.id, changes)
    if (provider.isLive) repository.upsertBeneficiary(beneficiary)
    res.json(beneficiary)
  }))
  return router
}
