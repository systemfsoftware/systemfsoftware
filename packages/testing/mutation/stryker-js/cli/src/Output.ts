/// <reference types="vitest/import-meta" />
/**
 * Output — the machine/human output capability.
 *
 * The NDJSON run-event stream, wire protocol constants, mode resolution probes,
 * and machine-mode terminal output. Pure mode resolution lives in
 * Output.workflow.ts.
 */
import { Cell } from '@systemfsoftware/effect-cell-types'
import { generateRunId } from '@systemfsoftware/stryker-js-platform-node'
import type { ResolvedMode } from '@systemfsoftware/stryker-js-platform-node'
import { buildVerdictEnvelope, defaultOptions, strykerVersion } from '@systemfsoftware/stryker-js-platform-node'
import { schema } from '@systemfsoftware/stryker-js/Mutant'
import {
  Heartbeat,
  HelpRendered,
  type RunEvent,
  RunFailed,
  RunStarted,
  VerdictReached,
} from '@systemfsoftware/stryker-js/Run'
import type * as Cause from 'effect/Cause'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Path from 'effect/Path'
import * as Queue from 'effect/Queue'
import * as Result from 'effect/Result'
import * as Stdio from 'effect/Stdio'
import * as Stream from 'effect/Stream'
import * as CliError from 'effect/unstable/cli/CliError'
import { readCapturedConsole, shapeEnvelope } from './Envelope.js'
import { ModeConflictError, ResolveModeCommand, resolveModeWorkflow } from './Output.workflow.js'
import type { RunOk, RunOutcomeError } from './RunOutcome.workflow.js'
import { STREAM_SCHEMA_VERSION } from './StreamVersion.js'
/**
 * The wire protocol constants of the machine-mode NDJSON run-event stream.
 * Domain-blind: the stream adapter frames with them and the transport closes
 * terminal lines with the schema version, so each constant has exactly one
 * declaration and no other module may hard-code it.
 */

/**
 * The stream schema version (R21), carried by the header and the error
 * terminal event. Independent of the report schema version: consumers ignore
 * unknown `kind` values and unknown fields, so a new event type is an
 * additive change.
 */
export { STREAM_SCHEMA_VERSION } from './StreamVersion.js'

/**
 * The heartbeat interval (R19), matching Terraform's `apply_progress`
 * cadence: long enough that a slow phase is not noisy, short enough that a
 * consumer can tell "slow" from "hung" without waiting for a mutant event.
 */
export const TICK_INTERVAL_MS = 10_000

/** The version shape the law pins. */
const MAJOR_DOT_MINOR = /^\d+\.\d+$/

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { describe, it } = await import('@systemfsoftware/effect-gherkin-spec')
  const { expect } = await import('vitest')
  const { FastCheck: fc } = await import('effect/testing')
  void fc

  /**
   * Only the two wire constants are exported, so each law is an invariant
   * over the single defined value rather than a quantified relation: a value
   * change (a non-positive tick, a version that stops being `N.N`) is exactly
   * the bug these pin.
   */
  describe('stream-protocol wire constants', () => {
    it('Should_TickIntervalBeSchedulable_When_ConstantIsPositive', () => {
      expect(Number.isInteger(TICK_INTERVAL_MS)).toBe(true)
      expect(TICK_INTERVAL_MS).toBeGreaterThan(0)
    })

    it('Should_SchemaVersionBeMajorDotMinor_When_Constant', () => {
      expect(MAJOR_DOT_MINOR.test(STREAM_SCHEMA_VERSION)).toBe(true)
    })
  })
}

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
    Match.tag('manifest', () => true),
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
    Match.tag('manifest', () => 'manifest'),
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

