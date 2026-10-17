import { settings, hasBitnobCredentials } from '../config/settings.js'
import { BitnobClient } from './BitnobClient.js'
import { BitnobPaymentProvider } from './BitnobPaymentProvider.js'
import { SimulatedPaymentProvider } from './SimulatedPaymentProvider.js'
import { AppError } from '../core/AppError.js'

export function createPaymentProvider(config = settings) {
  // Credentials alone never activate payouts: live money movement requires an explicit flag.
  if (!config.bitnobPaymentsEnabled) return new SimulatedPaymentProvider()
  if (!hasBitnobCredentials(config)) throw new AppError(500, 'BITNOB_PAYMENTS_ENABLED=true nécessite BITNOB_CLIENT_ID et BITNOB_CLIENT_SECRET.')
  const client = new BitnobClient(config.bitnob)
  return new BitnobPaymentProvider(client, config)
}
