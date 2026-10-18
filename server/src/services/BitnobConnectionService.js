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
      bitnob: identity,
      connected: true,
      ...(identity.active !== undefined ? { active: identity.active } : {}),
      ...(identity.environment !== undefined ? { environment: identity.environment } : {}),
      ...(identity.client_id !== undefined ? { clientId: identity.client_id } : {}),
      ...(identity.client_name !== undefined ? { clientName: identity.client_name } : {}),
      ...(identity.active_company_id !== undefined ? { companyId: identity.active_company_id } : {}),
      ...(identity.auth_method !== undefined ? { authMethod: identity.auth_method } : {}),
      ...(identity.permissions !== undefined ? { permissions: identity.permissions } : {}),
    }
  }
}