export const makeRunEventStream = (
  stdio: Stdio.Stdio,
  resolved: ResolvedMode,
  drainFramed: FramedDrain = drainOf.bind(null, stdio),
): Effect.Effect<RunEventStream, never, never> =>
  Effect.gen(function*() {
    const runId = generateRunId()
    const startedAt = yield* Clock.currentTimeMillis
    const queue = yield* Queue.unbounded<RunEvent, Cause.Done>()

    type Progress = { completed: number; total: number | null }
    const state: {
      mode: typeof resolved.mode
      signal: typeof resolved.signal
      headerWritten: boolean
      terminalWritten: boolean
      progress: Progress
      findingsPrinted: number
    } = {
      mode: resolved.mode,
      signal: resolved.signal,
      headerWritten: false,
      terminalWritten: false,
      progress: { completed: 0, total: null },
      findingsPrinted: 0,
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
    const observed = Stream.merge(queueStream, tickStream, { haltStrategy: 'either' }).pipe(
      Stream.tap((event) => {
        const line = stderrProgressLine(event, state.terminalWritten)
        if (isTerminalEvent(event)) {
          state.terminalWritten = true
        }
        if (line === undefined) {
          return Effect.void
        }
        return writeStderr(stdio, line)
      }),
    )
    const framed = observed.pipe(
      Stream.filter((event) => {
        if (state.mode !== 'machine') {
          return false
        }
        if (terminalSeen) {
          return false
        }
        if (isTerminalEvent(event)) {
          terminalSeen = true
        }
        return true
      }),
      Stream.map((event) => `${toWireLine(event)}\n`),
    )

    const drain: Effect.Effect<void, never, never> = drainFramed(framed)

    let drainFiber: Fiber.Fiber<void, never> | null = null

    return {
      queue,
      runId,
      startedAt,
      isOpen: () => state.mode === 'machine' && !state.terminalWritten && drainFiber !== null,
      ensureOpen: (openResolved: ResolvedMode): void => {
        if (state.headerWritten) {
          return
        }
        state.mode = openResolved.mode
        state.signal = openResolved.signal
      },
      open: Effect.gen(function*() {
        if (drainFiber === null) {
          if (!state.headerWritten) {
            state.headerWritten = true
            if (state.mode === 'machine') {
              yield* Queue.offer(
                queue,
                RunStarted.make({
                  schemaVersion: STREAM_SCHEMA_VERSION,
                  runId,
                  mode: state.mode,
                  signal: state.signal,
                }),
              )
            }
          }
          drainFiber = yield* Effect.forkDetach(drain)
        }
      }),
      closeAndDrain: Effect.gen(function*() {
        state.terminalWritten = true
        // `end`, never `shutdown` and never `interrupt`. Shutdown clears the buffered
        // messages and finalizes the queue at once, so every event still buffered —
        // including the terminal one every consumer parses for — is discarded before the
        // drain can write it. `interrupt` keeps the buffer but ends the queue with an
        // interrupt cause, and the join below then re-raises it into the caller, losing the
        // exit code the run already decided. `end` completes the queue with `Cause.Done`,
        // which `Stream.fromQueue` reads as end-of-stream: the buffer drains and the
        // terminal event is the last line on stdout.
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

/**
 * Resolves the output mode by R4 precedence. Pure — reads nothing, so it is
 * fully testable; the caller supplies every input once at startup. The
 * mutually-exclusive-flags case is a caller error, returned as a `failure` so
 * the function stays total.
 *
 * Delegates to the workflow's pure decision so the Cell sandwich has a single
 * source of truth.
 */
export function resolveMode(input: ModeInput): Result.Result<ResolvedMode, CliError.CliError> {
  let commandInput: {
    readonly stdoutIsTTY: boolean
    readonly text?: boolean
    readonly json?: boolean
    readonly envMode?: string
    readonly agent?: string
    readonly toolVars?: Record<string, string>
  } = {
    stdoutIsTTY: input.stdoutIsTTY,
  }
  if (input.text !== undefined) {
    commandInput = { ...commandInput, text: input.text }
  }
  if (input.json !== undefined) {
    commandInput = { ...commandInput, json: input.json }
  }
  if (input.envMode !== undefined) {
    commandInput = { ...commandInput, envMode: input.envMode }
  }
  if (input.agent !== undefined) {
    commandInput = { ...commandInput, agent: input.agent }
  }
  if (input.toolVars !== undefined) {
    const filtered: Record<string, string> = {}
    for (const [key, value] of Object.entries(input.toolVars)) {
      if (value !== undefined) {
        filtered[key] = value
      }
    }
    if (Object.keys(filtered).length > 0) {
      commandInput = { ...commandInput, toolVars: filtered }
    }
  }
  const command = ResolveModeCommand.make(commandInput)
  const result = resolveModeWorkflow(command)
  if (Result.isFailure(result)) {
    const conflict = result.failure
    return Result.fail(
      CliError.InvalidValue.make({
        option: conflict.option,
        value: conflict.value,
        expected: conflict.expected,
        kind: 'flag',
      }),
    )
  }
  return Result.succeed(result.success)
}

/**
 * The progress bar's gate. Human mode on a non-TTY stdout (AE1) must not leak
 * its control sequences into a pipe, and machine mode keeps stdout clean for
 * the verdict envelope (R5). Decided from the resolved mode's own detection
 * data — never a second `isTTY` probe.
 */
export function isProgressEnabled(resolved: ResolvedMode): boolean {
  return resolved.mode === 'human' && resolved.stdoutIsTTY
}

/**
 * The log colouriser's gate (R8). Machine mode never emits colour, so a
 * harness merging `2>&1` is not handed escape sequences it must strip, and
 * `NO_COLOR` is honoured for the human path per the convention: any value
 * other than an unset or empty variable disables colour.
 */
export function isColorEnabled(resolved: ResolvedMode, noColor: string | undefined): boolean {
  if (resolved.mode !== 'human') {
    return false
  }
  if (noColor === undefined) {
    return true
  }
  if (noColor.length === 0) {
    return true
  }
  return false
}

/** The example suite's canonical TTY input. */
const ttyInput = (overrides: Partial<ModeInput> = {}): ModeInput => ({
  stdoutIsTTY: true,
  ...overrides,
})

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { describe, it } = await import('@systemfsoftware/effect-gherkin-spec')
  const { expect } = await import('vitest')
  const { FastCheck: fc } = await import('effect/testing')
  const { Equal } = await import('effect')
  const Result = await import('effect/Result')
  const Option = await import('effect/Option')
  const CliError = await import('effect/unstable/cli/CliError')

  /**
   * The generated mode-input domain. Every signal slot ranges over its full
   * value space, so the laws below quantify over combinations the example tests
   * never enumerate — including flags on a TTY, empty signals on a pipe, and
   * both tool variables together.
   *
   * The drawn record carries every slot as `T | undefined`; `toModeInput` drops
   * the undefined slots so the value satisfies `ModeInput` under the package's
   * exact-optional-property typecheck (a present `undefined` property is not an
   * absent one).
   */
  type DrawnModeInput = {
    text: boolean
    json: boolean
    envMode: string | undefined
    stdoutIsTTY: boolean
    agent: string | undefined
    toolVars: Readonly<Record<string, string | undefined>> | undefined
  }

  const toModeInput = (drawn: DrawnModeInput): ModeInput => {
    let result: ModeInput = {
      stdoutIsTTY: drawn.stdoutIsTTY,
      text: drawn.text,
      json: drawn.json,
    }
    if (drawn.envMode !== undefined) {
      result = { ...result, envMode: drawn.envMode }
    }
    if (drawn.agent !== undefined) {
      result = { ...result, agent: drawn.agent }
    }
    if (drawn.toolVars !== undefined) {
      result = { ...result, toolVars: drawn.toolVars }
    }
    return result
  }
  const envModeArb = fc.oneof(
    fc.constant(undefined),
    fc.constant(''),
    fc.constant('machine'),
    fc.constant('human'),
    fc.constant('MACHINE'),
    fc.constant('other'),
  )

  const agentArb = fc.oneof(
    fc.constant(undefined),
    fc.constant(''),
    fc.constant('1'),
  )

  const toolVarsArb = fc.oneof(
    fc.constant(undefined),
    fc.constant({}),
    fc.constant({ CLAUDECODE: '' }),
    fc.constant({ CLAUDECODE: '1' }),
    fc.constant({ CODEX_SANDBOX: '1' }),
    fc.constant({ CLAUDECODE: '1', CODEX_SANDBOX: '' }),
  )

  const modeInputArb = fc.record({
    text: fc.boolean(),
    json: fc.boolean(),
    envMode: envModeArb,
    stdoutIsTTY: fc.boolean(),
    agent: agentArb,
    toolVars: toolVarsArb,
  })

  const flagFreeInputArb = modeInputArb.filter((input) => input.text === false && input.json === false)

  const noSignalInputArb = flagFreeInputArb.filter(
    (input) => input.envMode === undefined && input.stdoutIsTTY === false,
  )

  const cleanTtyInputArb = flagFreeInputArb.filter(
    (input) =>
      input.envMode === undefined && input.stdoutIsTTY === true &&
      (input.agent === undefined || input.agent === '') && input.toolVars === undefined,
  )

  const resolvedModeArb = fc.record({
    mode: fc.constantFrom('human', 'machine'),
    signal: fc.constantFrom('flag', 'env', 'tty', 'agent', 'tool'),
    stdoutIsTTY: fc.boolean(),
  })

  const noColorArb = fc.oneof(
    fc.constant(undefined),
    fc.constant(''),
    fc.constant('0'),
    fc.constant('1'),
    fc.string({ maxLength: 6 }),
  )

  describe('resolveMode — totality over the generated domain', () => {
    it.prop(
      '∀i_ResolveMode_≡LeftIffBothFlags',
      [modeInputArb],
      ([input]) => Result.isFailure(resolveMode(toModeInput(input))) === (input.text === true && input.json === true),
    )

    it.prop(
      '∀i_ResolvedMode_≡CarriesStdoutTty',
      [modeInputArb],
      ([input]) =>
        Result.match(resolveMode(toModeInput(input)), {
          onFailure: () => true,
          onSuccess: (resolved) => resolved.stdoutIsTTY === input.stdoutIsTTY,
        }),
    )

    it.prop('∀i_EmptyEnvMode_≡Unset', [modeInputArb], ([input]) =>
      Equal.equals(
        resolveMode(toModeInput({ ...input, envMode: '' })),
        resolveMode(toModeInput({ ...input, envMode: undefined })),
      ))

    it.prop('∀i_EmptyAgent_≡Unset', [modeInputArb], ([input]) =>
      Equal.equals(
        resolveMode(toModeInput({ ...input, agent: '' })),
        resolveMode(toModeInput({ ...input, agent: undefined })),
      ))

    it.prop('∀i_EmptyToolVariable_≡Absent', [modeInputArb], ([input]) =>
      Equal.equals(
        resolveMode(toModeInput({ ...input, toolVars: { CLAUDECODE: '' } })),
        resolveMode(toModeInput({ ...input, toolVars: undefined })),
      ))
  })

  describe('resolveMode — precedence over every signal combination', () => {
    it.prop(
      '∀i_TextFlag_≡HumanEverywhere',
      [modeInputArb.filter((i) => i.text === true && i.json === false)],
      ([input]) => Result.getOrThrow(resolveMode(toModeInput(input))).mode === 'human',
    )

    it.prop(
      '∀i_JsonFlag_≡MachineEverywhere',
      [modeInputArb.filter((i) => i.json === true && i.text === false)],
      ([input]) => Result.getOrThrow(resolveMode(toModeInput(input))).mode === 'machine',
    )

    it.prop('∀i_EnvMode_≡EnvSignalByLiteral', [
      flagFreeInputArb.filter((i) => i.envMode !== undefined && i.envMode.length > 0),
    ], ([input]) => {
      const resolved = Result.getOrThrow(resolveMode(toModeInput(input)))
      if (resolved.signal !== 'env') {
        return false
      }
      if (input.envMode === 'machine') {
        return resolved.mode === 'machine'
      }
      return resolved.mode === 'human'
    })

    it.prop('∀i_NonTtyNoSignals_≡MachineTtySignal', [noSignalInputArb], ([input]) => {
      const resolved = Result.getOrThrow(resolveMode(toModeInput(input)))
      return resolved.mode === 'machine' && resolved.signal === 'tty'
    })

    it.prop('∀i_CleanTty_≡HumanTtySignal', [cleanTtyInputArb], ([input]) => {
      const resolved = Result.getOrThrow(resolveMode(toModeInput(input)))
      return resolved.mode === 'human' && resolved.signal === 'tty'
    })

    it.prop('∀i_AgentSetOnTty_≡MachineAgentSignal', [
      flagFreeInputArb.filter((i) =>
        i.envMode === undefined && i.stdoutIsTTY === true && i.agent !== undefined && i.agent.length > 0
      ),
    ], ([input]) => {
      const resolved = Result.getOrThrow(resolveMode(toModeInput(input)))
      return resolved.mode === 'machine' && resolved.signal === 'agent'
    })

    it.prop('∀i_ToolVariableSetOnTty_≡MachineToolSignal', [
      flagFreeInputArb.filter((i) =>
        i.envMode === undefined && i.stdoutIsTTY === true && (i.agent === undefined || i.agent === '') &&
        i.toolVars !== undefined && Object.values(i.toolVars).some((value) => value.length > 0)
      ),
    ], ([input]) => {
      const resolved = Result.getOrThrow(resolveMode(toModeInput(input)))
      return resolved.mode === 'machine' && resolved.signal === 'tool'
    })
  })

  describe('output gates — quantified over every resolved mode and NO_COLOR value', () => {
    it.prop(
      '∀r_MachineMode_≡NeverColored',
      [resolvedModeArb, noColorArb],
      ([resolved, noColor]) => {
        if (resolved.mode === 'machine') {
          return !isColorEnabled(resolved, noColor)
        }
        return true
      },
    )

    it.prop(
      '∀rn_NoColorNonEmpty_≡NeverColored',
      [resolvedModeArb, noColorArb],
      ([resolved, noColor]) => {
        if (noColor !== undefined && noColor.length > 0) {
          return !isColorEnabled(resolved, noColor)
        }
        return true
      },
    )

    it.prop('∀r_HumanNoNoColor_≡Colored', [resolvedModeArb], ([resolved]) => {
      if (resolved.mode === 'human') {
        return isColorEnabled(resolved, undefined) && isColorEnabled(resolved, '')
      }
      return true
    })

    it.prop(
      '∀r_ProgressEnabled_≡HumanOnTty',
      [resolvedModeArb],
      ([resolved]) => {
        if (isProgressEnabled(resolved)) {
          return resolved.mode === 'human' && resolved.stdoutIsTTY
        }
        return true
      },
    )
  })

  // The example suite, converted verbatim from the deleted example test file.
  describe('resolveMode (examples)', () => {
    it('Should_ResolveHuman_When_TtyHasNoAgentVariables', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput()))).toEqual({
        mode: 'human',
        signal: 'tty',
        stdoutIsTTY: true,
      })
    })

    it('Should_ResolveMachine_When_NonTtyStdoutRegardlessOfDetectionEnv', () => {
      const resolved = Result.getOrThrow(
        resolveMode({
          stdoutIsTTY: false,
          agent: '1',
          toolVars: { CLAUDECODE: '1' },
        }),
      )
      expect(resolved.mode).toBe('machine')
      expect(resolved.signal).toBe('tty')
      expect(resolved.stdoutIsTTY).toBe(false)
    })

    it('Should_ResolveHuman_When_EnvModeHumanOverridesNonTtyStdout', () => {
      expect(Result.getOrThrow(resolveMode({ stdoutIsTTY: false, envMode: 'human' }))).toEqual({
        mode: 'human',
        signal: 'env',
        stdoutIsTTY: false,
      })
    })

    it('Should_ResolveMachine_When_AgentVariableSetOnTty', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ agent: '1' })))).toEqual({
        mode: 'machine',
        signal: 'agent',
        stdoutIsTTY: true,
      })
    })

    it('Should_ResolveHuman_When_AgentVariableEmptyOnTty', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ agent: '' })))).toEqual({
        mode: 'human',
        signal: 'tty',
        stdoutIsTTY: true,
      })
    })

    it('Should_ResolveMachine_When_KnownToolVariableSetOnTty', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ toolVars: { CODEX_SANDBOX: '1' } })))).toEqual({
        mode: 'machine',
        signal: 'tool',
        stdoutIsTTY: true,
      })
    })

    it('Should_ResolveHuman_When_TextFlagGivenOnPipe', () => {
      expect(Result.getOrThrow(resolveMode({ stdoutIsTTY: false, text: true }))).toEqual({
        mode: 'human',
        signal: 'flag',
        stdoutIsTTY: false,
      })
    })

    it('Should_ResolveMachine_When_JsonFlagGivenOnTty', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ json: true })))).toEqual({
        mode: 'machine',
        signal: 'flag',
        stdoutIsTTY: true,
      })
    })

    it('Should_ReturnValidationError_When_JsonAndTextFlagsCombined', () => {
      const outcome = resolveMode(ttyInput({ json: true, text: true }))
      expect(Result.isFailure(outcome)).toEqual(true)
      expect(CliError.isCliError(Option.getOrNull(Result.getFailure(outcome)))).toEqual(true)
    })

    it('Should_ResolveHuman_When_EnvModeHumanOverridesAgentVariable', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ envMode: 'human', agent: '1' })))).toEqual({
        mode: 'human',
        signal: 'env',
        stdoutIsTTY: true,
      })
    })

    it('Should_ResolveMachine_When_EnvModeMachineOverridesTty', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ envMode: 'machine' })))).toEqual({
        mode: 'machine',
        signal: 'env',
        stdoutIsTTY: true,
      })
    })

    it('Should_PreferExplicitFlag_When_EnvModeAlsoSet', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ text: true, envMode: 'machine' })))).toEqual({
        mode: 'human',
        signal: 'flag',
        stdoutIsTTY: true,
      })
      expect(Result.getOrThrow(resolveMode(ttyInput({ json: true, envMode: 'human' })))).toEqual({
        mode: 'machine',
        signal: 'flag',
        stdoutIsTTY: true,
      })
    })

    it('Should_TreatEmptyEnvModeAsUnset_When_StdoutIsTTY', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ envMode: '' })))).toEqual({
        mode: 'human',
        signal: 'tty',
        stdoutIsTTY: true,
      })
    })

    it('Should_TreatEmptyToolVariableAsUnset_When_StdoutIsTTY', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ toolVars: { CLAUDECODE: '' } })))).toEqual({
        mode: 'human',
        signal: 'tty',
        stdoutIsTTY: true,
      })
    })
  })

  describe('output gates (examples)', () => {
    it('Should_ForceMachineMode_When_AnyKnownToolVariableIsSet', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ toolVars: { CLAUDECODE: '1' } }))).mode).toBe('machine')
      expect(Result.getOrThrow(resolveMode(ttyInput({ toolVars: { CODEX_SANDBOX: '1' } }))).mode).toBe('machine')
    })

    it('Should_EnableProgressBar_When_HumanModeOnTty', () => {
      expect(isProgressEnabled(Result.getOrThrow(resolveMode(ttyInput())))).toBe(true)
      expect(isProgressEnabled(Result.getOrThrow(resolveMode({ stdoutIsTTY: false })))).toBe(false)
      expect(isProgressEnabled(Result.getOrThrow(resolveMode({ stdoutIsTTY: false, text: true })))).toBe(false)
      expect(isProgressEnabled(Result.getOrThrow(resolveMode(ttyInput({ agent: '1' }))))).toBe(false)
    })

    it('Should_EnableColor_When_NoColorIsUnsetOrEmpty', () => {
      expect(isColorEnabled(Result.getOrThrow(resolveMode(ttyInput())), undefined)).toBe(true)
      expect(isColorEnabled(Result.getOrThrow(resolveMode(ttyInput())), '')).toBe(true)
    })

    it('Should_DisableColor_When_NoColorIsAnyNonEmptyValue', () => {
      expect(isColorEnabled(Result.getOrThrow(resolveMode(ttyInput())), '1')).toBe(false)
      expect(isColorEnabled(Result.getOrThrow(resolveMode(ttyInput())), '0')).toBe(false)
    })

    it('Should_DisableColor_When_MachineModeRegardlessOfNoColor', () => {
      expect(isColorEnabled(Result.getOrThrow(resolveMode(ttyInput({ agent: '1' }))), undefined)).toBe(false)
      expect(isColorEnabled(Result.getOrThrow(resolveMode({ stdoutIsTTY: false })), '')).toBe(false)
    })
  })
}

