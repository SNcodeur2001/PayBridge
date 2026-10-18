import { Router } from 'express'
import { AppError } from '../core/AppError.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { SUPPORTED_SEND_CURRENCIES } from '../config/paybridge.js'

export function createCatalogRouter({ provider, paymentService }) {
  const router = Router()
  router.get('/health', asyncHandler(async (_req, res) => res.json(await provider.getHealth())))
  router.get('/balances', asyncHandler(async (_req, res) => res.json(await provider.getWallet())))
  router.get('/rates', asyncHandler(async (_req, res) => res.json(await provider.getRates())))
  router.get('/transactions', asyncHandler(async (req, res) => res.json(await provider.getTransactions(req.query))))
  router.get('/payouts/supported-countries', asyncHandler(async (_req, res) => res.json(await provider.getSupportedPayoutCountries())))
  router.get('/payouts/supported-countries/:country', asyncHandler(async (req, res) => res.json(await provider.getPayoutCountryDetails(req.params.country.toUpperCase()))))

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
    if (!SUPPORTED_SEND_CURRENCIES.includes(sendCurrency)) throw new AppError(400, `Devise non supportée par Bitnob : ${sendCurrency}`)
    res.json(await paymentService.createQuote({ amount, toCountry, sendCurrency, receiveCurrency: req.body?.receiveCurrency, chain: req.body?.chain, fundingMode: req.body?.fundingMode === 'onchain' ? 'onchain' : 'offchain' }))
  }))
  return router
}
