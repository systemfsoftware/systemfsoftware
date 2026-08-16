/**
 * The wait-verdict kernel (R11) — the pure decision cell of the wait
 * interpreter. Every poll round produces one verdict, and the interpreter's
 * whole loop is a fold over these one-round decisions — which is exactly
 * what lets probe sequences be property-tested with zero I/O.
 *
 * | verdict    | condition
 * | ---------- | ---------------------------------------------------------
 * | `Ready`    | the round's probe observed the strategy's condition
 * | `Timeout`  | the probe failed and the deadline has passed — the verdict
 * |            | carries the bounded log tail the caller gathered for the report
 * | `Continue` | keep polling
 *
 * Two orderings the interpreter must preserve live here, mirroring upstream
 * `src/core/wait.ts`:
 *
 * - a successful probe wins even at/after the deadline — upstream's do-while
 *   "always probe at least once" rule (a 1ms timeout must still get its one
 *   shot), so `probeOk` is checked before the deadline;
 * - `ForPort` with no exposed ports and `ForLogMessage` count 0 are
 *   vacuously ready without any probe at all (`isTriviallyReady`), and the
 *   interpreter exits on that before touching the runtime or the clock.
 *
 * The kernel also owns the setup validation the wait-union schema
 * deliberately declines: `ForHttp.port`/`status` and `ForLogMessage.count`
 * are plain numbers on purpose (their schema doc comments name the
 * interpreter as the validator), and the resolved startup timeout — the
 * spec's `startupTimeoutMs`, an options override, or the 120s default — must
 * be a positive integer. A refused setup is the typed
 * `InvalidWaitStrategyError`, produced before any probe runs.
 */
import { Match, Result, Schema as S } from 'effect'
import type { WaitStrategy } from '../model/wait.schema.js'

/** The default startup deadline in milliseconds (upstream parity). */
export const DEFAULT_STARTUP_TIMEOUT_MS = 120_000

/** The default poll interval between probe rounds (upstream parity). */
export const DEFAULT_POLL_INTERVAL_MS = 250

/** The verdict space of one probe round. */
export type WaitVerdict =
  | { readonly _tag: 'Continue' }
  | { readonly _tag: 'Ready' }
  | { readonly _tag: 'Timeout'; readonly tail: string }

/** The one-round decision, as a pure function of the observed round. */
export interface WaitVerdictInput {
  /** The outcome of this round's probe — `true` when the strategy's readiness condition was observed. */
  readonly probeOk: boolean
  /** Milliseconds elapsed since the wait began. */
  readonly elapsedMs: number
  /** The startup deadline in milliseconds (positive — `validateWaitSetup` refuses anything else). */
  readonly timeoutMs: number
  /** The bounded log tail gathered for a timeout report; `''` until the deadline-crossing round. */
  readonly tail: string
}

/**
 * The one-round decision: a successful probe wins outright, then the
 * deadline is checked, then keep polling. The tail is carried unchanged
 * into the Timeout verdict so the kernel stays the single producer of the
 * timeout shape while the log-gathering I/O stays in the interpreter.
 */
export const decideVerdict = (input: WaitVerdictInput): WaitVerdict => {
  if (input.probeOk) {
    return { _tag: 'Ready' }
  }
  if (input.elapsedMs >= input.timeoutMs) {
    return { _tag: 'Timeout', tail: input.tail }
  }
  return { _tag: 'Continue' }
}

/**
 * True when the strategy is ready without any probe at all: `ForPort` with
 * no exposed ports is vacuous — nothing is listening, nothing to wait for
 * (upstream's empty-`exposedGuestPorts` case) — and `ForLogMessage` count 0
 * means "ready on the first probe, regardless of whether logs are even
 * fetchable yet" (upstream's `times === 0`), which the interpreter honors by
 * skipping the logs call entirely.
 */
export const isTriviallyReady = (strategy: WaitStrategy, exposedPortCount: number): boolean =>
  Match.value(strategy).pipe(
    Match.tag('ForPort', () => exposedPortCount === 0),
    Match.tag('ForLogMessage', (strategy) => (strategy.count ?? 1) === 0),
    Match.orElse(() => false),
  )

