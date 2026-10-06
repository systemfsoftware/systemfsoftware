import { Context, Effect, FileSystem, Layer, Schema, Semaphore } from 'effect'
import * as HttpEffect from 'effect/http/HttpEffect'
import type { HttpServerResponse } from 'effect/http/HttpServerResponse'
import { CloudflareApiRequestLine, recordOf } from './request-record.schema.js'
import type { CloudflareApiRequestRecord } from './request-record.schema.js'

export interface RequestLogShape {
  readonly append: (record: CloudflareApiRequestRecord) => Effect.Effect<void>
}

export class RequestLog extends Context.Service<RequestLog, RequestLogShape>()(
  '@systemfsoftware/cloudflare-emulator/RequestLog',
) {}

export const discardLayer = Layer.succeed(RequestLog, { append: () => Effect.void })

const encodeLine = Schema.encodeEffect(CloudflareApiRequestLine)

export const fileLayer = (path: string) =>
  Layer.effect(
    RequestLog,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const file = yield* fs.open(path, { flag: 'w' })
      const lock = yield* Semaphore.make(1)
      const encoder = new TextEncoder()
      return {
        append: (record: CloudflareApiRequestRecord) =>
          encodeLine(record).pipe(
            Effect.flatMap((line) => file.writeAll(encoder.encode(`${line}\n`))),
            lock.withPermits(1),
            Effect.uninterruptible,
            Effect.orDie,
          ),
      }
    }),
  )

export const recordRequests = <E, R>(app: Effect.Effect<HttpServerResponse, E, R>) =>
  Effect.gen(function*() {
    const log = yield* RequestLog
    yield* HttpEffect.appendPreResponseHandler((request, response) =>
      Effect.as(
        log.append(recordOf({ method: request.method, target: request.url, status: response.status })),
        response,
      )
    )
    return yield* app
  })
