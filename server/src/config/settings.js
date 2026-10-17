import { readFileSync } from 'node:fs'

// Minimal .env reader: no dependency and never overrides variables provided by the shell.
try {
  const content = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!match || match[1] in process.env) continue
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
} catch { /* .env is optional */ }

const csv = (value) => String(value ?? '*').split(',').map((item) => item.trim()).filter(Boolean)

export const settings = Object.freeze({
  port: Number(process.env.PORT ?? 4000),
  bitnob: Object.freeze({
    clientId: process.env.BITNOB_CLIENT_ID ?? '',
    clientSecret: process.env.BITNOB_CLIENT_SECRET ?? '',
    baseUrl: process.env.BITNOB_BASE_URL ?? 'https://api.bitnob.com',
    webhookSecret: process.env.BITNOB_WEBHOOK_SECRET ?? '',
  }),
  apiKey: process.env.API_KEY ?? '',
  allowedOrigins: csv(process.env.ALLOWED_ORIGINS),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? '',
})

export const isBitnobConfigured = Boolean(settings.bitnob.clientId && settings.bitnob.clientSecret)
