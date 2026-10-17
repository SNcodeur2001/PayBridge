import express from 'express'
import apiRouter from './routes/api.routes.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '32kb' }))
  app.use('/api', apiRouter)
  app.use((req, res) => res.status(404).json({ message: `Route inconnue : ${req.method} ${req.path}` }))
  app.use((err, _req, res, _next) => {
    console.error(err)
    res.status(err.status ?? 500).json({ message: err.status ? err.message : 'Erreur interne du serveur.' })
  })
  return app
}