/**
 * The one impure adapter over `resolveMode` (U3): reads the process
 * environment so callers with no CLI-parsed flags — the library entry point,
 * the reporters — cannot drift into private copies of the probe and disagree
 * about the mode. Impure by nature: it reads `process.stdout.isTTY` and
 * `process.env`, and the pure decision (`resolveModeWorkflow`) stays downstream of
 * these reads.
 *
 * The tool-variable probe copies `TOOL_VARIABLES` from the environment onto
 * the command. The workflow interprets those fields; it does not read env.
 *
 * Probe I/O is `Cell.read` and the public resolve is `Cell.apply` — the
 * sandwich `Cell.read/decode/decide(Workflow.make)/encode/write`.
 */
export interface OutputModeProbe {
  readonly detectMode: Effect.Effect<ResolvedMode, CliError.CliError>
}

class OutputModeProbeTag extends Context.Service<OutputModeProbeTag, OutputModeProbe>()(
  '@systemfsoftware/stryker-js-cli/Output/OutputModeProbeTag',
) {}

const OutputModeProbe = OutputModeProbeTag

export { OutputModeProbe }

/**
 * The phases of the output-mode probe, in one bag so the chain's order is
 * carried by types. The command is the already-parsed flags (empty for the
 * probe); `read` gathers the environment and TTY signal into a `ModeInput`;
 * `decode` packages the workflow command; `resolveModeWorkflow` is the pure
 * decide phase; `encode` is the identity; `write` dispatches the outcome.
 */
