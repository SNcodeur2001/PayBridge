import crypto from 'node:crypto'
import { AppError } from '../core/AppError.js'

/** HTTP client responsible only for authentication and transport to Bitnob. */
export class BitnobClient {
  constructor({ clientId, clientSecret, baseUrl }) {
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  #signedHeaders(payload) {
    const timestamp = Math.floor(Date.now() / 1000)
    const nonce = crypto.randomBytes(16).toString('hex')
    const message = `${this.clientId}:${timestamp}:${nonce}:${payload}`
    const signature = crypto.createHmac('sha256', this.clientSecret).update(message).digest('hex')
    return {
      'X-Auth-Client': this.clientId,
      'X-Auth-Timestamp': String(timestamp),
      'X-Auth-Nonce': nonce,
      'X-Auth-Signature': signature,
    }
  }

  async request(method, path, body) {
    const payload = ['POST', 'PUT', 'PATCH'].includes(method) && body ? JSON.stringify(body) : ''
    const query = method === 'GET' && body ? `?${new URLSearchParams(body)}` : ''
    let response
    try {
      response = await fetch(`${this.baseUrl}${path}${query}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...this.#signedHeaders(payload) },
        body: payload || undefined,
        signal: AbortSignal.timeout(15_000),
      })
    } catch (error) {
      // Node's fetch often reports only "fetch failed"; the nested cause carries
      // the useful transport detail (DNS, connection refused, TLS, timeout).
      const cause = error.cause
      const code = cause?.code ?? (error.name === 'TimeoutError' ? 'TIMEOUT' : error.name)
      const detail = cause?.message ?? error.message
      throw new AppError(502, `Connexion Bitnob impossible (${code}) : ${detail}`)
    }

    const json = await response.json().catch(() => ({}))
    if (!response.ok || json.success === false) {
      throw new AppError(response.status >= 400 && response.status < 500 ? response.status : 502, json.detail ?? json.message ?? json.title ?? `Erreur Bitnob HTTP ${response.status}`, json)
    }
    return json.data ?? json
  }
}
