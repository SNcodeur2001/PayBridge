import { settings, isBitnobConfigured } from '../config/settings.js'
import { BitnobClient } from './BitnobClient.js'
import { BitnobPaymentProvider } from './BitnobPaymentProvider.js'
import { SimulatedPaymentProvider } from './SimulatedPaymentProvider.js'

export function createPaymentProvider() {
  if (!isBitnobConfigured) return new SimulatedPaymentProvider()
  const client = new BitnobClient(settings.bitnob)
  return new BitnobPaymentProvider(client, settings)
}
