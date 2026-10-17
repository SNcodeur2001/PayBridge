import { AppError } from '../core/AppError.js'

export function errorHandler(error, _req, res, _next) {
  if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ message: 'JSON invalide.' })
  const status = error instanceof AppError ? error.status : Number(error.status) || 500
  if (status >= 500) console.error(error)
  res.status(status).json({ message: status >= 500 && !(error instanceof AppError) ? 'Erreur interne du serveur.' : error.message, ...(error.details ? { details: error.details } : {}) })
}
