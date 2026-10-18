export function createCorsMiddleware(allowedOrigins) {
  return (req, res, next) => {
    const origin = req.get('Origin')
    const wildcard = allowedOrigins.includes('*')
    const allowed = wildcard ? (origin ?? '*') : (allowedOrigins.includes(origin) ? origin : null)
    if (allowed) {
      res.set('Access-Control-Allow-Origin', allowed)
      res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS')
      res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization')
      if (allowed !== '*') res.vary('Origin')
    }
    if (req.method === 'OPTIONS') return res.sendStatus(allowed || !origin ? 204 : 403)
    next()
  }
}
