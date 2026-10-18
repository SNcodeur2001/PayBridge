import { Router } from 'express'
import { AppError } from '../core/AppError.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { CURRENCIES, COUNTRIES } from '../config/paybridge.js'

export function createCatalogRouter({ provider, paymentService }) {
  const router = Router()
  router.get('/health', asyncHandler(async (_req, res) => res.json(await provider.getHealth())))
  router.get('/wallet', asyncHandler(async (_req, res) => res.json(await provider.getWallet())))
  router.get('/rates', asyncHandler(async (_req, res) => res.json(await provider.getRates())))
  router.get('/deposits', asyncHandler(async (_req, res) => {
    const deposits = provider.isLive ? await provider.getDeposits() : []
    const virtualDeposits = repository.listVirtualAccountDeposits?.() ?? []
    res.json([...deposits, ...virtualDeposits.map((deposit) => ({
      id: String(deposit.eventId ?? `${deposit.virtualAccountId}-${deposit.receivedAt}`),
      reference: deposit.reference ?? deposit.providerTransactionId ?? null,
      direction: 'in', amount: Number(deposit.amount) / 100,
      currency: String(deposit.currency ?? '').toUpperCase(), status: 'completed',
      type: 'VIRTUAL_ACCOUNT_DEPOSIT', account: deposit.virtualAccountId,
      source: 'virtual-account', createdAt: deposit.receivedAt ?? null,
    }))].sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0)))
  }))
  router.get('/banks/:country', asyncHandler(async (req, res) => res.json(await provider.getBanks(req.params.country.toUpperCase()))))

  router.get('/account-lookup', asyncHandler(async (req, res) => {
    const { country, accountNumber, bankCode, method } = req.query
    if (!country || !accountNumber || !bankCode) throw new AppError(400, 'Paramètres manquants (country, accountNumber, bankCode).')
    if (String(accountNumber).replace(/\D/g, '').length < 6) throw new AppError(400, 'Numéro de compte invalide.')
    res.json(await provider.lookupAccount({ country: String(country).toUpperCase(), accountNumber, bankCode, method }))
  }))

  router.post('/quotes', asyncHandler(async (req, res) => {
    const amount = Number(req.body?.amount)
    const toCountry = String(req.body?.toCountry ?? '').toUpperCase()
    const sendCurrency = String(req.body?.sendCurrency ?? 'USD').toUpperCase()
    if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, 'montant invalide.')
    if (!Object.hasOwn(COUNTRIES, toCountry)) throw new AppError(400, `Pays non supporté : ${toCountry}`)
    if (!Object.hasOwn(CURRENCIES, sendCurrency)) throw new AppError(400, `Devise non supportée : ${sendCurrency}`)
    res.json(await paymentService.createQuote({ amount, toCountry, sendCurrency, fundingMode: req.body?.fundingMode === 'onchain' ? 'onchain' : 'offchain' }))
  }))
  return router
}
