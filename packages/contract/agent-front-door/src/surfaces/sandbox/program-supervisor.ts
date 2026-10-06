import { Clock, Effect, Option, Schema } from 'effect'
import type { Fetcher } from './egress-gateway.js'
import { FacetPrepare } from './lifetime.schema.js'

const COMPATIBILITY_DATE = '2026-10-05'

export interface ProgramModuleOptions {
  readonly program: string
  readonly allow: ReadonlyArray<string>
}

export const programModule = ({ program, allow }: ProgramModuleOptions): string => `
import { DurableObject } from 'cloudflare:workers'
import { connect as __connect } from 'cloudflare:sockets'

const __allow = ${JSON.stringify(allow)}
const __fetch = globalThis.fetch
const __hostOf = (input) => {
  try {
    const url = typeof input === 'string' ? input : (input && input.url) ? input.url : String(input)
    return new URL(url).hostname
  } catch {
    return ''
  }
}
const __denied = (host) => {
  const error = new Error('the program is not permitted to reach ' + host)
  error.__sandbox = { _tag: 'EgressDenied', host: host }
  return error
}
globalThis.fetch = (input, init) => {
  const host = __hostOf(input)
  return __allow.includes(host) ? __fetch(input, init) : Promise.reject(__denied(host))
}
const connect = (address, options) => {
  const host = String(address).split(':')[0]
  if (!__allow.includes(host)) { throw __denied(host) }
  return __connect(address, options)
}
const __tool = (env, name, input) =>
  env.TOOLS.fetch('http://tools/' + name, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ capability: name, input: input }),
  }).then((response) => response.json()).then((answer) => {
    if (answer && answer._tag === 'Completed') { return answer.output }
    const error = new Error('the tool call ' + name + ' did not complete')
    error.__sandbox = answer && answer._tag === 'Refused'
      ? { _tag: 'Refused', refusal: answer.refusal }
      : { _tag: 'Threw', message: JSON.stringify(answer) }
    throw error
  })

export class Program extends DurableObject {
  fetch(request) {
    const url = new URL(request.url)
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS row (value TEXT)')
    if (url.pathname === '/add') {
      return request.text().then((value) => {
        this.ctx.storage.sql.exec('INSERT INTO row (value) VALUES (?)', value)
        return Response.json({ ok: true })
      })
    }
    const rows = this.ctx.storage.sql.exec('SELECT value FROM row').toArray().map((row) => row.value)
    return Promise.resolve(Response.json({ rows: rows }))
  }
}

export default {
  fetch(req, env) {
    const tools = new Proxy({}, { get: (_target, name) => (input) => __tool(env, String(name), input) })
    return (async () => { ${program} })().then(
      (value) => Response.json({ _tag: 'Completed', value: value }),
      (error) => Response.json(error && error.__sandbox ? error.__sandbox : { _tag: 'Threw', message: String((error && error.message) || error) }),
    )
  },
}
`

interface WorkerStub {
  getDurableObjectClass(name: string): object
}

interface WorkerLoader {
  get(id: string, code: () => object): WorkerStub
}

interface FacetNamespace {
  get(name: string, startup: () => { readonly class: object }): Fetcher
  delete(name: string): boolean
}

interface SupervisorStorage {
  setAlarm(scheduledTime: number): void
  get(key: string): Promise<string | undefined>
  put(key: string, value: string): Promise<void>
}

export interface SupervisorCtx {
  readonly facets: FacetNamespace
  readonly storage: SupervisorStorage
}

export interface SupervisorEnv {
  readonly LOADER: WorkerLoader
}

export interface SupervisorPrepareInput {
  readonly ctx: SupervisorCtx
  readonly env: SupervisorEnv
  readonly request: Request
}

export interface SupervisorFacetInput {
  readonly ctx: SupervisorCtx
  readonly env: SupervisorEnv
  readonly request: Request
}

export interface SupervisorAlarmInput {
  readonly ctx: SupervisorCtx
}

const facetClassOf = (env: SupervisorEnv, programId: string, classCode: string): object =>
  env.LOADER.get(`facet:${programId}`, () => ({
    compatibilityDate: COMPATIBILITY_DATE,
    mainModule: 'program.js',
    modules: { 'program.js': classCode },
    env: {},
    globalOutbound: null,
  })).getDurableObjectClass('Program')

const facetOf = (
  ctx: SupervisorCtx,
  env: SupervisorEnv,
  programId: string,
  classCode: string,
): Fetcher => ctx.facets.get(programId, () => ({ class: facetClassOf(env, programId, classCode) }))

const stored = (ctx: SupervisorCtx, key: string): Effect.Effect<string, Response> =>
  Effect.flatMap(
    Effect.promise(() => ctx.storage.get(key)),
    (value) =>
      Effect.fromOption(
        Option.fromUndefinedOr(value),
        () => Response.json({ _tag: 'FacetNotPrepared' }, { status: 404 }),
      ),
  )

export const programSupervisorPrepare = ({ ctx, env, request }: SupervisorPrepareInput): Promise<Response> =>
  Effect.runPromise(
    Effect.match(
      Effect.gen(function*() {
        const text = yield* Effect.promise(() => request.text())
        const prepare = yield* Schema.decodeEffect(Schema.fromJsonString(FacetPrepare))(text)
        yield* Effect.promise(() => ctx.storage.put('programId', prepare.programId))
        yield* Effect.promise(() => ctx.storage.put('classCode', prepare.classCode))
        facetOf(ctx, env, prepare.programId, prepare.classCode)
        const now = yield* Clock.currentTimeMillis
        ctx.storage.setAlarm(now + prepare.ttlSeconds * 1000)
        return Response.json({ _tag: 'Prepared' })
      }),
      {
        onFailure: () =>
          Response.json({ _tag: 'Rejected', issue: 'the facet prepare request is not well formed' }, { status: 400 }),
        onSuccess: (response) => response,
      },
    ),
  )

export const programSupervisorFacet = ({ ctx, env, request }: SupervisorFacetInput): Promise<Response> =>
  Effect.runPromise(
    Effect.match(
      Effect.gen(function*() {
        const programId = yield* stored(ctx, 'programId')
        const classCode = yield* stored(ctx, 'classCode')
        return yield* Effect.promise(() => facetOf(ctx, env, programId, classCode).fetch(request))
      }),
      { onFailure: (response) => response, onSuccess: (response) => response },
    ),
  )

export const programSupervisorAlarm = ({ ctx }: SupervisorAlarmInput): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function*() {
      const programId = yield* Effect.promise(() => ctx.storage.get('programId'))
      Option.match(Option.fromUndefinedOr(programId), {
        onNone: () => undefined,
        onSome: (id) => {
          ctx.facets.delete(id)
        },
      })
    }),
  )
