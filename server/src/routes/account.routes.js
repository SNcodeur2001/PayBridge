import { Router } from 'express'
import { asyncHandler } from '../middleware/asyncHandler.js'

/** Routes for Bitnob customers and NGN virtual accounts. */
export function createAccountRouter({ provider }) {
  const router = Router()
  router.get('/virtual-account-deposits', asyncHandler(async (_req, res) => res.json(await provider.getVirtualAccountDeposits())))
  router.get('/customers', asyncHandler(async (req, res) => res.json(await provider.listCustomers(req.query))))
  router.post('/customers', asyncHandler(async (req, res) => {
    const customer = req.body ?? {}
    if (!customer.email || !customer.customer_type) throw new AppError(400, 'email et customer_type sont requis.')
    res.status(201).json(await provider.createCustomer(customer))
  }))

  router.get('/virtual-accounts/supported-currencies', asyncHandler(async (_req, res) => res.json(await provider.getSupportedVirtualAccountCurrencies())))
  router.get('/virtual-accounts', asyncHandler(async (req, res) => res.json(await provider.listVirtualAccounts(req.query))))
  router.post('/virtual-accounts', asyncHandler(async (req, res) => {
    const { reference, customer_id: customerId, currency, account_alias: alias } = req.body ?? {}
    if (!reference || !customerId || !currency) throw new AppError(400, 'reference, customer_id et currency sont requis.')
    const supported = await provider.getSupportedVirtualAccountCurrencies()
    if (!supported.currencies?.includes(String(currency).toUpperCase())) throw new AppError(400, `Devise non prise en charge par Bitnob : ${currency}`)
    res.status(201).json(await provider.createVirtualAccount({ reference, customer_id: customerId, currency: String(currency).toUpperCase(), ...(alias ? { account_alias: alias } : {}) }))
  }))
  router.get('/virtual-accounts/:id', asyncHandler(async (req, res) => res.json(await provider.getVirtualAccount(req.params.id))))
  router.get('/virtual-accounts/:id/transactions', asyncHandler(async (req, res) => res.json(await provider.getVirtualAccountTransactions(req.params.id, req.query))))
  router.patch('/virtual-accounts/:id/alias', asyncHandler(async (req, res) => {
    const alias = String(req.body?.account_alias ?? '').trim()
    if (!alias) throw new AppError(400, 'account_alias est requis.')
    res.json(await provider.updateVirtualAccountAlias(req.params.id, alias))
  }))
  return router
}
