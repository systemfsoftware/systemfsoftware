import * as Chunk from 'effect/Chunk'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import * as Sink from 'effect/Sink'
import * as Stream from 'effect/Stream'
import type { EmitOpsPush } from 'effect/StreamEmit'

import type { ModeSignal, OutputMode, ResolvedMode } from '@systemfsoftware/stryker-js-mutation-run/output-mode'
import type { RunEvent, RunEventSink } from '@systemfsoftware/stryker-js-mutation-run/run-event'
import { generateRunId } from '@systemfsoftware/stryker-js-mutation-run/verdict-envelope'

import { STREAM_SCHEMA_VERSION, TICK_INTERVAL_MS } from './stream-protocol.kernel.js'

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
 * fiber (R28); every line drains through a stdout sink that waits on the
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

class RunEventStreamPortTag extends Context.Tag(
  '@systemfsoftware/stryker-js-cli/run-event-stream.adapter/RunEventStreamPort',
)<RunEventStreamPortTag, RunEventStreamPort>() {}

const RunEventStreamPort = RunEventStreamPortTag

export { RunEventStreamPort }

/**
 * A write to stdout failed — the reader closed the pipe (EPIPE), or the
 * descriptor is gone. Typed so the drain can swallow it without mistaking it
 * for a run failure (R31).
 */
class StdoutWriteError extends S.TaggedError<StdoutWriteError>()('stdout-write-error', { cause: S.Unknown }) {}

const isTerminalEvent = (event: RunEvent): boolean =>
  event.kind === 'verdict' || event.kind === 'error' || event.kind === 'help' || event.kind === 'manifest'

/**
 * The stdout sink: writes each line through `process.stdout.write(line, cb)`
 * and resumes when the callback fires — i.e. when the chunk is flushed to the
 * OS, which is real backpressure in place of the old `writeSync`. On
 * end-of-stream it calls `process.stdout.end()` and waits for `'finish'`, so
 * the drain completes only after every byte was handed to the OS (R30).
 *
 * A write failure fails the sink with a typed error instead of throwing; the
 * drain swallows it, which is what keeps a consumer closing the pipe from
 * replacing the run's classed exit code (R31). The persistent `error`
 * listener exists because an unhandled `'error'` event on a process stream
 * throws, and `end()` after a failed write can emit another EPIPE.
 */
function stdoutSink(): Sink.Sink<void, string, never, StdoutWriteError, never> {
  return Sink.fromPush<string, StdoutWriteError, void, never, never>(
    Effect.sync(() => {
      process.stdout.on('error', () => {})
      const writeLine = (line: string): Effect.Effect<void, StdoutWriteError, never> =>
        Effect.async((resume) => {
          let settled = false
          const settle = (result: Effect.Effect<void, StdoutWriteError, never>): void => {
            if (!settled) {
              settled = true
              resume(result)
            }
          }
          try {
            process.stdout.write(line, (error) => {
              if (error === undefined || error === null) {
                settle(Effect.void)
              } else {
                settle(Effect.fail(new StdoutWriteError({ cause: error })))
              }
            })
          } catch (error) {
            settle(Effect.fail(new StdoutWriteError({ cause: error })))
          }
        })
      const finish = (): Effect.Effect<void, StdoutWriteError, never> =>
        Effect.async((resume) => {
          let settled = false
          const settle = (result: Effect.Effect<void, StdoutWriteError, never>): void => {
            if (!settled) {
              settled = true
              process.stdout.off('finish', onFinish)
              process.stdout.off('error', onError)
              resume(result)
            }
          }
          const onFinish = (): void => settle(Effect.void)
          const onError = (error: unknown): void => {
            settle(Effect.fail(new StdoutWriteError({ cause: error })))
          }
          process.stdout.once('finish', onFinish)
          process.stdout.once('error', onError)
          try {
            process.stdout.end()
          } catch (error) {
            onError(error)
          }
        })
      const writeChunk = (chunk: Chunk.Chunk<string>): Effect.Effect<void, StdoutWriteError, never> =>
        Chunk.reduce<string, Effect.Effect<void, StdoutWriteError, never>>(
          chunk,
          Effect.void,
          (acc, line) => acc.pipe(Effect.flatMap(() => writeLine(line))),
        )
      // Sink.fromPush's push function signals via its error channel: failing
      // with Either.right(result) completes the sink, Either.left(error)
      // fails it, and succeeding continues with the next chunk.
      return (
        input: Option.Option<Chunk.Chunk<string>>,
      ): Effect.Effect<void, readonly [Either.Either<void, StdoutWriteError>, Chunk.Chunk<never>], never> => {
        if (Option.isNone(input)) {
          // End of input: flush stdout, then complete the sink with the
          // result handoff. A flush failure still carries the handoff — the
          // framework destructures it — as a sink failure.
          return finish().pipe(
            Effect.catchAll((writeError) => Effect.fail([Either.left(writeError), Chunk.empty<never>()] as const)),
            Effect.flatMap(() => Effect.fail([Either.right(void 0), Chunk.empty<never>()] as const)),
          )
        }
        return writeChunk(input.value).pipe(
          Effect.catchAll((writeError) => Effect.fail([Either.left(writeError), Chunk.empty<never>()] as const)),
        )
      }
    }),
  )
}