interface ProbePhases extends Cell.Phases {
  readonly command: FormatFlags
  readonly raw: ModeInput
  readonly decoded: ResolveModeCommand
  readonly decision: ResolvedMode
  readonly decisionError: ModeConflictError
  readonly output: Result.Result<ResolvedMode, ModeConflictError>
  readonly response: ResolvedMode
  readonly decodeError: never
  readonly readError: never
  readonly writeError: ModeConflictError
}

const outputModeProbeDescription: Cell.WriteDone<ProbePhases> = pipe(
  Cell.read<ProbePhases>((command) =>
    Effect.succeed(
      (() => {
        const toolVarsRecord: Partial<Record<ToolVariable, string>> = {}
        for (const variable of TOOL_VARIABLES) {
          const value = process.env[variable]
          if (value !== undefined) {
            toolVarsRecord[variable] = value
          }
        }
        const envMode = process.env['STRYKER_MODE']
        const agent = process.env['AGENT']
        let result: ModeInput = {
          stdoutIsTTY: process.stdout.isTTY === true,
        }
        if (Object.keys(toolVarsRecord).length > 0) {
          result = { ...result, toolVars: toolVarsRecord }
        }
        if (envMode !== undefined) {
          result = { ...result, envMode }
        }
        if (agent !== undefined) {
          result = { ...result, agent }
        }
        if (command.text !== undefined) {
          result = { ...result, text: command.text }
        }
        if (command.json !== undefined) {
          result = { ...result, json: command.json }
        }
        return result
      })(),
    )
  ),
  Cell.decode<ProbePhases>((raw) =>
    Result.succeed(
      (() => {
        const filteredToolVars: Record<string, string> = {}
        if (raw.toolVars !== undefined) {
          for (const [key, value] of Object.entries(raw.toolVars)) {
            if (value !== undefined) {
              filteredToolVars[key] = value
            }
          }
        }
        let commandInput: {
          readonly stdoutIsTTY: boolean
          readonly text?: boolean
          readonly json?: boolean
          readonly envMode?: string
          readonly agent?: string
          readonly toolVars?: Record<string, string>
        } = {
          stdoutIsTTY: raw.stdoutIsTTY,
        }
        if (raw.text !== undefined) {
          commandInput = { ...commandInput, text: raw.text }
        }
        if (raw.json !== undefined) {
          commandInput = { ...commandInput, json: raw.json }
        }
        if (raw.envMode !== undefined) {
          commandInput = { ...commandInput, envMode: raw.envMode }
        }
        if (raw.agent !== undefined) {
          commandInput = { ...commandInput, agent: raw.agent }
        }
        if (Object.keys(filteredToolVars).length > 0) {
          commandInput = { ...commandInput, toolVars: filteredToolVars }
        }
        return ResolveModeCommand.make(commandInput)
      })(),
    )
  ),
  Cell.decide<ProbePhases>(resolveModeWorkflow),
  Cell.encode<ProbePhases>((outcome) => outcome),
  Cell.write<ProbePhases>((outcome) =>
    Result.match(outcome, {
      onFailure: (error) => Effect.fail(error),
      onSuccess: (mode) => Effect.succeed(mode),
    })
  ),
)

