import crypto from 'node:crypto'

export const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
export const digitsOnly = (value = '') => String(value).replace(/\D/g, '')
export const roundMoney = (value) => Math.round(value * 100) / 100
export const createReference = (prefix = 'PB') => `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
export const nowIso = () => new Date().toISOString()

export function publicCallbackUrl(path, settings) {
  const origin = settings.publicBaseUrl || `http://localhost:${settings.port}`
  return `${origin.replace(/\/$/, '')}${path}`
}
