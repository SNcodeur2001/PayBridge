import crypto from 'node:crypto'
import { CURRENCIES, SIMULATED_ADDRESSES, SIMULATED_BALANCE, SIMULATED_BANKS, SIMULATED_WALLETS } from '../config/paybridge.js'
import { digitsOnly, roundMoney, sleep } from '../core/utils.js'

const HOLDER_NAMES = ['Fatou Sow', 'Kofi Boateng', 'Chinedu Okafor', 'Mariama Camara', 'Amina Kimani', 'Emmanuel Ekané', 'Lerato Dlamini']

/** Local fake provider. Its responses mirror the Bitnob provider contract. */
export class SimulatedPaymentProvider {
  constructor() { this.mode = 'simulation'; this.isLive = false }

  async getHealth() { return { ok: true, mode: this.mode, time: new Date().toISOString() } }
  async getWallet() { await sleep(100); return { balance: SIMULATED_BALANCE.balanceUsd, currency: SIMULATED_BALANCE.currency, wallets: structuredClone(SIMULATED_WALLETS) } }
  async getRates() { return { updatedAt: new Date().toISOString(), source: this.mode, rates: { ...CURRENCIES, USD: 1 } } }
  async getBanks(country) { return { banks: SIMULATED_BANKS[country] ?? [] } }

  async lookupAccount({ country, accountNumber, bankCode }) {
    await sleep(200)
    const sum = digitsOnly(accountNumber).split('').reduce((total, digit) => total + Number(digit), 0)
    return { accountName: HOLDER_NAMES[sum % HOLDER_NAMES.length].toUpperCase(), accountNumber, bankCode, bankName: 'Banque (démo)', country, isVerified: true }
  }

  async createQuote({ amount, sendCurrency = 'USD', toCountry, receiveCurrency }) {
    await sleep(150)
    const targetCurrency = receiveCurrency ?? toCountry
    const target = CURRENCIES[targetCurrency]
    const base = CURRENCIES[sendCurrency]
    const rate = target / base
    const fee = amount * 0.009 + 0.5 / base
    const net = Math.max(amount - fee, 0)
    return { amount, fee: roundMoney(fee), rate, net: roundMoney(net), received: roundMoney(net * rate), total: amount, expiresAt: new Date(Date.now() + 60_000).toISOString(), quoteId: `sim-${crypto.randomUUID()}` }
  }

  async submitPayout(transfer, _quote, beneficiary, repository) {
    setTimeout(() => repository.updateTransferStatus(transfer.id, 'processing'), 2000)
    setTimeout(() => {
      const ok = !String(transfer.amount).endsWith('.13')
      repository.updateTransferStatus(transfer.id, ok ? 'completed' : 'failed', ok ? {} : { failureReason: 'Refus simulé du fournisseur de paiement.' })
    }, 5500)
  }

  async getPayoutStatus() { return { status: 'PENDING' } }

  async decodeLightningInvoice(request) {
    await sleep(250)
    const hash = this.#hash(request)
    const amountSat = 12_000 + (hash % 60) * 1_500
    return { paymentHash: String(hash).padStart(64, '0'), amountSat, description: 'Facture PayBridge (simulation)', expiresAt: new Date(Date.now() + 3_600_000).toISOString(), isExpired: false }
  }

  async createLightningInvoice({ amountUsd, description }) {
    await sleep(300)
    const amountSat = Math.max(1, Math.round((Number(amountUsd) || 0) * CURRENCIES.SATS))
    const stamp = Date.now().toString(36)
    return { id: `ln-${stamp}`, paymentRequest: `lnbc${amountSat}n1p95dqgypp58s3rj2u42yxu9mnxm6k6t3z4fa89uhmqcqzpgn2qpaybridge${stamp}`, amountSat, description: description ?? 'PayBridge', expiresAt: new Date(Date.now() + 3_600_000).toISOString(), status: 'pending' }
  }

  async payLightningInvoice(paymentRequest) {
    await sleep(800)
    const amountSat = 12_000 + (this.#hash(paymentRequest) % 60) * 1_500
    const reference = `PB-LN-${Date.now().toString(36).toUpperCase()}`
    return { id: reference, reference, status: 'completed', amountSat, feeSat: Math.round(amountSat * 0.001) }
  }

  async validateAddress({ address, chain }) {
    await sleep(150)
    const valid = /^(1|3|bc1)[a-zA-Z0-9]{25,62}$/.test(address) || /^0x[a-fA-F0-9]{40}$/.test(address) || /^T[a-zA-Z0-9]{33}$/.test(address)
    return { address, chain, valid, source: this.mode }
  }

  async getDepositAddress(chain) {
    await sleep(150)
    return { address: SIMULATED_ADDRESSES[chain] ?? SIMULATED_ADDRESSES.BTC, chain, source: this.mode }
  }

  #hash(value) {
    let hash = 0
    for (const character of String(value)) hash = (hash * 31 + character.charCodeAt(0)) % 9973
    return hash
  }
}
