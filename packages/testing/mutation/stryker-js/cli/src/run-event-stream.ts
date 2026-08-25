import * as Cause from 'effect/Cause'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Queue from 'effect/Queue'
import * as Stdio from 'effect/Stdio'
import * as Stream from 'effect/Stream'

import {
  generateRunId,
  type ModeSignal,
  type OutputMode,
  type ResolvedMode,
  type RunEvent,
  type RunEventSink,
} from '@systemfsoftware/stryker-js-mutation-run'

import { STREAM_SCHEMA_VERSION, TICK_INTERVAL_MS } from './stream-protocol.js'

/**
 * The host side of the run-event sink (U13): the port whose live layer turns
 * core's typed events into the machine-mode NDJSON stream on stdout.
 *
 * The wire contract is unchanged from the writer this replaces: the `stream`
 * header opens a run, `phase`/`plan`/`mutant` lines follow, `tick` keeps a
 * long phase from looking hung, and exactly one terminal line
 * (`verdict`/`error`/`help`/`manifest`) closes it. The stream lives on fd 1
 * and nowhere else — stderr in machine mode carries only discardable logs —
 * so a harness merging the two descriptors with `2>&1` still gets one
 * parseable NDJSON stream.
 *
 * The machinery differs: core pushes events into an unbounded mailbox via a
 * synchronous sink; a time-driven tick stream is merged in inside the Effect
 * fiber (R28); every line drains through a stdout write that waits on the
 * writable's callback (backpressure) and on `'finish'` at the end (R30). The
 * CLI composition root forks the drain before the run, resolves mode once at
 * the edge, and writes the terminal line from an `onExit` finalizer so it
 * lands on success, failure and interruption alike.
 */
// The interface is the type consumers index into
// (`RunEventStreamPort['createRunEventStream']`), the Tag class the value the
// layers are built on — one exported name for both.
export interface RunEventStreamPort {
  readonly createRunEventStream: (resolved: ResolvedMode) => Effect.Effect<RunEventStream, never, never>
}

class RunEventStreamPortTag extends Context.Service<RunEventStreamPortTag, RunEventStreamPort>()(
  '@systemfsoftware/stryker-js-cli/run-event-stream/RunEventStreamPortTag',
) {}

const RunEventStreamPort = RunEventStreamPortTag

export { RunEventStreamPort }

const isTerminalEvent = (event: RunEvent): boolean =>
  event.kind === 'verdict' || event.kind === 'error' || event.kind === 'help' || event.kind === 'manifest'

/** The synchronous push side the run-event sink adapts to `Stream.callback`. */
interface Emit {
  readonly single: (event: RunEvent) => void
  readonly end: () => void
}

/**
 * The push adapter from the run's synchronous sink to the callback mailbox.
 * `Queue.offer`/`Queue.end` on an unbounded queue never block or fail, so the
 * sync sink can drive them with `Effect.runSyncWith(ctx)` using the context
 * captured where the sink is constructed. Takes the queue and the captured
 * context, keeping the adapter pure with respect to its environment.
 */
function queueEmit(
  queue: Queue.Queue<RunEvent, Cause.Done<void>>,
  ctx: Context.Context<never>,
): Emit {
  return {
    single: (event) => {
      Effect.runSyncWith(ctx)(Queue.offer(queue, event))
    },
    end: () => {
      Effect.runSyncWith(ctx)(Queue.end(queue))
    },
  }
}

/**
 * The drain writes the framed lines through the platform's `Stdio` stdout
 * sink — `NodeStdio.layer` at the composition root supplies the service, and
 * the sink owns the writable's backpressure, the scoped `'error'` listener a
 * closed consumer raises, and the final `'finish'` wait (`endOnDone`). A
 * write failure surfaces as a `PlatformError` which this catch swallows — a
 * consumer closing the pipe must not replace the run's classed exit code
 * (R31) — and the drain still completes only after every byte was handed to
 * the OS (R30).
 */
const drainOf = (stdio: Stdio.Stdio, framed: Stream.Stream<string>): Effect.Effect<void, never, never> =>
  Stream.run(framed, stdio.stdout({ endOnDone: true })).pipe(Effect.ignore)

/**
 * The handle a run's host (the CLI composition root) holds: the sink core
 * pushes into, the identity the header and verdict share, the run's clock
 * zero, and the controls to open, inspect and close the stream.
 */
