import { Schema as S } from 'effect'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'
import * as Queue from 'effect/Queue'
import * as Result from 'effect/Result'
import * as Stream from 'effect/Stream'
import net from 'node:net'

import { strykerLevelToEffect, StrykerLogLevel } from './log-level.js'
import { LoggingEvent } from './logging-event.js'
import { SerializedLoggingEventSchema } from './logging-event.schema.js'
import { LoggingServerNotTcpError } from './logging-server.schema.js'

export interface LoggingServerAddress {
  readonly port: number
}

export const DELIMITER = '__STRYKER_CORE__'

/**
 * Parent-side framed TCP channel. Workers cannot write to the parent's stdout
 * coherently, so they serialize `SerializedLoggingEvent` over this socket.
 * The wire format is validated on receipt (`S.decodeUnknownResult`) — decode
 * failure is handled via `Result`, not a throw across the socket callback.
 *
 * Exposed as a SCOPED `Layer`: the server binds on `acquire`, the address is
 * the provided value, and the socket is closed on `release`.
 */
export class LoggingServerAddressService extends Context.Service<LoggingServerAddressService, LoggingServerAddress>()(
  'stryker-js/mutation-run/LoggingServerAddress',
) {}

/**
 * How the parent renders a log event it received from a worker.
 *
 * One format, because the function that chose one took no argument: the
 * alternatives beside it — a JSON renderer, a no-op, `Logger.batched` — were
 * each constructed and then discarded with `void` to satisfy an unused-symbol
 * check, which is a check answered by writing the token it scans for rather
 * than by the code doing the thing. If a second format is wanted, it arrives
 * as a parameter here and a caller that passes it; git holds the deleted ones
 * until then.
 */
const serverLogger: Logger.Logger<unknown, void> = Logger.withConsoleLog(Logger.formatSimple)

const formatDecodedEvent = (event: LoggingEvent): string => event.format()

const emitWithEffectLevel = (event: LoggingEvent): Effect.Effect<void> => {
  if (event.level === StrykerLogLevel.Off) {
    return Effect.void
  }
  const level = strykerLevelToEffect(event.level)
  const message = formatDecodedEvent(event)
  switch (level) {
    case 'Trace':
      return Effect.logTrace(message)
    case 'Debug':
      return Effect.logDebug(message)
    case 'Info':
      return Effect.logInfo(message)
    case 'Warn':
      return Effect.logWarning(message)
    case 'Error':
      return Effect.logError(message)
    case 'Fatal':
      return Effect.logFatal(message)
    case 'All':
      return Effect.log(message)
    case 'None':
      return Effect.void
  }
}

/**
 * Read framed events off one worker's socket into `frames`.
 *
 * A plain function, and deliberately not an `Effect`: Node hands us a `data`
 * callback, so the only thing that can happen here is an unsuspended offer.
 * `Queue.offerUnsafe` is that, and the fiber draining `frames` is where the
 * decoding, the logging and the one interpretation of an `Effect` happen.
 * One fiber drains the queue with the logger provided once, so nothing here
 * interprets an `Effect` per frame or rebuilds a logger for a single line.
 */
const readFramesInto = (frames: Queue.Enqueue<string>) => (socket: net.Socket): void => {
  let pending = ''

  socket.on('data', (data: Buffer | string) => {
    pending += typeof data === 'string' ? data : data.toString('utf8')

    let index: number
    while ((index = pending.indexOf(DELIMITER)) !== -1) {
      const raw = pending.slice(0, index)
      pending = pending.slice(index + DELIMITER.length)
      if (raw.length > 0) {
        Queue.offerUnsafe(frames, raw)
      }
    }
    // Whatever is left is the head of a frame whose tail has not arrived. It
    // stays in `pending` rather than being decoded as a short frame.
  })

  socket.on('error', () => {
    // A worker hanging up is ordinary: it finished, or the pool retired it.
    // The frames it already sent are in the queue and are still drained.
  })
}

/**
 * Decode one frame and emit it, or say why it could not be emitted.
 *
 * Both rejections are `logWarning` rather than failures, because one worker
 * writing a bad frame must not end the run — but they are logged through the
 * same logger as everything else, so they appear where someone reading the run
 * output will see them.
 */
const emitFrame = (raw: string): Effect.Effect<void> =>
  Effect.suspend(() => {
    const parsed = Result.try({
      try: () => JSON.parse(raw) as unknown,
      catch: (cause) => cause,
    })

    if (Result.isFailure(parsed)) {
      return Effect.logWarning(
        `Dropping a worker log frame that is not JSON: ${raw.slice(0, 200)}`,
      )
    }

    const decoded = S.decodeUnknownResult(SerializedLoggingEventSchema)(parsed.success)
    if (Result.isFailure(decoded)) {
      return Effect.logWarning('Dropping a worker log frame that failed wire-schema validation')
    }

    return emitWithEffectLevel(LoggingEvent.deserialize(decoded.success))
  })

/**
 * Bind the parent's log server and provide its address.
 *
 * The frames are drained by one forked fiber with the logger provided once, so
 * this module interprets no `Effect` itself — the run's single entry point does
 * that. The fiber is forked into the layer's scope, so it is interrupted when
 * the run ends and cannot outlive the server it reads for.
 */
export const LoggingServerLive: Layer.Layer<LoggingServerAddressService, LoggingServerNotTcpError> = Layer.effect(
  LoggingServerAddressService,
  Effect.gen(function*() {
    const frames = yield* Queue.unbounded<string>()

    const server = yield* Effect.acquireRelease(
      Effect.callback<net.Server>((resume) => {
        const bound = net.createServer(readFramesInto(frames))
        bound.listen(() => {
          resume(Effect.succeed(bound))
        })
        // Interrupted mid-listen: close the half-bound server, so the handle is
        // not left open with nobody holding it.
        return Effect.sync(() => {
          bound.close()
        })
      }).pipe(Effect.withSpan('logging.server.listen')),
      (bound) =>
        Effect.sync(() => {
          bound.close()
        }).pipe(Effect.withSpan('logging.server.close')),
    )

    yield* Stream.fromQueue(frames).pipe(
      Stream.runForEach(emitFrame),
      Effect.provide(Logger.layer([serverLogger])),
      Effect.forkChild,
    )

    const address = server.address()
    if (address === null || typeof address === 'string') {
      return yield* new LoggingServerNotTcpError({ address })
    }

    yield* Effect.logDebug(`Logging server listening on port ${address.port}`)
    return { port: address.port } satisfies LoggingServerAddress
  }),
)
