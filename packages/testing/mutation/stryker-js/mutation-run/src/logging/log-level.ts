import type * as LogLevel from 'effect/LogLevel'

/**
 * Stryker's own level vocabulary. Kept on the wire (`logging-event.schema.ts`)
 * so the TCP transport remains what it was: workers send these strings and the
 * server decodes them. The decode to Effect's vocabulary happens exactly once,
 * at the server edge — `strykerLevelToEffect` — not by widening Effect's
 * level set.
 */
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

/**
 * Total mapping of every Stryker level to the Effect level it becomes when the
 * event reaches the parent. Stryker's `off` has no Effect severity equivalent:
 * it becomes `None`, which as a `MinimumLogLevel` silences every concrete
 * severity (including itself when used as a threshold). When `off` appears as
 * a *message* level (not a threshold) the server drops it before emitting.
 *
 * | Stryker | Effect |
 * |---------|--------|
 * | trace   | Trace  |
 * | debug   | Debug  |
 * | info    | Info   |
 * | warn    | Warn   |
 * | error   | Error  |
 * | fatal   | Fatal  |
 * | off     | None   |
 */
export const strykerLevelToEffect = (
  level: StrykerLogLevel,
): LogLevel.LogLevel => {
  switch (level) {
    case StrykerLogLevel.Trace:
      return 'Trace'
    case StrykerLogLevel.Debug:
      return 'Debug'
    case StrykerLogLevel.Information:
      return 'Info'
    case StrykerLogLevel.Warning:
      return 'Warn'
    case StrykerLogLevel.Error:
      return 'Error'
    case StrykerLogLevel.Fatal:
      return 'Fatal'
    case StrykerLogLevel.Off:
      return 'None'
  }
}

/**
 * Whether a message at this level should be emitted at all. `off` never emits;
 * everything else does. The threshold check itself is left to Effect's
 * `MinimumLogLevel`.
 */
export const isStrykerLevelEnabled = (
  level: StrykerLogLevel,
): boolean => level !== StrykerLogLevel.Off

/**
 * Decode at the edge: turn an unknown string from config/worker into a
 * Stryker level, throwing on unknown values. Callers that already hold a typed
 * level should use the mapping function directly.
 */
export const decodeStrykerLevel = (raw: string): StrykerLogLevel => {
  switch (raw) {
    case StrykerLogLevel.Trace:
    case StrykerLogLevel.Debug:
    case StrykerLogLevel.Information:
    case StrykerLogLevel.Warning:
    case StrykerLogLevel.Error:
    case StrykerLogLevel.Fatal:
    case StrykerLogLevel.Off:
      return raw
    default:
      throw new Error(`Unknown Stryker log level: ${raw}`)
  }
}
