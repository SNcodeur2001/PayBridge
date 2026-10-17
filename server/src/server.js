import { settings } from './config/settings.js'
import { createApp } from './app.js'

const app = createApp()
const server = app.listen(settings.port, '0.0.0.0', () => {
  const mode = settings.bitnobPaymentsEnabled ? 'Bitnob LIVE' : 'simulation (Bitnob payments disabled)'
  console.log(`PayBridge API (${mode}) : http://localhost:${settings.port}`)
})

function shutdown(signal) {
  console.log(`${signal} reçu, arrêt du serveur…`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