export const detectModeWithProbe = (flags: FormatFlags = {}): Effect.Effect<ResolvedMode, CliError.CliError> =>
  Cell.apply(outputModeProbeDescription, flags).pipe(
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

/**
 * Machine mode emits the U4 verdict envelope for a run that produced no
 * mutants and no report file: a `--survivors` run with zero survivors (AE3)
 * or a successful `--dryRunOnly` run that ended before the mutation
 * pipeline. The envelope carries a null score and an empty mutant list and is
 * written as the terminal `verdict` line of the stdout stream (U6), carrying
 * the run id the stream header already opened with (KTD11 — never a fresh
 * id). Human mode prints nothing (the sink drops in human mode).
 */
export function emitNullScoreVerdict(
  stream: RunEventStream,
  mode: ResolvedMode,
  thresholds: schema.Thresholds,
  config: object,
  basePath: string,
  pathService: Path.Path,
): Effect.Effect<void, never, never> {
  const report: schema.MutationTestResult = {
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

/**
 * Emits the machine-mode output from the run's finalizer — it runs on
 * success, failure and interruption alike (R30): a failed run writes the
 * `error` terminal event as the last line of the stdout stream; a successful
 * run whose only console output was the framework's help/version rendering
 * emits that captured document as the `help` terminal event, so `--help` in
 * machine mode never leaks an ANSI document. A successful run with an empty
 * buffer (the normal verdict path) emits nothing extra — the run already
 * wrote its terminal `verdict` line through the same module — unless the
 * stream is still open, which means the run never reached a verdict (the
 * `--dryRunOnly` early return): then a null-score `verdict` closes the
 * stream so the last stdout line is always a terminal event (R5).
 */
export function emitMachineModeOutput(
  stream: RunEventStream,
  mode: ResolvedMode,
  outcome: Result.Result<RunOk, RunOutcomeError>,
  basePath: string,
  pathService: Path.Path,
): Effect.Effect<void, never, never> {
  return Effect.gen(function*() {
    const captured = readCapturedConsole()
    if (Result.isSuccess(outcome)) {
      if (outcome.success.help) {
        yield* Queue.offer(
          stream.queue,
          HelpRendered.make({
            schemaVersion: STREAM_SCHEMA_VERSION,
            code: 0,
            help: captured,
          }),
        )
        return
      }
      if (captured.length > 0) {
        yield* Queue.offer(
          stream.queue,
          HelpRendered.make({
            schemaVersion: STREAM_SCHEMA_VERSION,
            code: 0,
            help: captured,
          }),
        )
        return
      }
      if (stream.isOpen()) {
        const defaults = yield* defaultOptions
        yield* emitNullScoreVerdict(stream, mode, defaults.thresholds, {}, basePath, pathService)
      }
      return
    }
    const envelope = shapeEnvelope(outcome.failure, captured)
    yield* Queue.offer(
      stream.queue,
      RunFailed.make({
        schemaVersion: envelope.schemaVersion,
        code: envelope.code,
        error: envelope.error,
        remediation: envelope.remediation,
      }),
    )
  })
}