export interface RunEventStream {
  /** The sink core receives through the run event sink. */
  readonly sink: RunEventSink
  /**
   * The id the `stream` header and the `verdict` envelope share, minted when
   * the stream is created so the two can never disagree (KTD11). The `error`
   * envelope does not carry it: a failed run's terminal line reports the
   * classed code and its remediation, not the run's identity.
   */
  readonly runId: string
  /**
   * When the stream was created — the run's clock zero for `phase` and
   * `tick` elapsed times.
   */
  readonly startedAt: number
  /**
   * Whether the stream is live: consuming (machine mode) and not ended —
   * either by a terminal line or by dying to a consumer that closed the
   * pipe.
   */
  readonly isOpen: () => boolean
  /**
   * Forces the stream open as machine mode (the `--llms` path requests the
   * machine contract past a human-mode bootstrap). Idempotent: once the
   * header has been written the resolved mode is fixed for the run.
   */
  readonly ensureOpen: (resolved: ResolvedMode) => void
  /**
   * Starts the drain: the stream is consumed into stdout from here on. The
   * register runs synchronously inside the fork, so once this effect returns
   * the sink is bound and every later push is captured in order. Idempotent.
   */
  readonly open: Effect.Effect<void, never, never>
  /**
   * Ends the stream (no line is written after this) and waits for every
   * buffered line to reach stdout and for `'finish'` to fire (R30).
   * Idempotent, and safe when the stream already died to a closed pipe.
   */
  readonly closeAndDrain: Effect.Effect<void, never, never>
}

/**
 * Creates a run's stream. The drain is an Effect the composition root forks
 * before the run; until then the sink is unbound and every push is dropped,
 * which is what makes human mode — or an absent drain — inert without
 * per-call probing (R2). The run's clock zero is read from the runtime so
 * the adapter never touches the wall clock directly.
 */
