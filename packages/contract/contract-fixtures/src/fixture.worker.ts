import { registry } from './registry.fixture.js'

const health = (): Response => Response.json({ ok: true, capabilities: Object.keys(registry) })
const notFound = (): Response => new Response('not found', { status: 404 })
const routes: Readonly<Record<string, () => Response>> = { '/health': health }

export default {
  fetch: (request: Request): Response => (routes[new URL(request.url).pathname] ?? notFound)(),
}
