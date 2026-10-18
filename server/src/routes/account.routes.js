import { Router } from 'express'
import { AppError } from '../core/AppError.js'
import { asyncHandler } from '../middleware/asyncHandler.js'

/** Routes for Bitnob customers and NGN virtual accounts. */
export function createAccountRouter({ provider, repository }) {
  const router = Router()
  const requireLive = (_req, _res, next) => {
    if (!provider.isLive) return next(new AppError(503, 'Les comptes clients et comptes virtuels Bitnob nécessitent BITNOB_PAYMENTS_ENABLED=true.'))
    next()
  }

  router.get('/virtual-account-deposits', asyncHandler(async (_req, res) => res.json(repository.listVirtualAccountDeposits?.() ?? [])))
  router.use(requireLive)
  router.get('/customers', asyncHandler(async (req, res) => res.json(await provider.listCustomers(req.query))))
  router.post('/customers', asyncHandler(async (req, res) => {
    const customer = req.body ?? {}
    if (!customer.email || !customer.customer_type) throw new AppError(400, 'email et customer_type sont requis.')
    res.status(201).json(await provider.createCustomer(customer))
  }))

  router.get('/virtual-accounts/supported-currencies', asyncHandler(async (_req, res) => res.json(await provider.getSupportedVirtualAccountCurrencies())))
  router.get('/virtual-accounts', asyncHandler(async (req, res) => res.json(await provider.listVirtualAccounts(req.query))))
  router.post('/virtual-accounts', asyncHandler(async (req, res) => {
    const { reference, customer_id: customerId, currency = 'NGN', account_alias: alias } = req.body ?? {}
    if (!reference || !customerId) throw new AppError(400, 'reference et customer_id sont requis.')
    if (String(currency).toUpperCase() !== 'NGN') throw new AppError(400, 'Seule la devise NGN est disponible pour les comptes virtuels.')
    res.status(201).json(await provider.createVirtualAccount({ reference, customer_id: customerId, currency: 'NGN', ...(alias ? { account_alias: alias } : {}) }))
  }))
  router.get('/virtual-accounts/:id', asyncHandler(async (req, res) => res.json(await provider.getVirtualAccount(req.params.id))))
  router.get('/virtual-accounts/:id/transactions', asyncHandler(async (req, res) => res.json(await provider.getVirtualAccountTransactions(req.params.id, req.query))))
  router.patch('/virtual-accounts/:id/alias', asyncHandler(async (req, res) => {
    const alias = String(req.body?.account_alias ?? '').trim()
    if (!alias) throw new AppError(400, 'account_alias est requis.')
    res.json(await provider.updateVirtualAccountAlias(req.params.id, alias))
  }))
  router.post('/virtual-accounts/:id/simulate-deposit', asyncHandler(async (req, res) => res.status(201).json(await provider.simulateVirtualAccountDeposit(req.params.id))))

  return router
}
