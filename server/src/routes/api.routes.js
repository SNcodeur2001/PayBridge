import { Router } from 'express'
import crypto from 'node:crypto'
import { COUNTRIES } from '../config/paybridge.js'
import { paymentProvider } from '../providers/payment.provider.js'
import { repository } from '../repositories/memory.repository.js'

const router = Router()
const digits = (value = '') => String(value).replace(/\D/g, '')
const httpError = (status, message) => Object.assign(new Error(message), { status })
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

router.get('/health', asyncRoute(async (_req, res) => res.json(await paymentProvider.getHealth())))
router.get('/wallet', asyncRoute(async (_req, res) => res.json(await paymentProvider.getWallet())))
router.get('/rates', asyncRoute(async (_req, res) => res.json(await paymentProvider.getRates())))
router.get('/banks/:country', asyncRoute(async (req, res) => res.json(await paymentProvider.getBanks(req.params.country.toUpperCase()))))

router.get('/account-lookup', asyncRoute(async (req, res) => {
  const { country, accountNumber, bankCode, method } = req.query
  if (!country || !accountNumber || !bankCode) throw httpError(400, 'Paramètres manquants (country, accountNumber, bankCode).')
  if (digits(accountNumber).length < 6) throw httpError(400, 'Numéro de compte invalide.')
  res.json(await paymentProvider.lookupAccount({ country: String(country).toUpperCase(), accountNumber, bankCode, method }))
}))

router.post('/quotes', asyncRoute(async (req, res) => {
  const { amount: input, toCountry: country, sendCurrency = 'USD' } = req.body ?? {}
  const amount = Number(input)
  const toCountry = String(country ?? '').toUpperCase()
  const currency = String(sendCurrency).toUpperCase()
  if (!Number.isFinite(amount) || amount <= 0) throw httpError(400, 'Montant invalide.')
  if (!COUNTRIES[toCountry]) throw httpError(400, `Pays non supporté : ${toCountry}`)
  if (!['USD', 'EUR', 'XOF', 'XAF', 'NGN', 'GHS', 'KES', 'ZAR'].includes(currency)) throw httpError(400, `Devise non supportée : ${currency}`)
  res.json(await paymentProvider.createQuote({ amount, toCountry, sendCurrency: currency }))
}))

router.get('/transfers', (_req, res) => res.json(repository.listTransfers()))
router.get('/transfers/:id', (req, res) => {
  const transfer = repository.getTransfer(req.params.id)
  if (!transfer) throw httpError(404, 'Transfert introuvable.')
  res.json(transfer)
})

router.post('/transfers', asyncRoute(async (req, res) => {
  const body = req.body ?? {}
  const amount = Number(body.amount)
  const toCountry = String(body.toCountry ?? '').toUpperCase()
  const sendCurrency = String(body.sendCurrency ?? 'USD').toUpperCase()
  const beneficiary = repository.getBeneficiary(body.beneficiaryId)
  if (!Number.isFinite(amount) || amount <= 0) throw httpError(400, 'Montant invalide.')
  if (!['USD', 'EUR', 'XOF', 'XAF', 'NGN', 'GHS', 'KES', 'ZAR'].includes(sendCurrency)) throw httpError(400, `Devise non supportée : ${sendCurrency}`)
  if (!beneficiary) throw httpError(400, 'Bénéficiaire inconnu.')
  if (!COUNTRIES[toCountry] || toCountry !== beneficiary.country) throw httpError(400, 'Pays incompatible avec le bénéficiaire.')

  const quote = await paymentProvider.createQuote({ amount, toCountry, sendCurrency })
  const reference = `PB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  const transfer = repository.createTransfer({
    id: reference, reference, createdAt: new Date().toISOString(), pendingAt: new Date().toISOString(),
    beneficiaryId: beneficiary.id, beneficiaryName: beneficiary.name,
    fromCountry: body.fromCountry ?? 'SN', toCountry,
    sendCurrency,
    amount: quote.amount, fee: quote.fee, rate: quote.rate,
    receiveCurrency: COUNTRIES[toCountry].currency, received: quote.received,
    method: beneficiary.method, provider: beneficiary.provider,
    paymentReason: body.paymentReason ?? 'family_support', status: 'pending', demo: true,
  })
  await paymentProvider.submitTransfer(transfer, (id, status, extra) => repository.updateTransferStatus(id, status, extra))
  res.status(201).json(transfer)
}))

router.get('/beneficiaries', (_req, res) => res.json(repository.listBeneficiaries()))
router.post('/beneficiaries', (req, res) => {
  const body = req.body ?? {}
  if (!body.name || String(body.name).trim().length < 3) throw httpError(400, 'Nom complet requis.')
  if (digits(body.account).length < 6) throw httpError(400, 'Numéro de compte invalide.')
  const country = String(body.country ?? '').toUpperCase()
  if (!COUNTRIES[country]) throw httpError(400, `Pays non supporté : ${country}`)
  const beneficiary = repository.addBeneficiary({ ...body, id: `b-${crypto.randomUUID()}`, name: String(body.name).trim(), country })
  res.status(201).json(beneficiary)
})

router.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.flushHeaders?.()
  res.write('retry: 3000\n\n')
  const unsubscribe = repository.subscribe((event) => res.write(`data: ${JSON.stringify(event.data)}\n\n`))
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 20_000)
  req.on('close', () => { unsubscribe(); clearInterval(heartbeat) })
})

router.post('/webhooks/bitnob', (_req, res) => res.status(503).json({ message: 'Webhook Bitnob indisponible en mode simulation.' }))

export default router
