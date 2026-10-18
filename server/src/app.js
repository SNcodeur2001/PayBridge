import express from 'express'
import { settings } from './config/settings.js'
import { JsonFileRepository } from './repositories/JsonFileRepository.js'
import { createPaymentProvider } from './providers/createPaymentProvider.js'
import { BitnobClient } from './providers/BitnobClient.js'
import { hasBitnobCredentials } from './config/settings.js'
import { PaymentService } from './services/PaymentService.js'
import { WebhookService } from './services/WebhookService.js'
import { BitnobConnectionService } from './services/BitnobConnectionService.js'
import { createCorsMiddleware } from './middleware/cors.js'
import { errorHandler } from './middleware/errorHandler.js'
import { createApiRouter } from './routes/api.routes.js'
import { createWebhookRouter } from './routes/webhook.routes.js'
import { AppError } from './core/AppError.js'

export function createApp({ repository = new JsonFileRepository(), provider, config = settings, bitnobConnectionService } = {}) {
  const paymentProvider = provider ?? createPaymentProvider(config)
  const bitnobClient = hasBitnobCredentials(config) ? new BitnobClient(config.bitnob) : null
  const connectionService = bitnobConnectionService ?? new BitnobConnectionService({ client: bitnobClient })
  const paymentService = new PaymentService({ provider: paymentProvider, repository })
  const webhookService = new WebhookService({ repository, settings: config, provider: paymentProvider })
  const dependencies = { repository, provider: paymentProvider, paymentService, webhookService, bitnobConnectionService: connectionService, apiKey: config.apiKey }
  const app = express()

  app.disable('x-powered-by')
  app.use(createCorsMiddleware(config.allowedOrigins))
  // Register the raw-body webhook before JSON parsing so HMAC verification uses the original bytes.
  app.use('/api/webhooks', createWebhookRouter(dependencies))
  app.use(express.json({ limit: '32kb' }))
  app.use('/api', createApiRouter(dependencies))
  app.use((req, _res, next) => next(new AppError(404, `Route inconnue : ${req.method} ${req.path}`)))
  app.use(errorHandler)

  if (paymentProvider.isLive) {
    const poller = setInterval(() => paymentService.refreshPendingTransfers(), 20_000)
    poller.unref()
  }
  return app
}
