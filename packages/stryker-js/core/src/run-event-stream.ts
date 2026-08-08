import { writeSync } from 'node:fs'

import type { ResolvedMode } from './output-mode.js'
import { generateRunId } from './reporters/verdict-envelope.js'
import type { RunEventSink } from './run-event.js'

/**
 * The host side of the run-event sink (U4): the machinery that turns core's
 * typed events into the machine-mode NDJSON stream on stdout. Everything the
 * module this replaces did — the fd-1 `writeSync` path, the EPIPE swallow,
 * the one-terminal-line rule, the unref'd heartbeat, the mode gate, the
 * run-id memo — lives here now, behind a factory instead of module state,
 * so the composition root (`stryker-cli.ts`) owns one stream object per
 * run.
 *
 * The wire contract is unchanged: the `stream` header opens a run, `phase`/
 * `plan`/`mutant` lines follow, `tick` keeps a long phase from looking hung,
 * and exactly one terminal line (`verdict`/`error`/`help`/`manifest`) closes
 * it. The stream lives on fd 1 and nowhere else — stderr in machine mode
 * carries only discardable logs — so a harness merging the two descriptors
 * with `2>&1` still gets one parseable NDJSON stream.
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

/**
 * The handle a run's host (the CLI composition root) holds: the sink core
 * pushes into, the identity the header and verdict share, the run's clock
 * zero, and the controls to open, inspect and close the stream.
 */
export interface RunEventStream {
  /** The sink core receives through `coreTokens.runEventSink`. */
  readonly sink: RunEventSink
  /**
   * The one id every stream line and the verdict envelope carry, minted when
   * the stream is created, so the header and the terminal line can never
   * disagree (KTD11).
   */
  readonly runId: string
  /**
   * When the stream was created — the run's clock zero for `phase` and
   * `tick` elapsed times.
   */
  readonly startedAt: number
  /**
   * Whether the stream is live: opened (machine mode) and not ended — either
   * by a terminal line or by dying to a consumer that closed the pipe.
   */
  readonly isOpen: () => boolean
  /**
   * Opens the stream if it is not open yet. Idempotent, and a no-op outside
   * machine mode, so the `--llms` path can force machine mode past the
   * bootstrap's resolved mode.
   */
  readonly ensureOpen: (resolved: ResolvedMode) => void
  /** Stops the heartbeat. Idempotent. */
  readonly stop: () => void
}

/**
 * Creates a run's stream. In machine mode the header is written and the
 * heartbeat started immediately; in human mode the stream stays closed and
 * every event is dropped, which is what makes human mode inert without
 * per-call probing.
 */
export function createRunEventStream(resolved: ResolvedMode): RunEventStream {
  const runId = generateRunId()
  const startedAt = Date.now()
  let config: { readonly startedAt: number } | null = null
  // The counts the heartbeat reports; `total` stays null until the plan lands.
  let progress: { completed: number; total: number | null } = { completed: 0, total: null }
  let heartbeat: NodeJS.Timeout | null = null
  // Set the moment the terminal line is written, or the moment the stream
  // dies because a consumer closed the pipe; after either, no further line
  // is attempted and a second terminal line is refused.
  let terminalWritten = false

  const stopHeartbeat = (): void => {
    if (heartbeat === null) {
      return
    }
    clearInterval(heartbeat)
    heartbeat = null
  }

  /**
   * The single write path: one synchronous `writeSync` to fd 1 with a
   * trailing newline. Never `process.stdout.write` — async pipe writes are
   * dropped by `process.exit` (KTD11). Refuses anything after the terminal
   * line, which is what guarantees "the last stdout line is always the
   * terminal event".
   *
   * A consumer that closes the pipe early (`stryker run | head -5`) makes
   * the write throw EPIPE — from the unref'd heartbeat timer, outside the
   * Effect fiber, so nothing would catch it and the run would die with exit
   * code 1, replacing its classed exit code. Any failure here means the
   * descriptor is gone (EPIPE, EBADF, ERR_STREAM_DESTROYED), so the error is
   * swallowed: the heartbeat stops, the stream is marked permanently dead so
   * no later line is attempted, and the run survives on its durable
   * artifact, the report file.
   */
  const writeLine = (line: unknown): void => {
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

  const emitTick = (): void => {
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

  const open = (openResolved: ResolvedMode): void => {
    if (config !== null || openResolved.mode !== 'machine') {
      return
    }
    config = { startedAt }
    writeLine({
      kind: 'stream',
      schemaVersion: STREAM_SCHEMA_VERSION,
      runId,
      mode: openResolved.mode,
      signal: openResolved.signal,
    })
    if (!terminalWritten) {
      heartbeat = setInterval(emitTick, TICK_INTERVAL_MS)
      // unref: the heartbeat must never hold the process open past a finished run.
      heartbeat.unref()
    }
  }

  const sink: RunEventSink = (event) => {
    if (config === null || terminalWritten) {
      return
    }
    switch (event.kind) {
      case 'phase':
        writeLine({
          kind: 'phase',
          phase: event.phase,
          elapsedMs: Date.now() - config.startedAt,
        })
        break
      case 'plan':
        progress = { ...progress, total: event.total }
        writeLine({ kind: 'plan', total: event.total })
        break
      case 'mutant':
        // The completed/total counters ride on the event (U4): the progress
        // reporter counts every tested mutant, and the heartbeat reports the
        // latest pair it has seen.
        progress = { completed: event.completed, total: event.total }
        writeLine(event)
        break
      case 'verdict':
      case 'error':
      case 'help':
      case 'manifest':
        stopHeartbeat()
        writeLine(event)
        terminalWritten = true
        break
      case 'stream':
      case 'tick':
        // Host-produced: the header is written by `open`, the tick by the
        // heartbeat timer. Core never pushes either.
        break
    }
  }

  open(resolved)

  return {
    sink,
    runId,
    startedAt,
    isOpen: () => config !== null && !terminalWritten,
    ensureOpen: open,
    stop: stopHeartbeat,
  }
}
