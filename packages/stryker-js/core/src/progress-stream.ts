import { writeSync } from 'node:fs'

import type { ResolvedMode } from './output-mode.js'
import { generateRunId, isActionableStatus } from './reporters/verdict-envelope.js'
import type { MutantTested, RunPhase, RunTerminalEvent } from './run-event.js'

/**
 * U7 — the machine-mode progress stream on stdout (R17, R19, R20, R21).
 *
 * The single choke point every machine-mode line passes through: the `stream`
 * header, the lifecycle `phase` lines (R18), the `plan` and `mutant` events,
 * the `tick` heartbeat (R19), and the single terminal `verdict` or `error`
 * line (R5, R7). The stream lives on fd 1 and nowhere else — stderr in
 * machine mode carries only discardable logs — so a harness merging the two
 * descriptors with `2>&1` still gets one parseable NDJSON stream.
 *
 * Module-level state is the point. This module owns every policy a caller
 * could get wrong: the mode gate (human mode leaves the module unconfigured,
 * so every entry point is inert), the synchronous write path (KTD11 — an
 * async pipe write is dropped by `process.exit`), the run id (one id for the
 * whole run, shared with the verdict envelope, so the header and the terminal
 * line can never disagree), the heartbeat timer, and the one-terminal-line
 * invariant (U6). The executor chain (U13) and the progress reporter both
 * call into this module instead of writing their own lines.
 */

/**
 * The stream schema version (R21), carried by the header and the error
 * terminal event. Independent of the report schema version: consumers ignore
 * unknown `kind` values and unknown fields, so a new event type is an
 * additive change.
 */
export const STREAM_SCHEMA_VERSION = '1.0'

/**
 * The heartbeat interval (R19), matching Terraform's `apply_progress`
 * cadence: long enough that a slow phase is not noisy, short enough that a
 * consumer can tell "slow" from "hung" without waiting for a mutant event.
 */
export const TICK_INTERVAL_MS = 10_000

/**
 * The literal stdout descriptor. Written to directly rather than through
 * `process.stdout.fd`, which is `undefined` whenever the stream is not backed
 * by a real descriptor — most notably on a worker thread (the same reasoning
 * as the envelope writer in `stryker-cli.ts`).
 */
const STDOUT_FD = 1

interface StreamConfig {
  readonly startedAt: number
}

/**
 * The module state. `null` until `configureStream` runs in machine mode;
 * every entry point is a no-op while it is null, which is what makes human
 * mode inert without per-call probing.
 */
let config: StreamConfig | null = null

/** The counts the heartbeat reports; `total` stays null until the plan lands. */
let progress: { completed: number; total: number | null } = { completed: 0, total: null }

/** The heartbeat timer; cleared by `emitTerminal` and `resetStream`. */
let heartbeat: NodeJS.Timeout | null = null

/**
 * Set the moment the terminal line is written, or the moment the stream dies
 * because a consumer closed the pipe; after either, no further line is
 * attempted and a second terminal line is refused.
 */
let terminalWritten = false

/** Seeded by `configureStream`, else minted on first read. */
let runId: string | null = null

/**
 * The single write path: one synchronous `writeSync` to fd 1 with a trailing
 * newline. Never `process.stdout.write` — async pipe writes are dropped by
 * `process.exit` (KTD11). Refuses anything after the terminal line, which is
 * what guarantees "the last stdout line is always the terminal event".
 *
 * A consumer that closes the pipe early (`stryker run | head -5`) makes the
 * write throw EPIPE — from the unref'd heartbeat timer, outside the Effect
 * fiber, so nothing would catch it and the run would die with exit code 1,
 * replacing its classed exit code. Any failure here means the descriptor is
 * gone (EPIPE, EBADF, ERR_STREAM_DESTROYED), so the error is swallowed: the
 * heartbeat stops, the stream is marked permanently dead so no later line is
 * attempted, and the run survives on its durable artifact, the report file.
 */
function writeLine(line: unknown): void {
  if (terminalWritten) {
    return
  }
  try {
    writeSync(STDOUT_FD, `${JSON.stringify(line)}\n`)
  } catch {
    stopHeartbeat()
    terminalWritten = true
  }
}

