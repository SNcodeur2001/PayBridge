import { Router } from 'express'
import crypto from 'node:crypto'
import { AppError } from '../core/AppError.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { COUNTRIES } from '../config/paybridge.js'
import { digitsOnly } from '../core/utils.js'

export function createBeneficiaryRouter({ repository }) {
  const router = Router()
  router.get('/', (_req, res) => res.json(repository.listBeneficiaries()))

  router.post('/', (req, res) => {
    const body = req.body ?? {}
    const name = String(body.name ?? '').trim()
    const country = String(body.country ?? '').toUpperCase()
    if (name.length < 3) throw new AppError(400, 'Nom complet requis.')
    if (digitsOnly(body.account).length < 6) throw new AppError(400, 'Numéro de compte invalide.')
    if (!Object.hasOwn(COUNTRIES, country)) throw new AppError(400, `Pays non supporté : ${country}`)
    res.status(201).json(repository.addBeneficiary({ ...body, id: `b-${crypto.randomUUID()}`, name, country }))
  })

  router.put('/:id', (req, res) => {
    const existing = repository.getBeneficiary(req.params.id)
    if (!existing) throw new AppError(404, 'Bénéficiaire introuvable.')
    const changes = { ...req.body }
    if (changes.name !== undefined && String(changes.name).trim().length < 3) throw new AppError(400, 'Nom complet requis.')
    if (changes.account !== undefined && digitsOnly(changes.account).length < 6) throw new AppError(400, 'Numéro de compte invalide.')
    if (changes.country !== undefined) {
      changes.country = String(changes.country).toUpperCase()
      if (!Object.hasOwn(COUNTRIES, changes.country)) throw new AppError(400, `Pays non supporté : ${changes.country}`)
    }
    if (changes.name !== undefined) changes.name = String(changes.name).trim()
    res.json(repository.updateBeneficiary(req.params.id, changes))
  })
  return router
}
