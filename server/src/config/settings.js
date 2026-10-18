import { readFileSync } from 'node:fs'

// Minimal .env reader: shell variables win; server/.env wins over the repo-root fallback.
for (const envUrl of [new URL('../../.env', import.meta.url), new URL('../../../.env', import.meta.url)]) {
  try {
    const content = readFileSync(envUrl, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!match || match[1] in process.env) continue
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  } catch { /* each .env file is optional */ }
}

const csv = (value) => String(value ?? '*').split(',').map((item) => item.trim()).filter(Boolean)

export const settings = Object.freeze({
  port: Number(process.env.PORT ?? 4000),
  bitnob: Object.freeze({
    clientId: process.env.BITNOB_CLIENT_ID ?? '',
    clientSecret: process.env.BITNOB_CLIENT_SECRET ?? '',
    baseUrl: process.env.BITNOB_BASE_URL ?? 'https://api.bitnob.com',
    webhookSecret: process.env.BITNOB_WEBHOOK_SECRET ?? '',
  }),
  bitnobPaymentsEnabled: process.env.BITNOB_PAYMENTS_ENABLED === 'true',
  apiKey: process.env.API_KEY ?? '',
  allowedOrigins: csv(process.env.ALLOWED_ORIGINS),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? '',
  payoutSenderName: process.env.PAYOUT_SENDER_NAME ?? 'PayBridge Africa',
})

export const hasBitnobCredentials = (config = settings) => Boolean(config.bitnob?.clientId && config.bitnob?.clientSecret)