// =============================================================================
// Setup validation — refused as the typed `InvalidWaitStrategyError` before
// any probe runs (the launch workflow's spec validation happens upstream of
// the wait; this is the wait's own gate, enforcing the boundaries only the
// interpreter can see).
// =============================================================================

/**
 * A wait setup the interpreter refuses before any I/O: a resolved startup
 * timeout or poll interval that is not a positive integer, or strategy data
 * the wait union's plain-number fields admit but no probe can sensibly run
 * against (`ForHttp.port` outside 1–65535, `ForHttp.status` outside
 * 100–599, a non-compiling `ForLogMessage.pattern`, a negative
 * `ForLogMessage.count`, an empty `ForShell.command`).
 */
export class InvalidWaitStrategyError extends S.TaggedError<InvalidWaitStrategyError>()('InvalidWaitStrategyError', {
  message: S.String,
}) {}

/** The resolved wait budget: positive deadline and poll interval. */
export interface WaitSetup {
  /** The strategy being interpreted. */
  readonly strategy: WaitStrategy
  /** The resolved startup deadline (spec `startupTimeoutMs`, an options override, or `DEFAULT_STARTUP_TIMEOUT_MS`). */
  readonly startupTimeoutMs: number
  /** The resolved poll interval (options override or `DEFAULT_POLL_INTERVAL_MS`). */
  readonly pollIntervalMs: number
}

const isPositiveInteger = (value: number): boolean => Number.isInteger(value) && value > 0

const isValidPort = (value: number): boolean => Number.isInteger(value) && value >= 1 && value <= 65535

const isValidStatus = (value: number): boolean => Number.isInteger(value) && value >= 100 && value <= 599

/** Count 0 is meaningful — instantly ready (see `isTriviallyReady`) — so the lower bound is inclusive. */
const isValidCount = (value: number): boolean => Number.isInteger(value) && value >= 0

const compilesAsRegExp = (pattern: string): boolean => {
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

const refuse = (message: string): Result.Result<true, InvalidWaitStrategyError> =>
  Result.fail(InvalidWaitStrategyError.make({ message }))

/** The success arm every validation branch returns — one uniform type across the Match, so exhaustiveness resolves cleanly. */
const ok = (): Result.Result<true, InvalidWaitStrategyError> => Result.succeed(true)

/**
 * Validates the resolved wait setup — budget first (a deadline that cannot
 * be waited on poisons every strategy), then the strategy's own probe data.
 * Pure: the interpreter runs this once before its first probe.
 */
export const validateWaitSetup = (setup: WaitSetup): Result.Result<true, InvalidWaitStrategyError> => {
  if (!isPositiveInteger(setup.pollIntervalMs)) {
    return refuse(`poll interval must be a positive integer of milliseconds, got ${setup.pollIntervalMs}`)
  }
  if (!isPositiveInteger(setup.startupTimeoutMs)) {
    return refuse(`startup timeout must be a positive integer of milliseconds, got ${setup.startupTimeoutMs}`)
  }
  return Match.exhaustive(
    Match.value(setup.strategy).pipe(
      Match.tag('ForPort', ok),
      Match.tag('ForHealthCheck', ok),
      Match.tag('ForHttp', (strategy) => {
        if (strategy.port !== undefined && !isValidPort(strategy.port)) {
          return refuse(`ForHttp.port must be an integer in 1–65535, got ${strategy.port}`)
        }
        if (strategy.status !== undefined && !isValidStatus(strategy.status)) {
          return refuse(`ForHttp.status must be an HTTP status code in 100–599, got ${strategy.status}`)
        }
        return ok()
      }),
      Match.tag('ForLogMessage', (strategy) => {
        if (strategy.count !== undefined && !isValidCount(strategy.count)) {
          return refuse(`ForLogMessage.count must be a non-negative integer, got ${strategy.count}`)
        }
        if (!compilesAsRegExp(strategy.pattern)) {
          return refuse(`ForLogMessage.pattern is not a valid regular expression: ${strategy.pattern}`)
        }
        return ok()
      }),
      Match.tag('ForShell', (strategy) => {
        if (strategy.command.trim() === '') {
          return refuse('ForShell.command must be a non-empty command')
        }
        return ok()
      }),
    ),
  )
}
