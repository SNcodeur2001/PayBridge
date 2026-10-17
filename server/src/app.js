import express from 'express'
import { settings } from './config/settings.js'
import { MemoryRepository } from './repositories/MemoryRepository.js'
import { createPaymentProvider } from './providers/createPaymentProvider.js'
import { PaymentService } from './services/PaymentService.js'
import { WebhookService } from './services/WebhookService.js'
import { createCorsMiddleware } from './middleware/cors.js'
import { errorHandler } from './middleware/errorHandler.js'
import { createApiRouter } from './routes/api.routes.js'
import { createWebhookRouter } from './routes/webhook.routes.js'
import { AppError } from './core/AppError.js'

export function createApp({ repository = new MemoryRepository(), provider = createPaymentProvider(), config = settings } = {}) {
  const paymentService = new PaymentService({ provider, repository })
  const webhookService = new WebhookService({ repository, settings: config, provider })
  const dependencies = { repository, provider, paymentService, webhookService, apiKey: config.apiKey }
  const app = express()

  app.disable('x-powered-by')
  app.use(createCorsMiddleware(config.allowedOrigins))
  // Register the raw-body webhook before JSON parsing so HMAC verification uses the original bytes.
  app.use('/api/webhooks', createWebhookRouter(dependencies))
  app.use(express.json({ limit: '32kb' }))
  app.use('/api', createApiRouter(dependencies))
  app.use((req, _res, next) => next(new AppError(404, `Route inconnue : ${req.method} ${req.path}`)))
  app.use(errorHandler)

  if (provider.isLive) {
    const poller = setInterval(() => paymentService.refreshPendingTransfers(), 20_000)
    poller.unref()
  }
  return app
}
