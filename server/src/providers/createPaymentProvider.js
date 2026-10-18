import { settings, hasBitnobCredentials } from '../config/settings.js'
import { BitnobClient } from './BitnobClient.js'
import { BitnobPaymentProvider } from './BitnobPaymentProvider.js'
import { AppError } from '../core/AppError.js'

export function createPaymentProvider(config = settings) {
  if (!hasBitnobCredentials(config)) throw new AppError(500, 'BITNOB_CLIENT_ID et BITNOB_CLIENT_SECRET sont requis pour démarrer l’API.')
  const client = new BitnobClient(config.bitnob)
  return new BitnobPaymentProvider(client, config)
}
