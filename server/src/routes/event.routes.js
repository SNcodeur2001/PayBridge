import { Router } from 'express'

export function createEventRouter({ repository }) {
  const router = Router()
  router.get('/', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    res.flushHeaders?.()
    res.write('retry: 3000\n\n')
    const unsubscribe = repository.subscribe((event) => res.write(`data: ${JSON.stringify(event.data)}\n\n`))
    const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 20_000)
    req.on('close', () => { unsubscribe(); clearInterval(heartbeat) })
  })
  return router
}
