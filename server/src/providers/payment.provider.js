import crypto from 'node:crypto'
import { COUNTRIES, RATES_USD, SIMULATED_BALANCE, SIMULATED_BANKS } from '../config/paybridge.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const round = (value) => Math.round(value * 100) / 100
const digits = (value = '') => String(value).replace(/\D/g, '')
const holderNames = ['Fatou Sow', 'Kofi Boateng', 'Chinedu Okafor', 'Mariama Camara', 'Amina Kimani', 'Emmanuel Ekané', 'Lerato Dlamini']

/** Contrat fournisseur de paiement. Bitnob pourra remplacer ce provider sans changer les routes. */
export function createPaymentProvider() {
  return {
    name: 'simulation',
    async getHealth() { return { ok: true, mode: 'simulation', time: new Date().toISOString() } },
    async getWallet() { await sleep(100); return SIMULATED_BALANCE },
    async getRates() { return { updatedAt: new Date().toISOString(), source: 'simulation', rates: { ...RATES_USD } } },
    async getBanks(country) { return { banks: SIMULATED_BANKS[country] ?? [] } },
    async lookupAccount({ country, accountNumber, bankCode }) {
      await sleep(200)
      const sum = digits(accountNumber).split('').reduce((total, digit) => total + Number(digit), 0)
      return { accountName: holderNames[sum % holderNames.length].toUpperCase(), accountNumber, bankCode, bankName: 'Banque (démo)', country, isVerified: true }
    },
    async createQuote({ amount, sendCurrency = 'USD', toCountry }) {
      await sleep(100)
      const receiveCurrency = COUNTRIES[toCountry].currency
      const rate = RATES_USD[receiveCurrency] / RATES_USD[sendCurrency]
      const fee = amount * 0.009 + 0.5 / RATES_USD[sendCurrency]
      return { amount, fee: round(fee), rate, received: round(Math.max(amount - fee, 0) * rate), expiresAt: new Date(Date.now() + 60_000).toISOString(), quoteId: `sim-${crypto.randomUUID()}` }
    },
    async submitTransfer(transfer, onStatus) {
      // Transitions prévisibles pour une démo locale. Aucun paiement réel n'est envoyé.
      setTimeout(() => onStatus(transfer.id, 'processing'), 2000)
      setTimeout(() => {
        const success = !String(transfer.amount).endsWith('.13')
        onStatus(transfer.id, success ? 'completed' : 'failed', success ? {} : { failureReason: 'Refus simulé du fournisseur de paiement.' })
      }, 5000)
      return { accepted: true, providerReference: transfer.reference }
    },
  }
}

export const paymentProvider = createPaymentProvider()
