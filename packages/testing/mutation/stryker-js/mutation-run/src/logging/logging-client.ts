import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'
import type * as LogLevel from 'effect/LogLevel'
import net from 'node:net'

import { isStrykerLevelEnabled, strykerLevelToEffect, type StrykerLogLevel } from './log-level.js'
import { type LoggingEvent, serializeLoggingEvent } from './logging-event.js'
import type { LoggingServerAddress } from './logging-server.js'
import { DELIMITER } from './logging-server.js'

/**
 * Worker-side end of the framed TCP channel. The parent cannot share stdout
 * with forked workers, so workers push `SerializedLoggingEvent` frames over
 * this socket. This capability survives as a SCOPED `Layer`.
 */
export class LoggingClient extends Context.Service<LoggingClient, {
  readonly log: (event: LoggingEvent) => Effect.Effect<void>
  readonly isEnabled: (level: StrykerLogLevel) => Effect.Effect<boolean>
  /**
   * The `Logger` the worker installs so `Effect.log*` reaches the parent too.
   *
   * On the service rather than installed inside this layer because the worker's
   * entry point is the one place that decides what its fibers log through, and a
   * logger installed invisibly by a transport layer is a logger nobody can find
   * when the output is wrong.
   */
  readonly logger: Logger.Logger<unknown, void>
}>()('stryker-js/mutation-run/LoggingClient') {}

/**
 * A `Logger` that frames every event onto the parent's socket.
 *
 * Worker code logs through `Effect.logInfo` and friends as well as through this
 * service's `log` member, and both have to reach the parent. Installing this as
 * the worker's logger is what makes the first of those arrive: without it the
 * generic path writes nowhere, silently, and only explicit `log(event)` calls
 * are ever seen.
 */
const makeForwardingLogger = (socket: net.Socket): Logger.Logger<unknown, void> => {
  if (!socket.writable) {
    return Logger.make(() => {})
  }
  return Logger.make((options) => {
    const message = String(options.message)
    const level = options.logLevel
    // Best-effort: derive a Stryker level from the Effect level for framing.
    // `All`/`None` are never emitted as message levels, so they are dropped.
    const strykerLevel = effectLevelToStryker(level)
    if (strykerLevel === undefined) return
    // `options.date` is the instant Effect's runtime stamped this entry with,
    // so the frame carries the run's clock rather than a second reading of the
    // wall clock taken here.
    const event: LoggingEvent = {
      startTime: options.date,
      categoryName: 'worker',
      data: [message],
      level: strykerLevel,
      pid: process.pid,
    }
    const frame = JSON.stringify(serializeLoggingEvent(event)) + DELIMITER
    socket.write(frame)
  })
}

const effectLevelToStryker = (level: LogLevel.LogLevel): StrykerLogLevel | undefined => {
  switch (level) {
    case 'Trace':
      return 'trace'
    case 'Debug':
      return 'debug'
    case 'Info':
      return 'info'
    case 'Warn':
      return 'warn'
    case 'Error':
      return 'error'
    case 'Fatal':
      return 'fatal'
    case 'All':
    case 'None':
      return undefined
  }
}

const isSocketWritable = (socket: net.Socket): boolean => socket.writable

/**
 * Connect to the parent's logging server and provide `LoggingClient`.
 *
 * The returned layer also installs the forwarding logger, so a worker's
 * `Effect.logInfo` reaches the parent as well as an explicit `log(event)`. The
 * socket closes on release and on interrupt.
 */
export const makeLoggingClientLayer = (
  address: LoggingServerAddress,
  minimumLevel: StrykerLogLevel,
): Layer.Layer<LoggingClient> =>
  Layer.effect(
    LoggingClient,
    Effect.acquireRelease(
      Effect.callback<net.Socket>((resume) => {
        const sock = net.createConnection(address.port, 'localhost', () => {
          resume(Effect.succeed(sock))
        })
        sock.on('error', (error) => {
          resume(Effect.die(error))
        })
        // Interrupted mid-connect: end the half-open socket. Returning it
        // leaves the handle open with nobody holding it.
        return Effect.sync(() => {
          sock.destroy()
        })
      }),
      (sock) =>
        Effect.sync(() => {
          if (isSocketWritable(sock)) {
            sock.end()
          }
        }),
    ).pipe(
      Effect.map((socket) => {
        const forwardingLogger = makeForwardingLogger(socket)
        return {
          log: (event: LoggingEvent): Effect.Effect<void> =>
            Effect.sync(() => {
              if (!isStrykerLevelEnabled(event.level)) return
              if (!isSocketWritable(socket)) return
              // Threshold check is Effect's `MinimumLogLevel` in the worker's
              // fiber; this local check mirrors it for the direct `log(event)`
              // path so we don't frame `off`/`below-threshold` events.
              const msgLevel = strykerLevelToEffect(event.level)
              if (msgLevel === 'None') return
              socket.write(JSON.stringify(serializeLoggingEvent(event)) + DELIMITER)
            }).pipe(Effect.withSpan('logging.client.send')),
          isEnabled: (level: StrykerLogLevel): Effect.Effect<boolean> => Effect.succeed(isStrykerLevelEnabled(level)),
          logger: forwardingLogger,
        }
      }),
    ),
  )

/**
 * A client with no transport, for a test that does not assert on what a worker
 * logged. `isEnabled` answers false so nothing is even framed.
 */
export const LoggingClientNoopLive: Layer.Layer<LoggingClient> = Layer.succeed(
  LoggingClient,
  {
    log: () => Effect.void,
    isEnabled: () => Effect.succeed(false),
    logger: Logger.make(() => {}),
  },
)
