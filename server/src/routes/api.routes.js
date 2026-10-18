import { Router } from 'express'
import { createCatalogRouter } from './catalog.routes.js'
import { createTransferRouter } from './transfer.routes.js'
import { createBeneficiaryRouter } from './beneficiary.routes.js'
import { createLightningRouter } from './lightning.routes.js'
import { createAddressRouter } from './address.routes.js'
import { createPayoutRouter } from './payout.routes.js'
import { createEventRouter } from './event.routes.js'
import { createBitnobRouter } from './bitnob.routes.js'
import { createAccountRouter } from './account.routes.js'
import { createWithdrawalRouter } from './withdrawal.routes.js'
import { createPayoutsRouter } from './payouts.routes.js'

export function createApiRouter(dependencies) {
  const router = Router()
  router.use(createAccountRouter(dependencies))
  router.use(createBitnobRouter(dependencies))
  router.use(createCatalogRouter(dependencies))
  router.use('/transfers', createTransferRouter(dependencies))
  router.use('/beneficiaries', createBeneficiaryRouter(dependencies))
  router.use('/lightning', createLightningRouter(dependencies))
  router.use('/addresses', createAddressRouter(dependencies))
  router.use('/payout', createPayoutRouter(dependencies))
  router.use('/payouts', createPayoutsRouter(dependencies))
  router.use('/withdrawals', createWithdrawalRouter(dependencies))
  router.use('/events', createEventRouter(dependencies))
  return router
}
