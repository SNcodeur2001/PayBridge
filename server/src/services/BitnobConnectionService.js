import { AppError } from '../core/AppError.js'

/** Narrow integration service used to verify Bitnob credentials before enabling other APIs. */
export class BitnobConnectionService {
  constructor({ client }) {
    this.client = client
  }

  async whoami() {
    if (!this.client) throw new AppError(503, 'Identifiants Bitnob absents : configure BITNOB_CLIENT_ID et BITNOB_CLIENT_SECRET.')
    const identity = await this.client.request('GET', '/api/whoami')
    return {
      connected: true,
      active: Boolean(identity.active),
      environment: identity.environment ?? null,
      clientId: identity.client_id ?? null,
      clientName: identity.client_name ?? null,
      companyId: identity.active_company_id ?? null,
      authMethod: identity.auth_method ?? null,
      permissions: identity.permissions ?? null,
    }
  }
}
