import type { MutantStatus, schema } from '@stryker-mutator/api/core'

import type { ModeSignal, OutputMode } from './output-mode.js'
import type { VerdictEnvelope } from './reporters/verdict-envelope.js'

/**
 * What a run emits, as a closed vocabulary (R1, R2, R35).
 *
 * Declaration only. Core pushes these into a sink it receives through
 * `coreTokens.runEventSink`; how they reach a descriptor — NDJSON framing,
 * ordering, the terminal-once guarantee, the drain — belongs to whoever
 * binds the sink, not here. The `kind` tags are the wire contract and are
 * fixed: a consumer parses on them, so they may be added to but never
 * renamed.
 */

/**
 * The lifecycle phases of a run (R18), in the order the executor chain emits
 * them. `prepare` is the first observable moment of the run.
 */
export type RunPhase = 'prepare' | 'instrument' | 'dry-run' | 'mutation-test'

/**
 * Opens the run (R5, R21): carries the stream schema version, the run id
 * shared with the verdict envelope, and the resolved mode plus the signal
 * that decided it.
 */
export interface RunStarted {
  readonly kind: 'stream'
  readonly schemaVersion: string
  readonly runId: string
  readonly mode: OutputMode
  readonly signal: ModeSignal
}

/**
 * A lifecycle phase boundary (R18). `elapsedMs` is time since the run began.
 */
export interface PhaseEntered {
  readonly kind: 'phase'
  readonly phase: RunPhase
  readonly elapsedMs: number
}

/**
 * The mutant-testing plan (R17): emitted once the plan is known, before any
 * mutant is tested. Names the total a consumer can count `mutant` events
 * against.
 */
export interface PlanKnown {
  readonly kind: 'plan'
  readonly total: number
}

/**
 * One tested mutant that passed the R20 actionable filter. Carries the full
 * survivor re-run matching key — file, location, mutator, replacement — so a
 * consumer can address the mutant without opening the report file (R11).
 */
export interface MutantTested {
  readonly kind: 'mutant'
  readonly id: string
  readonly status: MutantStatus
  readonly file: string
  readonly location: schema.Location
  readonly mutator: string
  readonly replacement: string | null
  readonly completed: number
  readonly total: number
}

/**
 * The heartbeat (R19), emitted on the tick interval while a phase is in
 * flight, so a long phase never looks hung. `total` is `null` until the plan
 * is known — a pre-plan `0` would read as a finished run of zero mutants.
 */
export interface Heartbeat {
  readonly kind: 'tick'
  readonly elapsedMs: number
  readonly completed: number
  readonly total: number | null
}

export type VerdictReached = VerdictEnvelope & { readonly kind: 'verdict' }

/**
 * The run did not reach a verdict (R7). `code` is the classed exit code (R6).
 * Terminal.
 */
export interface RunFailed {
  readonly kind: 'error'
  readonly schemaVersion: string
  readonly code: number
  readonly error: string
  readonly remediation: string
}

/**
 * A `--help` invocation closed with the rendered usage text, so an agent that
 * reads the last stdout line still gets a tagged event. Terminal.
 */
export interface HelpRendered {
  readonly kind: 'help'
  readonly schemaVersion: string
  readonly code: 0
  readonly help: string
}

/**
 * A `--llms` invocation closed with the rendered manifest (R9). Terminal.
 */
export interface ManifestRendered {
  readonly kind: 'manifest'
  readonly schemaVersion: string
  readonly code: 0
  readonly manifest: string
}

/**
 * Exactly one of these ends a run (R5): a score, a failure, or a rendered
 * document closing a non-run command.
 */
export type RunTerminalEvent = VerdictReached | RunFailed | HelpRendered | ManifestRendered

export type RunEvent =
  | RunStarted
  | PhaseEntered
  | PlanKnown
  | MutantTested
  | Heartbeat
  | RunTerminalEvent

/**
 * Where a run's events go. Synchronous by contract: core pushes from promise
 * code that cannot suspend, and the callback must never reject.
 */
export type RunEventSink = (event: RunEvent) => void