/**
 * The handle a run's host (the CLI composition root) holds: the sink core
 * pushes into, the identity the header and verdict share, the run's clock
 * zero, and the controls to open, inspect and close the stream.
 */
export interface RunEventStream {
  /** The sink core receives through `injectionTokens.runEventSink`. */
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
const makeRunEventStream = (resolved: ResolvedMode): Effect.Effect<RunEventStream, never, never> =>
  Effect.gen(function*() {
    const runId = generateRunId()
    const startedAt = yield* Clock.currentTimeMillis

    // The stream's live state. Shared between core's push path and the drain
    // fiber by design — single-threaded JS makes the cells safe, and the
    // module-state implementation this replaces worked the same way.
    const state: {
      mode: OutputMode
      signal: ModeSignal
      emit: EmitOpsPush<never, RunEvent> | null
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

    const eventStream = Stream.asyncPush<RunEvent>(
      (emit) =>
        Effect.sync(() => {
          state.emit = emit
        }),
      // R29: asyncPush's default is an unbounded mailbox, while `Stream.async`
      // defaults to `Queue.bounded(16)` with suspend semantics. A mutation run
      // emits per-mutant events from promise code that cannot suspend, so a
      // bounded mailbox would stall core's reporter the moment sixteen mutants
      // are in flight. The unbounded choice is stated here rather than
      // inherited from a default.
      { bufferSize: 'unbounded' },
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

    const drain: Effect.Effect<void, never, never> = Stream.run(framed, stdoutSink()).pipe(
      // The old writeSync path swallowed every write failure the same way: a
      // consumer that closed the pipe must not replace the run's classed exit
      // code (R31). The writable still has to be ended — a failed write leaves
      // process.stdout with a pending write that holds the event loop open,
      // and a successful run exits by natural means (process.exitCode).
      Effect.catchAll(() =>
        Effect.sync(() => {
          state.terminalWritten = true
          process.stdout.end()
        })
      ),
    )

    let drainFiber: Fiber.RuntimeFiber<void, never> | null = null

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
          // the emit below writes it verbatim, like plan/mutant.
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
          // A daemon, not a supervised fork: when the run is interrupted
          // (SIGINT), the main fiber's scope would interrupt a supervised
          // child before the onExit finalizer runs — and the terminal event
          // pushed by that finalizer would never reach stdout. The daemon
          // survives the interrupt, so closeAndDrain can join it and flush
          // the terminal line (R30); it ends on its own once the mailbox is
          // done and drained.
          drainFiber = yield* Effect.forkDaemon(drain)
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

export const RunEventStreamLive: Layer.Layer<RunEventStreamPortTag> = Layer.succeed(
  RunEventStreamPort,
  RunEventStreamPort.of({ createRunEventStream: makeRunEventStream }),
)
