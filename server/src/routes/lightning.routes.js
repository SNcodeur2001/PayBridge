import { Router } from 'express'
import { AppError } from '../core/AppError.js'
import { asyncHandler } from '../middleware/asyncHandler.js'

export function createLightningRouter({ provider }) {
  const router = Router()
  router.post('/decode', asyncHandler(async (req, res) => {
    const request = req.body?.request
    if (!request) throw new AppError(400, 'paymentRequest manquant.')
    res.json(await provider.decodeLightningInvoice(String(request)))
  }))
  router.post('/invoices', asyncHandler(async (req, res) => {
    const amountUsd = Number(req.body?.amountUsd)
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new AppError(400, 'amountUsd doit être supérieur à zéro.')
    if (!req.body?.description) throw new AppError(400, 'description est requis pour créer une facture Lightning.')
    res.status(201).json(await provider.createLightningInvoice({ amountUsd, description: req.body?.description }))
  }))
  router.post('/pay', asyncHandler(async (req, res) => {
    const paymentRequest = req.body?.paymentRequest
    if (!paymentRequest) throw new AppError(400, 'paymentRequest manquant.')
    res.json(await provider.payLightningInvoice(String(paymentRequest)))
  }))
  return router
}