const makeRunEventStream = (
  stdio: Stdio.Stdio,
  resolved: ResolvedMode,
): Effect.Effect<RunEventStream, never, never> =>
  Effect.gen(function*() {
    const runId = generateRunId()
    const startedAt = yield* Clock.currentTimeMillis
    const ctx = yield* Effect.context<never>()
    // The stream's live state. Shared between core's push path and the drain
    // fiber by design — single-threaded JS makes the cells safe, and the
    // module-state implementation this replaces worked the same way.
    const state: {
      mode: OutputMode
      signal: ModeSignal
      emit: Emit | null
      headerWritten: boolean
      terminalWritten: boolean
      progress: { completed: number; total: number | null }
    } = {
      mode: resolved.mode,
      signal: resolved.signal,
      emit: null,
      headerWritten: false,
      terminalWritten: false,
      progress: { completed: 0, total: null },
    }

    // The mailbox the run's synchronous sink pushes into. `Stream.callback`
    // builds an unbounded queue by default — the same unbounded choice
    // `Stream.asyncPush` made before it, and the property the mailbox relies
    // on: a mutation run emits per-mutant events from promise code that
    // cannot suspend, so a bounded mailbox would stall core's reporter the
    // moment the bound is reached. The choice is stated here rather than
    // inherited from a default.
    // Registration gate: the detached drain binds `state.emit` inside its own
    // first step, and `open` must not return before that binding exists — a
    // fast run (version, help) can reach `closeAndDrain` first, where
    // `state.emit?.end()` on an unbound mailbox drops the end signal and the
    // join below hangs forever on the never-ending merge.
    const registered = yield* Deferred.make<void>()
    const eventStream = Stream.callback<RunEvent>(
      (queue) =>
        Effect.sync(() => {
          state.emit = queueEmit(queue, ctx)
        }).pipe(Effect.andThen(Deferred.succeed(registered, undefined))),
    )

    // The heartbeat, as a time-driven stream merged inside the fiber (R28).
    // Gated on the same conditions the old timer checked — the stream must be
    // open (machine mode, header written) and the terminal line not passed.
    const tickStream = Stream.tick(TICK_INTERVAL_MS).pipe(
      Stream.filter(() => state.mode === 'machine' && state.headerWritten && !state.terminalWritten),
      Stream.mapEffect((): Effect.Effect<RunEvent, never, never> =>
        Effect.gen(function*() {
          const now = yield* Clock.currentTimeMillis
          return {
            kind: 'tick' as const,
            elapsedMs: now - startedAt,
            completed: state.progress.completed,
            total: state.progress.total,
          }
        })
      ),
    )

    // haltStrategy: 'either' ends the merge when the event stream ends and
    // interrupts the tick fiber with it. The default is 'both', which would
    // keep the infinite heartbeat open forever and hang the run; mergeLeft is
    // equally wrong — it drains the tick with the same 'both' default.
    let terminalSeen = false
    const framed = Stream.merge(eventStream, tickStream, { haltStrategy: 'either' }).pipe(
      // Nothing may reach the wire after the terminal line. The mailbox closes
      // on the terminal event, but a tick already emitted by the merge can race
      // its teardown, so the drop happens here — at the element level, before
      // framing — where a dropped event cannot leave a stray newline behind.
      Stream.filter((event) => {
        if (terminalSeen) {
          return false
        }
        if (isTerminalEvent(event)) {
          terminalSeen = true
        }
        return true
      }),
      // Each line carries its own terminator. The plan suggested
      // Stream.intersperse("\n"), but that leaves the last line unterminated —
      // the writer this replaced terminated every line, so a byte-level
      // consumer (wc -l, a NDJSON reader at EOF) would observe the difference.
      Stream.map((event) => `${JSON.stringify(event)}\n`),
    )

    const drain: Effect.Effect<void, never, never> = drainOf(stdio, framed)

    let drainFiber: Fiber.Fiber<void, never> | null = null

    const sink: RunEventSink = (event) => {
      const emit = state.emit
      if (emit === null || state.terminalWritten || state.mode !== 'machine') {
        return
      }

      if (!state.headerWritten) {
        state.headerWritten = true
        emit.single({
          kind: 'stream',
          schemaVersion: STREAM_SCHEMA_VERSION,
          runId,
          mode: state.mode,
          signal: state.signal,
        })
      }
      switch (event.kind) {
        case 'stream':
        case 'tick':
          // Host-produced: the header is written above, the tick by the merged
          // timer stream. Core never pushes either.
          return
        case 'phase':
          // R18: a phase boundary carries no progress and is not terminal —
          // the single below writes it verbatim, like plan/mutant.
          break
        case 'plan':
          state.progress = { ...state.progress, total: event.total }
          break
        case 'mutant':
          // The completed/total counters ride on the event (U4); the heartbeat
          // reports the latest pair it has seen.
          state.progress = { completed: event.completed, total: event.total }
          break
        case 'verdict':
        case 'error':
        case 'help':
        case 'manifest':
          emit.single(event)
          state.terminalWritten = true
          emit.end()
          return
      }
      emit.single(event)
    }

    return {
      sink,
      runId,
      startedAt,
      isOpen: () => state.emit !== null && state.mode === 'machine' && !state.terminalWritten,
      ensureOpen: (openResolved: ResolvedMode): void => {
        if (state.headerWritten) {
          return
        }
        state.mode = openResolved.mode
        state.signal = openResolved.signal
      },
      open: Effect.gen(function*() {
        if (drainFiber === null) {
          // A detached fork, not a supervised one: when the run is interrupted
          // (SIGINT), the main fiber's scope would interrupt a supervised
          // child before the onExit finalizer runs — and the terminal line
          // pushed by that finalizer would never reach stdout. The detached
          // fiber survives the interrupt, so closeAndDrain can join it and
          // flush the terminal line (R30); it ends on its own once the
          // mailbox is done and drained.
          drainFiber = yield* Effect.forkDetach(drain)
          // Registration must complete before the run starts, or a fast run's
          // closeAndDrain races the mailbox binding and drops the end signal.
          // The race with the fiber's own await covers a drain that dies
          // before subscribing — open then resolves on the fiber's exit
          // instead of hanging on a Deferred nothing will ever complete.
          yield* Effect.race(
            Deferred.await(registered),
            Fiber.await(drainFiber),
          )
        }
      }),
      closeAndDrain: Effect.gen(function*() {
        state.terminalWritten = true
        state.emit?.end()
        if (drainFiber !== null) {
          yield* Fiber.join(drainFiber)
        }
      }),
    }
  })

export const RunEventStreamLive: Layer.Layer<RunEventStreamPortTag, never, Stdio.Stdio> = Layer.effect(
  RunEventStreamPort,
  Effect.map(Stdio.Stdio, (stdio) =>
    RunEventStreamPort.of({
      createRunEventStream: (resolved) => makeRunEventStream(stdio, resolved),
    })),
)
