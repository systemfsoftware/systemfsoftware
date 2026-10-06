import { Effect, Match } from 'effect'

interface FetcherLike {
  fetch(input: string, init?: RequestInit): Promise<Response>
}

interface DurableObjectId {}

interface DurableObjectClass {}

interface FacetStartup {
  readonly class: DurableObjectClass
}

interface FacetContext {
  readonly facets: {
    get(name: string, startup: () => FacetStartup): FetcherLike
  }
}

interface WorkerCode {
  readonly compatibilityDate: string
  readonly mainModule: string
  readonly modules: Readonly<Record<string, string>>
  readonly globalOutbound?: null
}

interface WorkerStub {
  getEntrypoint(): FetcherLike
  getDurableObjectClass(name: string): DurableObjectClass
}

interface WorkerLoader {
  get(id: string, code: () => WorkerCode): WorkerStub
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): FetcherLike
}

interface Env {
  readonly LOADER: WorkerLoader
  readonly SUP: DurableObjectNamespace
  readonly BACKEND: FetcherLike
}

const COMPATIBILITY_DATE = '2026-10-05'

const BLOCKED_WORKER = `export default { fetch: () => fetch('https://example.com/') }`

const FACET_WORKER = `
import { DurableObject } from 'cloudflare:workers'

export class Facet extends DurableObject {
  async fetch(request) {
    const value = new URL(request.url).searchParams.get('value') ?? ''
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS row (value TEXT)')
    this.ctx.storage.sql.exec('INSERT INTO row (value) VALUES (?)', value)
    const rows = this.ctx.storage.sql.exec('SELECT value FROM row').toArray()
    return Response.json({ rows: rows.map((row) => row.value) })
  }
}
`

export class Supervisor {
  constructor(private readonly ctx: FacetContext, private readonly env: Env) {}

  fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    return Effect.runPromise(
      Match.value(url.pathname).pipe(
        Match.when('/loader', () => this.loaderReport()),
        Match.when('/facet', () => this.facetReport(url.searchParams.get('name') ?? 'a', request)),
        Match.when('/service', () => this.serviceReport()),
        Match.orElse(() => Effect.succeed(new Response('supervisor', { status: 404 }))),
      ),
    )
  }

  private loaderReport(): Effect.Effect<Response> {
    const worker = this.env.LOADER.get('blocked', () => ({
      compatibilityDate: COMPATIBILITY_DATE,
      mainModule: 'blocked.js',
      modules: { 'blocked.js': BLOCKED_WORKER },
      globalOutbound: null,
    }))
    const attempt = Effect.tryPromise({
      try: () => worker.getEntrypoint().fetch('http://example.com/'),
      catch: (error) => (error instanceof Error ? error.message : 'a non-error was thrown'),
    })
    return Effect.match(attempt, {
      onSuccess: (response) => Response.json({ message: `allowed:${response.status}` }),
      onFailure: (message) => Response.json({ message }),
    })
  }

  private facetReport(name: string, request: Request): Effect.Effect<Response> {
    const worker = this.env.LOADER.get('facet', () => ({
      compatibilityDate: COMPATIBILITY_DATE,
      mainModule: 'facet.js',
      modules: { 'facet.js': FACET_WORKER },
    }))
    const facet = this.ctx.facets.get(name, () => ({ class: worker.getDurableObjectClass('Facet') }))
    return Effect.promise(() => facet.fetch(request.url))
  }

  private serviceReport(): Effect.Effect<Response> {
    const backend = this.env.BACKEND
    return Effect.gen(function*() {
      const response = yield* Effect.promise(() => backend.fetch('http://backend/from-supervisor'))
      const text = yield* Effect.promise(() => response.text())
      return new Response(`supervisor saw ${text}`)
    })
  }
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> => env.SUP.get(env.SUP.idFromName('one')).fetch(request.url),
}
