import {
  type OperationStoreCtx,
  type OperationStoreHandlers,
  operationStoreOf,
  type SettlementSink,
} from '@systemfsoftware/agent-front-door/operations'
import { Effect } from 'effect'

interface DurableObjectIdLike {
  readonly name?: string | undefined
}

interface DurableObjectStubLike {
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

interface OperationNamespace {
  readonly idFromName: (name: string) => DurableObjectIdLike
  readonly get: (id: DurableObjectIdLike) => DurableObjectStubLike
}

interface Env {
  readonly OPERATIONS: OperationNamespace
}

const recordSink = (ctx: OperationStoreCtx): SettlementSink => () => {
  ctx.storage.sql.exec('INSERT INTO sink_run (tag) VALUES (?)', 'settled')
}

export class OperationStore {
  private readonly handlers: OperationStoreHandlers

  constructor(private readonly ctx: OperationStoreCtx) {
    this.handlers = operationStoreOf({ ctx: this.ctx, sinks: [recordSink(this.ctx)] })
  }

  fetch(request: Request): Promise<Response> {
    return Effect.runPromise(this.handlers.fetch(request))
  }

  alarm(): Promise<void> {
    return Effect.runPromise(this.handlers.alarm)
  }
}

const forward = (env: Env, request: Request): Promise<Response> => {
  const url = new URL(request.url)
  const name = url.pathname.split('/')[2] ?? ''
  const path = url.pathname.replace(/^\/op\/[^/]+/, '') || '/'
  const stub = env.OPERATIONS.get(env.OPERATIONS.idFromName(name))
  const target = new URL(path, url.origin).toString()
  return request.method === 'GET' || request.method === 'HEAD'
    ? stub.fetch(target, { method: request.method })
    : request.text().then((body) => stub.fetch(target, { method: request.method, headers: request.headers, body }))
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return new URL(request.url).pathname.startsWith('/op/')
      ? forward(env, request)
      : Promise.resolve(new Response('operations fixture', { status: 404 }))
  },
}
