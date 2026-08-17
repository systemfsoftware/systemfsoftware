/**
 * Port-bind-conflict classification and retry accounting (R7, F1,
 * KTD6). Host ports are pre-allocated before boot (R7's core invariant),
 * yet a pre-allocated port can still lose an allocate-then-bind race to an
 * unrelated process. When a create/start attempt fails, the composing
 * executor feeds the raw failure plus the number of attempts already
 * consumed to this workflow, which decides one of three things:
 *
 * - `LaunchRetry` — the failure classifies as a host-port bind conflict
 *   (typed `PortBindConflictError`, or an `Error` whose message names the
 *   daemon's conflict wording, walking the cause chain exactly as
 *   upstream's `isPortBindConflict` does) and the bounded budget allows
 *   another attempt: the executor releases the failed attempt's ports,
 *   re-allocates fresh ones, and tries again (R7, ≤5);
 * - `LaunchPropagate` — the failure is NOT a port conflict: it is terminal
 *   and the original error travels back untouched;
 * - error channel `ContainerLaunchError` — every attempt within the
 *   budget was a port conflict and the budget is spent: the launch gives
 *   up with upstream's stranded-ports message (R7: ports release on every
 *   failure path — the executor releases before this surfaces).
 *
 * The classifier (`classifyBindFailure`) is the pure normalization of the
 * typed/string split: typed `PortBindConflictError` instances pass
 * through, message-shaped conflicts ("address already in use",
 * "already allocated") are normalized to the tagged error, and everything
 * else is not a conflict. Nothing here performs I/O — a raw failure
 * record in, a typed decision out.
 */
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result } from 'effect'
import * as S from 'effect/Schema'

import { ContainerLaunchError, PortBindConflictError } from '../model/errors.js'

// ========================= budget =========================

/** The launch attempt budget — upstream's `MAX_START_ATTEMPTS` (5). */
export const MAX_LAUNCH_ATTEMPTS = 5

// ========================= decisions =========================

/** The failure was a port conflict and the budget allows another attempt. */
export class LaunchRetry extends S.TaggedClass<LaunchRetry>()('Retry', {
  /** The 1-based number of the next create/start attempt the executor runs, with fresh ports. */
  nextAttempt: S.Int,
}) {}

/** The failure was not a port conflict — terminal; the original error is carried for rethrow. */
export class LaunchPropagate extends S.TaggedClass<LaunchPropagate>()('Propagate', {
  /** The unclassified failure exactly as the backend produced it. */
  cause: S.optional(S.Unknown),
}) {}

/** The closed decision space of the port-conflict workflow. */
export type PortConflictDecision = LaunchRetry | LaunchPropagate

// ========================= command =========================

/**
 * The recorded facts the port-conflict decision runs on. `attemptsUsed` is
 * the count of create/start attempts already consumed and failed (1-based):
 * a conflict on attempt 1 retries as attempt 2, …, a conflict on attempt
 * `MAX_LAUNCH_ATTEMPTS` exhausts the budget.
 */
export type PortConflictCommand = {
  readonly _tag: 'ClassifyLaunchFailure'
  /** The image the failed launch was building — named in the exhausted-error message. */
  readonly image: string
  /** The raw create/start failure exactly as the backend surfaced it. */
  readonly error: unknown
  /** How many create/start attempts have already failed for this launch. */
  readonly attemptsUsed: number
}

// ========================= classifier =========================

/** The cause-chain walk's depth budget — cycle safe, bounds a pathological chain. */
const MAX_CAUSE_DEPTH = 8

/**
 * Classifies a raw backend failure as a host-port bind conflict, walking
 * the cause chain exactly as upstream's `isPortBindConflict`: a typed
 * `PortBindConflictError` anywhere in the chain, or an `Error` whose
 * (lowercased) message names the daemon's conflict wording ("address
 * already in use", "already allocated"). Returns the typed conflict — the
 * original instance when it already is one, else a normalized tagged error
 * carrying the matching message and cause — or `undefined` when the
 * failure is not a port conflict. Pure: records in, records out, cycle-safe
 * via the fixed depth budget.
 */
export const classifyBindFailure = (error: unknown): PortBindConflictError | undefined => {
  const classify = (node: unknown, depth: number): PortBindConflictError | undefined => {
    if (node === undefined || node === null || depth > MAX_CAUSE_DEPTH) {
      return undefined
    }
    if (S.is(PortBindConflictError)(node)) {
      return node
    }
    if (node instanceof Error) {
      const message = node.message.toLowerCase()
      if (message.includes('address already in use') || message.includes('already allocated')) {
        return PortBindConflictError.make({ message: node.message, cause: node })
      }
      return classify(node.cause, depth + 1)
    }
    return undefined
  }
  return classify(error, 0)
}

// ========================= kernels =========================

/** The exhaustive decision over the classified failure + the attempts budget. */
const dispatchLaunchFailure = (
  command: PortConflictCommand,
): Result.Result<PortConflictDecision, ContainerLaunchError> => {
  if (classifyBindFailure(command.error) === undefined) {
    return Result.succeed(LaunchPropagate.make({ cause: command.error }))
  }
  if (command.attemptsUsed < MAX_LAUNCH_ATTEMPTS) {
    return Result.succeed(LaunchRetry.make({ nextAttempt: command.attemptsUsed + 1 }))
  }
  return Result.fail(
    ContainerLaunchError.make({
      message: `Failed to start '${command.image}' after ${MAX_LAUNCH_ATTEMPTS} attempts: ` +
        `every attempt hit a host port already in use by another process.`,
    }),
  )
}

/** The base dispatch — pure, in-file; the workflow body is this single exhaustive call. */
const dispatchPortConflict = (
  command: PortConflictCommand,
): Result.Result<PortConflictDecision, ContainerLaunchError> =>
  Match.exhaustive(
    Match.value(command).pipe(
      Match.tag('ClassifyLaunchFailure', (c) => dispatchLaunchFailure(c)),
    ),
  )

/**
 * The port-conflict decision, authored at the `Workflow.make` boundary
 * (KTD3). The body is a single dispatch over the closed command union; the
 * workflow performs zero I/O — a pure classification of a recorded failure
 * against a bounded retry budget (R7).
 */
export const decidePortConflict = Workflow.make(
  (command: PortConflictCommand): Result.Result<PortConflictDecision, ContainerLaunchError> =>
    dispatchPortConflict(command),
)
