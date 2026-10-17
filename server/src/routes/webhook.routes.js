import { Router } from 'express'
import express from 'express'

export function createWebhookRouter({ webhookService }) {
  const router = Router()
  router.post('/bitnob', express.raw({ type: '*/*', limit: '256kb' }), (req, res, next) => {
    try { res.status(202).json(webhookService.handle(req.body, req.get('x-bitnob-signature'))) }
    catch (error) { next(error) }
  })
  return router
}
