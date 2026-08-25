import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'
import util from 'node:util'

export const StrykerLogLevel = {
  Trace: 'trace',
  Debug: 'debug',
  Information: 'info',
  Warning: 'warn',
  Error: 'error',
  Fatal: 'fatal',
  Off: 'off',
} as const

export type StrykerLogLevel = (typeof StrykerLogLevel)[keyof typeof StrykerLogLevel]

const levelOrder: Record<StrykerLogLevel, number> = {
  trace: 0,
  debug: 10000,
  info: 20000,
  warn: 30000,
  error: 40000,
  fatal: 50000,
  off: Number.MAX_SAFE_INTEGER,
}

const isEnabled = (messageLevel: StrykerLogLevel, threshold: StrykerLogLevel): boolean => {
  if (threshold === 'off') return false
  return levelOrder[messageLevel] >= levelOrder[threshold]
}

const writeStderr = (sink: (line: string) => void, line: string): void => {
  // The host owns the descriptor: in machine mode stdout is the NDJSON
  // channel and must stay parseable, so the host points the sink at stderr;
  // in human mode the prose is the output, so the sink is stdout. The
  // engine never chooses the descriptor itself.
  sink(line + '\n')
}

const format = (message: string, args: readonly unknown[]): string => util.format(message, ...args)

/**
 * The run's log threshold.
 *
 * `get`/`set` are the Effect surface. `currentUnsafe` exists because the
 * `Logger` port is synchronous — `isInfoEnabled(): boolean`, not
 * `Effect<boolean>` — so a logger method cannot yield. Reading the cell
 * directly (`Ref.getUnsafe`, effect/Ref.ts:747) is what that contract allows;
 * interpreting an Effect per log line would open a fresh edge inside a
 * callback, which is the shape this engine exists without.
 */
export class EngineLogLevel extends Context.Service<
  EngineLogLevel,
  {
    readonly get: Effect.Effect<StrykerLogLevel, never, never>
    readonly set: (level: StrykerLogLevel) => Effect.Effect<void, never, never>
    readonly currentUnsafe: () => StrykerLogLevel
  }
>()('@systemfsoftware/stryker-js-mutation-run/EngineLogLevel') {}

const make = Effect.gen(function*() {
  const ref = yield* Ref.make<StrykerLogLevel>('info')
  return EngineLogLevel.of({
    get: Ref.get(ref),
    set: (level: StrykerLogLevel) => Ref.set(ref, level),
    currentUnsafe: () => Ref.getUnsafe(ref),
  })
})

export const layer = Layer.effect(EngineLogLevel)(make)

export const makeEngineLogger = (
  service: EngineLogLevel['Service'],
  sink: (line: string) => void,
): Logger => {
  const should = (level: StrykerLogLevel): boolean => isEnabled(level, service.currentUnsafe())
  return {
    isTraceEnabled: () => should('trace'),
    isDebugEnabled: () => should('debug'),
    isInfoEnabled: () => should('info'),
    isWarnEnabled: () => should('warn'),
    isErrorEnabled: () => should('error'),
    isFatalEnabled: () => should('fatal'),
    trace: (message: string, ...args: readonly unknown[]) => {
      if (should('trace')) writeStderr(sink, format(message, args))
    },
    debug: (message: string, ...args: readonly unknown[]) => {
      if (should('debug')) writeStderr(sink, format(message, args))
    },
    info: (message: string, ...args: readonly unknown[]) => {
      if (should('info')) writeStderr(sink, format(message, args))
    },
    warn: (message: string, ...args: readonly unknown[]) => {
      if (should('warn')) writeStderr(sink, format(message, args))
    },
    error: (message: string, ...args: readonly unknown[]) => {
      if (should('error')) writeStderr(sink, format(message, args))
    },
    fatal: (message: string, ...args: readonly unknown[]) => {
      if (should('fatal')) writeStderr(sink, format(message, args))
    },
  }
}
