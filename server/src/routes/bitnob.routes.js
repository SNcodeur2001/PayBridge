import { Router } from 'express'
import { asyncHandler } from '../middleware/asyncHandler.js'

export function createBitnobRouter({ bitnobConnectionService }) {
  const router = Router()
  router.get('/whoami', asyncHandler(async (_req, res) => {
    res.json(await bitnobConnectionService.whoami())
  }))
  return router
}
