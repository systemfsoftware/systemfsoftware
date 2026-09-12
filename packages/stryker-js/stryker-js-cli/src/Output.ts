/// <reference types="vitest/import-meta" />

import { Cell } from '@systemfsoftware/effect-cell-types'
import type { Thresholds } from '@systemfsoftware/stryker-js/Report'
import type { MutationTestResult } from '@systemfsoftware/stryker-js/Report'
import type * as Cause from 'effect/Cause'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Queue from 'effect/Queue'
import * as Result from 'effect/Result'
import * as Stdio from 'effect/Stdio'
import * as Stream from 'effect/Stream'
import * as CliError from 'effect/unstable/cli/CliError'
import {
  type FailedRunOutcome,
  type RunOk,
  type RunOutcomeDecision,
  type RunOutcomeError,
} from './classify-run-outcome.workflow.js'
import { readCapturedConsole, shapeEnvelope } from './Envelope.js'
import {
  ModeConflictError,
  ResolveModeCommand,
  type ResolveModeDecision,
  resolveOutputMode,
} from './resolve-output-mode.workflow.js'
import { buildVerdictEnvelope, defaultOptions, generateRunId, strykerVersion } from './run/index.js'
import type { ResolvedMode } from './run/index.js'
import { Heartbeat, HelpRendered, type RunEvent, RunFailed, RunStarted, VerdictReached } from './run/RunEvent.js'
import { STREAM_SCHEMA_VERSION } from './StreamVersion.js'

export { STREAM_SCHEMA_VERSION } from './StreamVersion.js'

export const TICK_INTERVAL_MS = 10_000

export interface RunEventStreamPort {
  readonly createRunEventStream: (resolved: ResolvedMode) => Effect.Effect<RunEventStream, never, never>
}

class RunEventStreamPortTag extends Context.Service<RunEventStreamPortTag, RunEventStreamPort>()(
  '@systemfsoftware/stryker-js-cli/Output/RunEventStreamPortTag',
) {}

const RunEventStreamPort = RunEventStreamPortTag

export { RunEventStreamPort }

const isTerminalEvent = (event: RunEvent): boolean =>
  Match.value(event).pipe(
    Match.tag('verdict', () => true),
    Match.tag('error', () => true),
    Match.tag('help', () => true),
    Match.orElse(() => false),
  )

const wireKind = (event: RunEvent): string =>
  Match.value(event).pipe(
    Match.tag('stream', () => 'stream'),
    Match.tag('phase', () => 'phase'),
    Match.tag('plan', () => 'plan'),
    Match.tag('mutant', () => 'mutant'),
    Match.tag('tick', () => 'tick'),
    Match.tag('verdict', () => 'verdict'),
    Match.tag('error', () => 'error'),
    Match.tag('help', () => 'help'),
    Match.exhaustive,
  )

const toWireLine = (event: RunEvent): string => {
  const fields = Object.fromEntries(Object.entries(event).filter(([key]) => key !== '_tag'))
  return JSON.stringify({ kind: wireKind(event), ...fields })
}

export type FramedDrain = (framed: Stream.Stream<string>) => Effect.Effect<void, never, never>

function numberText(value: number | null | undefined, fallback: string): string {
  if (typeof value === 'number') {
    return String(value)
  }
  return fallback
}

function phaseLine(phase: unknown): string {
  if (typeof phase === 'string') {
    return `phase ${phase}`
  }
  return 'phase '
}

const stderrProgressLine = (event: RunEvent, alreadyClosed: boolean): string | undefined => {
  if (alreadyClosed) {
    return undefined
  }
  return Match.value(event).pipe(
    Match.tag('plan', (e) => `plan ${numberText(e.total, '0')} mutants`),
    Match.tag('phase', (e) => phaseLine(e.phase)),
    Match.tag(
      'tick',
      (e) => `${numberText(e.completed, '0')}/${numberText(e.total, '?')} elapsed ${numberText(e.elapsedMs, '0')}ms`,
    ),
    Match.tag(
      'verdict',
      (e) =>
        `score ${numberText(e.score, 'n/a')} killed ${numberText(e.counts.killed, '0')} survived ${
          numberText(e.counts.survived, '0')
        }`,
    ),
    Match.tag('error', (e) => {
      if (typeof e.error === 'string') {
        return `error ${e.error}`
      }
      return 'error '
    }),
    Match.orElse(() => undefined),
  )
}

const writeStderr = (stdio: Stdio.Stdio, line: string): Effect.Effect<void, never, never> =>
  Stream.run(Stream.succeed(`${line}\n`), stdio.stderr({ endOnDone: false })).pipe(Effect.ignore)