function emitTick(): void {
  if (config === null || terminalWritten) {
    return
  }
  writeLine({
    kind: 'tick',
    elapsedMs: Date.now() - config.startedAt,
    completed: progress.completed,
    total: progress.total,
  })
}

/**
 * Configures the stream for a run: stores the run id its caller supplies,
 * writes the `stream` header as the first line, and starts the `unref`'d
 * heartbeat. Idempotent per run — a second call neither re-writes the header
 * nor stacks a second heartbeat. In human mode the module never becomes
 * configured, so every entry point stays inert.
 */
export function configureStream(resolved: ResolvedMode, id: string = streamRunId()): void {
  runId ??= id
  if (config !== null || resolved.mode !== 'machine') {
    return
  }
  config = { startedAt: Date.now() }
  writeLine({
    kind: 'stream',
    schemaVersion: STREAM_SCHEMA_VERSION,
    runId,
    mode: resolved.mode,
    signal: resolved.signal,
  })
  if (!terminalWritten) {
    heartbeat = setInterval(emitTick, TICK_INTERVAL_MS)
    // unref: the heartbeat must never hold the process open past a finished run.
    heartbeat.unref()
  }
}

/**
 * The one id every stream line and the verdict envelope carry. Never throws:
 * the envelope is built by library code that never calls `configureStream`,
 * so identity must not depend on the stream being configured.
 */
export function streamRunId(): string {
  runId ??= generateRunId()
  return runId
}

/**
 * Whether the stream is live: the module was configured in machine mode and
 * the stream has not ended — either by a terminal line or by dying to a
 * consumer that closed the pipe.
 */
export function isStreamEnabled(): boolean {
  return config !== null && !terminalWritten
}

/**
 * A lifecycle phase boundary (R18). Emitted by the executor chain before each
 * stage runs, so a long run is never silent even before the plan exists.
 */
export function emitPhase(phase: RunPhase): void {
  if (config === null) {
    return
  }
  writeLine({ kind: 'phase', phase, elapsedMs: Date.now() - config.startedAt })
}

/**
 * The mutant-testing plan (R17): emitted once the plan is known. Also records
 * the total the heartbeat reports, so a tick before any mutant completes
 * still carries the planned total.
 */
export function emitPlan(total: number): void {
  if (config === null) {
    return
  }
  progress = { ...progress, total }
  writeLine({ kind: 'plan', total })
}

/**
 * One tested mutant (R17), filtered by the R20 actionable statuses — a
 * `Killed`, `Ignored`, or `CompileError` mutant emits nothing; it is a count
 * only. The filter is the shared definition from the verdict envelope, so the
 * `mutant` lines and the `verdict.mutants` list can never disagree.
 */
export function emitMutant(line: Omit<MutantTested, 'kind'>): void {
  if (config === null) {
    return
  }
  if (!isActionableStatus(line.status)) {
    return
  }
  writeLine({ kind: 'mutant', ...line })
}

/**
 * Records the completed/total counts for the heartbeat without emitting a
 * line. Called by the progress reporter per tested mutant.
 */
export function recordProgress(completed: number, total: number): void {
  if (config === null) {
    return
  }
  progress = { completed, total }
}

/**
 * Stops the heartbeat and writes the single terminal line — `verdict` for a
 * run that reached a score, `error` for a failure (R5, R7). Idempotent: the
 * first call wins and later calls are dropped, which is what makes "the last
 * stdout line is always the terminal event" an invariant rather than a
 * convention. No tick or other line can follow the terminal line.
 */
export function emitTerminal(line: RunTerminalEvent): void {
  if (config === null || terminalWritten) {
    return
  }
  stopHeartbeat()
  writeLine(line)
  terminalWritten = true
}

/**
 * Stops the heartbeat. Exported because a run can end without a stream
 * terminal line — `--help` writes its own document — and an unstopped timer
 * can land a `tick` after that last output.
 */
export function stopHeartbeat(): void {
  if (heartbeat === null) {
    return
  }
  clearInterval(heartbeat)
  heartbeat = null
}

/**
 * Test seam: stops the timer and clears all module state, so a fresh run can
 * configure the stream again. Not part of a run's normal lifecycle — a run
 * configures once.
 */
export function resetStream(): void {
  stopHeartbeat()
  config = null
  runId = null
  progress = { completed: 0, total: null }
  terminalWritten = false
}
