import { Effect } from 'effect'
import { createServer } from 'node:net'

const LOOPBACK = '127.0.0.1'

export const freeLoopbackOrigin: Effect.Effect<string> = Effect.callback((resume) => {
  const probe = createServer()
  probe.on('error', (cause) => resume(Effect.die(cause)))
  probe.listen(0, LOOPBACK, () => {
    const address = probe.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    probe.close(() => resume(Effect.succeed(`http://${LOOPBACK}:${port}`)))
  })
})