const drainOf = (stdio: Stdio.Stdio, framed: Stream.Stream<string>): Effect.Effect<void, never, never> =>
  Stream.run(framed, stdio.stdout({ endOnDone: true })).pipe(Effect.ignore)

export interface RunEventStream {
  readonly queue: Queue.Queue<RunEvent, Cause.Done>
  readonly runId: string
  readonly startedAt: number
  readonly isOpen: () => boolean
  readonly ensureOpen: (resolved: ResolvedMode) => void
  readonly open: Effect.Effect<void, never, never>
  readonly closeAndDrain: Effect.Effect<void, never, never>
  readonly setProgressStreamFile?: (fileName: string) => Effect.Effect<void, never, never>
}

interface RunEventStreamState {
  mode: ResolvedMode['mode']
  signal: ResolvedMode['signal']
  headerWritten: boolean
  terminalWritten: boolean
  progress: { completed: number; total: number | null }
}

export const makeRunEventStream = (
  stdio: Stdio.Stdio,
  resolved: ResolvedMode,
  drainFramed: FramedDrain = drainOf.bind(null, stdio),
): Effect.Effect<RunEventStream, never, never> =>
  Effect.gen(function*() {
    const runId = generateRunId()
    const startedAt = yield* Clock.currentTimeMillis
    const queue = yield* Queue.unbounded<RunEvent, Cause.Done>()

    const state: RunEventStreamState = {
      mode: resolved.mode,
      signal: resolved.signal,
      headerWritten: false,
      terminalWritten: false,
      progress: { completed: 0, total: null },
    }

    const queueStream = Stream.fromQueue(queue).pipe(
      Stream.tap((event) =>
        Effect.sync(() => {
          Match.value(event).pipe(
            Match.tag('plan', (e) => {
              state.progress = { ...state.progress, total: e.total }
            }),
            Match.tag('mutant', (e) => {
              state.progress = { completed: e.completed, total: e.total }
            }),
            Match.orElse(() => {}),
          )
        })
      ),
    )

    const tickStream = Stream.tick(TICK_INTERVAL_MS).pipe(
      Stream.drop(1),
      Stream.filter(() => state.headerWritten && !state.terminalWritten),
      Stream.mapEffect(() =>
        Effect.gen(function*() {
          const now = yield* Clock.currentTimeMillis
          return Heartbeat.make({
            elapsedMs: now - startedAt,
            completed: state.progress.completed,
            total: state.progress.total,
          })
        })
      ),
    )

    let terminalSeen = false

    const noteTerminal = (event: RunEvent): void => {
      state.terminalWritten = state.terminalWritten || isTerminalEvent(event)
    }

    const progressTap = (event: RunEvent): Effect.Effect<void, never, never> => {
      const line = stderrProgressLine(event, state.terminalWritten)
      noteTerminal(event)
      return Option.match(Option.fromUndefinedOr(line), {
        onNone: () => Effect.void,
        onSome: (text) => writeStderr(stdio, text),
      })
    }

    const framingOpen = (): boolean => state.mode === 'machine' && !terminalSeen

    const markTerminalFramed = (event: RunEvent): void => {
      terminalSeen = terminalSeen || isTerminalEvent(event)
    }

    const frameEvent = (event: RunEvent): boolean => {
      if (!framingOpen()) {
        return false
      }
      markTerminalFramed(event)
      return true
    }

    const observed = Stream.merge(queueStream, tickStream, { haltStrategy: 'either' }).pipe(
      Stream.tap(progressTap),
    )
    const framed = observed.pipe(
      Stream.filter(frameEvent),
      Stream.map((event) => `${toWireLine(event)}\n`),
    )

    const drain: Effect.Effect<void, never, never> = drainFramed(framed)

    let drainFiber: Fiber.Fiber<void, never> | null = null

    const outputOpen = (): boolean => state.mode === 'machine' && !state.terminalWritten

    const offerStarted = (): Effect.Effect<void, never, never> =>
      Effect.gen(function*() {
        if (state.mode !== 'machine') {
          return
        }
        yield* Queue.offer(
          queue,
          RunStarted.make({
            schemaVersion: STREAM_SCHEMA_VERSION,
            runId,
            mode: state.mode,
            signal: state.signal,
          }),
        )
      })

    const openHeader = (): Effect.Effect<void, never, never> =>
      Effect.gen(function*() {
        if (state.headerWritten) {
          return
        }
        state.headerWritten = true
        yield* offerStarted()
      })

    return {
      queue,
      runId,
      startedAt,
      isOpen: () => outputOpen() && drainFiber !== null,
      ensureOpen: (openResolved: ResolvedMode): void => {
        if (state.headerWritten) {
          return
        }
        state.mode = openResolved.mode
        state.signal = openResolved.signal
      },
      open: Effect.gen(function*() {
        if (drainFiber !== null) {
          return
        }
        yield* openHeader()
        drainFiber = yield* Effect.forkDetach(drain)
      }),
      closeAndDrain: Effect.gen(function*() {
        state.terminalWritten = true

        yield* Queue.end(queue)
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

export const TOOL_VARIABLES = ['CLAUDECODE', 'CODEX_SANDBOX'] as const

export type ToolVariable = (typeof TOOL_VARIABLES)[number]

export interface FormatFlags {
  readonly text?: boolean
  readonly json?: boolean
}

export interface ModeInput extends FormatFlags {
  readonly envMode?: string
  readonly stdoutIsTTY: boolean
  readonly agent?: string
  readonly toolVars?: Readonly<Partial<Record<ToolVariable, string | undefined>>>
}

const decisionToResolvedMode = (decision: ResolveModeDecision): ResolvedMode =>
  Match.value(decision).pipe(
    Match.tag(
      'HumanOutput',
      (human): ResolvedMode => ({ mode: 'human', signal: human.signal, stdoutIsTTY: human.stdoutIsTTY }),
    ),
    Match.tag(
      'MachineOutput',
      (machine): ResolvedMode => ({ mode: 'machine', signal: machine.signal, stdoutIsTTY: machine.stdoutIsTTY }),
    ),
    Match.exhaustive,
  )

/** The raw gathered probe values, before the decision shapes them into a command. */
interface ProbeInput {
  readonly stdoutIsTTY: boolean
  readonly text?: boolean | undefined
  readonly json?: boolean | undefined
  readonly envMode?: string | undefined
  readonly agent?: string | undefined
  readonly toolVars?: Readonly<Record<string, string | undefined>> | undefined
}

const definedToolVars = (vars: Readonly<Record<string, string | undefined>> | undefined): Record<string, string> =>
  Object.fromEntries(
    Object.entries(vars ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )

const commandFor = (input: ProbeInput): ResolveModeCommand =>
  ResolveModeCommand.make({
    stdoutIsTTY: input.stdoutIsTTY,
    text: input.text,
    json: input.json,
    envMode: input.envMode,
    agent: input.agent,
    toolVars: definedToolVars(input.toolVars),
  })

export function resolveMode(input: ModeInput): Result.Result<ResolvedMode, CliError.CliError> {
  return Result.match(resolveOutputMode(commandFor(input)), {
    onFailure: (conflict) =>
      Result.fail(
        CliError.InvalidValue.make({
          option: conflict.option,
          value: conflict.value,
          expected: conflict.expected,
          kind: 'flag',
        }),
      ),
    onSuccess: (decision) => Result.succeed(decisionToResolvedMode(decision)),
  })
}

export function isProgressEnabled(resolved: ResolvedMode): boolean {
  return resolved.mode === 'human' && resolved.stdoutIsTTY
}

export function isColorEnabled(resolved: ResolvedMode, noColor: string | undefined): boolean {
  const requested = Option.exists(Option.fromUndefinedOr(noColor), (value) => value.length > 0)
  return resolved.mode === 'human' && !requested
}

export interface OutputModeProbe {
  readonly detectMode: Effect.Effect<ResolvedMode, CliError.CliError>
}

class OutputModeProbeTag extends Context.Service<OutputModeProbeTag, OutputModeProbe>()(
  '@systemfsoftware/stryker-js-cli/Output/OutputModeProbeTag',
) {}

const OutputModeProbe = OutputModeProbeTag

export { OutputModeProbe }

const envToolVars = (): Record<string, string> =>
  definedToolVars(
    Object.fromEntries(
      TOOL_VARIABLES.map((variable): [string, string | undefined] => [variable, process.env[variable]]),
    ),
  )

const probeInput = (command: FormatFlags): ProbeInput => ({
  stdoutIsTTY: process.stdout.isTTY === true,
  text: command.text,
  json: command.json,
  envMode: process.env['STRYKER_MODE'],
  agent: process.env['AGENT'],
  toolVars: envToolVars(),
})

export const outputModeProbeCell = Cell.layer({
  read: (command: FormatFlags) => Effect.succeed(probeInput(command)),
  decode: (raw: ProbeInput) => Result.succeed(commandFor(raw)),
  decide: resolveOutputMode,
  encode: (outcome: Result.Result<ResolveModeDecision, ModeConflictError>) =>
    Result.map(outcome, decisionToResolvedMode),
  write: (outcome) =>
    Result.match(outcome, {
      onFailure: (error) => Effect.fail(error),
      onSuccess: (mode) => Effect.succeed(mode),
    }),
})

export const detectModeWithProbe = (flags: FormatFlags = {}): Effect.Effect<ResolvedMode, CliError.CliError> =>
  Cell.run(outputModeProbeCell, flags).pipe(
    Effect.mapError(
      (error) =>
        CliError.InvalidValue.make({
          option: error.option,
          value: error.value,
          expected: error.expected,
          kind: 'flag',
        }),
    ),
  )

export const OutputModeProbeLive: Layer.Layer<OutputModeProbeTag> = Layer.succeed(
  OutputModeProbe,
  OutputModeProbe.of({
    detectMode: detectModeWithProbe({}),
  }),
)

export function emitNullScoreVerdict(
  stream: RunEventStream,
  mode: ResolvedMode,
  thresholds: Thresholds,
  config: Readonly<Record<string, unknown>>,
  basePath: string,
  pathService: Path.Path,
): Effect.Effect<void, never, never> {
  const report: MutationTestResult = {
    schemaVersion: '1.0',
    files: {},
    thresholds,
    projectRoot: basePath,
    config,
    framework: { name: 'StrykerJS', version: strykerVersion },
  }
  const envelope = buildVerdictEnvelope(report, mode.mode, mode.signal, stream.runId, basePath, pathService)
  return Queue.offer(
    stream.queue,
    VerdictReached.make({
      schemaVersion: envelope.schemaVersion,
      runId: envelope.runId,
      mode: envelope.mode,
      signal: envelope.signal,
      score: envelope.score,
      thresholds: envelope.thresholds,
      reportFile: envelope.reportFile,
      counts: envelope.counts,
      mutants: envelope.mutants,
    }),
  )
}

function offerFailureEnvelope(
  stream: RunEventStream,
  failed: FailedRunOutcome,
  captured: string,
): Effect.Effect<void, never, never> {
  const envelope = shapeEnvelope(failed, captured)
  return Queue.offer(
    stream.queue,
    RunFailed.make({
      schemaVersion: envelope.schemaVersion,
      code: envelope.code,
      error: envelope.error,
      remediation: envelope.remediation,
    }),
  )
}

const emitHelpEnvelope = (stream: RunEventStream, help: string): Effect.Effect<void, never, never> =>
  Queue.offer(
    stream.queue,
    HelpRendered.make({
      schemaVersion: STREAM_SCHEMA_VERSION,
      code: 0,
      help,
    }),
  )

const helpPayload = (ok: RunOk, captured: string): Option.Option<string> =>
  Option.filter(Option.some(captured), () => ok.help || captured.length > 0)

const emitNullScoreVerdictWhenOpen = (
  stream: RunEventStream,
  mode: ResolvedMode,
  basePath: string,
  pathService: Path.Path,
): Effect.Effect<void, never, never> =>
  Effect.gen(function*() {
    if (!stream.isOpen()) {
      return
    }
    const defaults = yield* defaultOptions
    yield* emitNullScoreVerdict(stream, mode, defaults.thresholds, {}, basePath, pathService)
  })

export function emitMachineModeOutput(
  stream: RunEventStream,
  mode: ResolvedMode,
  outcome: Result.Result<RunOutcomeDecision, RunOutcomeError>,
  basePath: string,
  pathService: Path.Path,
): Effect.Effect<void, never, never> {
  return Effect.gen(function*() {
    const captured = readCapturedConsole()
    if (Result.isSuccess(outcome)) {
      const decision = outcome.success
      return yield* Match.value(decision).pipe(
        Match.tag('RunOk', (ok): Effect.Effect<void, never, never> =>
          Option.match(helpPayload(ok, captured), {
            onSome: (help) => emitHelpEnvelope(stream, help),
            onNone: () => emitNullScoreVerdictWhenOpen(stream, mode, basePath, pathService),
          })),
        Match.tag('RunParseFailed', (failed) => offerFailureEnvelope(stream, failed, captured)),
        Match.tag('RunSurvivorsRejected', (failed) => offerFailureEnvelope(stream, failed, captured)),
        Match.tag('RunConfigFailed', (failed) => offerFailureEnvelope(stream, failed, captured)),
        Match.tag('RunFailed', (failed) => offerFailureEnvelope(stream, failed, captured)),
        Match.exhaustive,
      )
    }
    return yield* offerFailureEnvelope(stream, outcome.failure, captured)
  })
}
