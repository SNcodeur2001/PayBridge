export function createApiKeyMiddleware(apiKey) {
  return (req, res, next) => {
    if (!apiKey) return next()
    if (req.get('Authorization') === `Bearer ${apiKey}`) return next()
    return res.status(401).json({ message: 'API key invalide ou manquante. Ajoutez Authorization: Bearer <API_KEY>.' })
  }
}
