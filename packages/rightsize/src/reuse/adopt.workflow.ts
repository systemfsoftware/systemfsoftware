/**
 * The reuse-adopt decision (R14) — the pre-I/O gate of reuse's adopt path,
 * authored at the `Workflow.make` boundary (KTD3, RS-BOUNDARY): recorded
 * facts in, a typed decision out, zero I/O anywhere in the workflow body.
 * The composing seam (`adopt.ts`) distills everything this decides —
 * including the double-opt-in verdict — before invoking it.
 *
 * The rejection order mirrors upstream `GenericContainer.start()`'s reuse
 * branch at the fork point: the reuse marker + `RIGHTSIZE_REUSE` gate is
 * the FIRST check (missing either half → no adoption, ordinary ephemeral
 * launch behavior), then the network/checkpoint incompatibilities a reuse
 * container can never carry (`ReuseWithNetworkError` /
 * `ReuseFromCheckpointError` — reuse's identity hash never covers network
 * topology or a checkpoint ref). The launch workflow runs the same gates
 * pre-I/O for a full launch; this decision carries them so the seam is
 * also correct as a standalone surface.
 *
 * The registry/backend cases implement the reuse start-flow state table:
 * - entry found + running → `Adopt` (live adoption — the executor binds
 *   the running container and exempts it from teardown);
 * - entry found + not running → `Cleanup` (stale entry AND stale sandbox:
 *   best-effort remove both, then create fresh);
 * - entry corrupt → `Cleanup` (a corrupt entry proves the identity once
 *   existed — the deterministic name can be removed, then fresh);
 * - entry missing + running → `Cleanup` (the crash-mid-boot orphan guard:
 *   a running sandbox under the exact deterministic name with no registry
 *   entry is a crashed creator's leftover — remove it before a fresh
 *   create races it);
 * - entry missing + nothing running → `Fresh` (the common first-run case:
 *   nothing to clean, create fresh).
 *
 * The decision variants carry the identity facts they write against (`name`,
 * `cacheDir`, `hash`) — the write phase must clean the stale sandbox/entry
 * without re-gathering them.
 */
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result } from 'effect'

import { ReuseFromCheckpointError, ReuseWithNetworkError } from '../model/errors.js'
import type { SandboxHandle } from '../runtime/runtime.js'
import type { RegistryReadResult } from './registry.js'

// ========================= decisions =========================

/** The closed decision space of the reuse-adopt workflow. */
export type ReuseAdoptDecision =
  | { readonly _tag: 'Ignored' }
  | { readonly _tag: 'Adopt'; readonly handle: SandboxHandle; readonly cacheDir: string; readonly hash: string }
  | {
    readonly _tag: 'Cleanup'
    readonly name: string
    readonly cacheDir: string
    readonly hash: string
    readonly removeByName: boolean
    readonly removeRegistry: boolean
  }
  | { readonly _tag: 'Fresh' }

// ========================= command =========================

/**
 * The recorded facts the adopt decision runs on — everything the seam
 * gathered, nothing else. The identity fields (`name`/`cacheDir`/`hash`)
 * are present always; the gated (non-opt-in or incompatible) read fills
 * them with empty strings the decision never reads.
 */
export type ReuseAdoptCommand = {
  readonly _tag: 'DecideReuseAdopt'
  /** `true` when the spec carries the `withReuse` marker AND `RIGHTSIZE_REUSE` is enabled — the double opt-in. */
  readonly reuseOptIn: boolean
  /** The final spec's network id — `undefined` when no network join was requested. */
  readonly networkId: string | undefined
  /** The final spec's checkpoint ref — `undefined` for every ordinary container. */
  readonly checkpointRef: string | undefined
  /** The stated registry read — `undefined` only when the opt-in/compat gates short-circuited the read. */
  readonly registry: RegistryReadResult | undefined
  /** The backend's answer to "is the deterministic reuse name running". */
  readonly running: SandboxHandle | undefined
  /** The deterministic reuse name (`rz-reuse-<hash12>`). */
  readonly name: string
  /** The cache dir the registry lives under. */
  readonly cacheDir: string
  /** The reuse identity hash (the registry key). */
  readonly hash: string
}

// ========================= kernels =========================

/** The registry-state table — decided only after the opt-in and compat gates passed. */
const registryAdopt = (
  command: Extract<ReuseAdoptCommand, { readonly _tag: 'DecideReuseAdopt' }>,
  registry: RegistryReadResult,
): ReuseAdoptDecision => {
  const { running, name, cacheDir, hash } = command
  if (registry.kind === 'found' && running !== undefined) {
    return { _tag: 'Adopt', handle: running, cacheDir, hash }
  }
  if (registry.kind === 'found' || registry.kind === 'corrupt') {
    return { _tag: 'Cleanup', name, cacheDir, hash, removeByName: true, removeRegistry: true }
  }
  return running === undefined
    ? { _tag: 'Fresh' }
    : { _tag: 'Cleanup', name, cacheDir, hash, removeByName: true, removeRegistry: false }
}

/** The full decision pipeline — opt-in gate, compat gates, then the state table. */
const dispatchReuseAdopt = (
  command: Extract<ReuseAdoptCommand, { readonly _tag: 'DecideReuseAdopt' }>,
): Result.Result<ReuseAdoptDecision, ReuseWithNetworkError | ReuseFromCheckpointError> => {
  if (!command.reuseOptIn) {
    return Result.succeed({ _tag: 'Ignored' })
  }
  if (command.networkId !== undefined) {
    return Result.fail(ReuseWithNetworkError.make())
  }
  if (command.checkpointRef !== undefined) {
    return Result.fail(ReuseFromCheckpointError.make())
  }
  return command.registry === undefined
    ? Result.succeed({ _tag: 'Ignored' })
    : Result.succeed(registryAdopt(command, command.registry))
}

/** The base dispatch — pure, in-file; the workflow body is this single exhaustive call. */
const dispatchAdopt = (
  command: ReuseAdoptCommand,
): Result.Result<ReuseAdoptDecision, ReuseWithNetworkError | ReuseFromCheckpointError> =>
  Match.exhaustive(
    Match.value(command).pipe(
      Match.tag('DecideReuseAdopt', (c) => dispatchReuseAdopt(c)),
    ),
  )

/**
 * The reuse-adopt decision, authored at the `Workflow.make` boundary. The
 * body is a single dispatch over the closed command union; the workflow
 * performs zero I/O — facts in, decision out.
 */
export const decideReuseAdopt = Workflow.make(
  (command: ReuseAdoptCommand): Result.Result<ReuseAdoptDecision, ReuseWithNetworkError | ReuseFromCheckpointError> =>
    dispatchAdopt(command),
)
