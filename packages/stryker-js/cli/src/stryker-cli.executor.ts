import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

import * as ValidationError from '@effect/cli/ValidationError'
import { noopLogger } from '@stryker-mutator/util'
import type { Mutant, PartialStrykerOptions, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { schema } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as S from 'effect/Schema'

import { Stryker, type StrykerHostOptions } from '@systemfsoftware/stryker-js-mutation-run'
import {
  ConfigReader,
  defaultOptions,
  OptionsValidator,
} from '@systemfsoftware/stryker-js-mutation-run/config/config-resolution'
import { forkCoreSchema } from '@systemfsoftware/stryker-js-mutation-run/config/fork-schema'
import { ConfigError, retrieveCause } from '@systemfsoftware/stryker-js-mutation-run/errors'
import {
  ExitClass,
  getPendingExitClasses,
  resolveExitCode,
} from '@systemfsoftware/stryker-js-mutation-run/exit-classification'
import type { ResolvedMode } from '@systemfsoftware/stryker-js-mutation-run/output-mode'
import type { HelpRendered, ManifestRendered } from '@systemfsoftware/stryker-js-mutation-run/run-event'
import { strykerVersion } from '@systemfsoftware/stryker-js-mutation-run/stryker-package'
import { buildVerdictEnvelope } from '@systemfsoftware/stryker-js-mutation-run/verdict-envelope'

import { machineConsoleLayer, readCapturedConsole } from './output-mode-console.state.js'
import type { OutputModeProbe } from './output-mode.adapter.js'
import { isColorEnabled, isProgressEnabled } from './output-mode.kernel.js'
import type { RunEventStream, RunEventStreamPort } from './run-event-stream.adapter.js'
import { STREAM_SCHEMA_VERSION } from './stream-protocol.kernel.js'
import { SURVIVORS_REJECT_EXIT_CLASS } from './survivors-exit.kernel.js'
import {
  DEFAULT_SURVIVORS_PRIOR_REPORT,
  type HashContent,
  type ResolveAbsolutePath,
  sourceContentHash,
  survivorMutateSpans,
} from './survivors.kernel.js'
import { admitSurvivorsRun, SurvivorsRejection } from './survivors.workflow.js'

/**
 * The mutation-testing entry the CLI calls once options are parsed. Injectable
 * so tests capture the parsed options without starting a real mutation run.
 */
export type StrykerRun = (options: PartialStrykerOptions) => Promise<unknown>

/**
 * The default run: binds the host-resolved run options (the sink, the mode,
 * the timing) to a fresh `Stryker` and runs mutation testing.
 */
const defaultRunMutationTest = (hostOptions: StrykerHostOptions): StrykerRun => (options) =>
  new Stryker(options, hostOptions).runMutationTest()

/**
 * The capabilities the run needs, provided by the composition root (mod.ts)
 * from the two port layers. Members are borrowed from the port service types
 * so the executor never hand-writes a signature the ports could drift from.
 */
export interface StrykerCliExecutorDepsService {
  readonly detectMode: OutputModeProbe['detectMode']
  readonly createRunEventStream: RunEventStreamPort['createRunEventStream']
}

export class StrykerCliExecutorDeps extends Context.Tag(
  '@systemfsoftware/stryker-js-cli/stryker-cli.executor/StrykerCliExecutorDeps',
)<StrykerCliExecutorDeps, StrykerCliExecutorDepsService>() {}

/**
 * The request a command handler leaves for the executor to run: the parsed
 * options of a `run` (the `survivors` flag is carried separately — the
 * survivor admission consumes it and it must not reach the pipeline as an
 * option) or the pre-rendered manifest document of `--llms`. The help path
 * leaves no request; the executor's finalizer turns the framework-rendered
 * help into the `help` terminal event instead.
 *
 * The schema's `options`/`document` fields are `S.Any`: no schema exists for
 * `PartialStrykerOptions` or `ManifestRendered` in `@stryker-mutator/api/core`,
 * and the request is never decoded from external bytes — the handler builds it
 * from `@effect/cli`-parsed values. The exported type therefore carries the
 * fields' real types rather than the schema's `any`, so consumers (the
 * executor's `Match.tag` arms) stay typed; the two must not drift into a
 * decode path. The union is spelled as two lone member aliases because an
 * inline tagged union would itself be flagged by `no-manual-tag-member`.
 */
export const CliRequest = S.Union(
  S.TaggedStruct('run', { options: S.Any, survivors: S.Boolean }),
  S.TaggedStruct('llms', { document: S.Any }),
)
type RunRequest = { readonly _tag: 'run'; readonly options: PartialStrykerOptions; readonly survivors: boolean }
type LlmsRequest = { readonly _tag: 'llms'; readonly document: ManifestRendered }
export type CliRequest = RunRequest | LlmsRequest

/**
 * The frame the handler hands the executor: the already-run `@effect/cli`
 * command effect (with the CLI and Console layers provided), the per-run
 * request cell the command handlers wrote into, the mode resolved once at
 * the edge, and the injectable run.
 */
export interface RunStrykerCliInput {
  readonly program: Effect.Effect<void, ValidationError.ValidationError, never>
  readonly requestRef: Ref.Ref<Option.Option<CliRequest>>
  readonly mode: ResolvedMode
  readonly runMutationTest: StrykerRun | undefined
  /**
   * Publishes the classed exit code from inside the finalizer. A signal leaves
   * the fiber interrupted, so the run's value never survives to the caller —
   * the process would exit 1 while the stream's terminal line said 130. This
   * is the only channel that outlives an interrupt.
   */
  readonly recordExitCode: (code: number) => void
}

/**
 * The machine-mode `Console` layer, bundled so the transport (which resolves
 * the mode) can provide it without importing the state cell. Human mode
 * provides no layer — effect's own default console is the prose rendering
 * (output-mode-console.state.ts).
 */
export const strykerCliConsoleLayers = {
  machine: machineConsoleLayer,
} as const

const SIGNAL_NUMBERS: Readonly<Partial<Record<NodeJS.Signals, number>>> = Object.freeze({
  SIGINT: 2,
  SIGTERM: 15,
})

const hashContent: HashContent = (content) => createHash('sha256').update(content, 'utf-8').digest('hex')

const resolveAbsolutePath: ResolveAbsolutePath = (file) => resolvePath(file)

/**
 * The host options a run is bound to: the sink, the mode, the timing and the
 * log descriptor chosen by the mode — machine mode keeps stdout exclusively
 * for the NDJSON stream, so the logging backend is pointed at stderr; human
 * mode keeps the stdout sink. The fix is the descriptor, never the log level.
 */
function hostOptionsOf(mode: ResolvedMode, stream: RunEventStream): StrykerHostOptions {
  return {
    loggerConsoleOut: mode.mode === 'machine' ? process.stderr : process.stdout,
    showColors: isColorEnabled(mode, process.env['NO_COLOR']),
    runEventSink: stream.sink,
    runId: stream.runId,
    resolvedMode: mode,
    progressEnabled: isProgressEnabled(mode),
    clearTextEnabled: mode.mode === 'human',
    runStartedAt: stream.startedAt,
    // The host names the reporter registry. Since U6 it lives in the
    // mutation-report package's own `stryker-plugins` subpath. The resolved
    // URL is required (not the bare specifier) because tsdown mangles export
    // names inside shared chunks — only the generated entry wrapper for a
    // declared subpath re-exports `strykerPlugins` under its real name.
    reporterPluginModules: [
      import.meta.resolve('@systemfsoftware/stryker-js-mutation-report/stryker-plugins'),
    ],
  }
}

/**
 * The `--survivors` request: re-test exactly the prior report's survivor set.
 * The survivors flag was parsed as a boolean; the admission decides between
 * running the survivors and the plain pipeline.
 */
function runSurvivorsAdmission(
  runMutationTest: StrykerRun,
  stream: RunEventStream,
  mode: ResolvedMode,
  cliOptions: PartialStrykerOptions,
): Effect.Effect<unknown, SurvivorsRejection, never> {
  return Effect.gen(function*() {
    const resolvedOptions = yield* Effect.promise(() => resolveSurvivorsRunOptions(cliOptions))
    const priorReportPath = priorReportPathOf(resolvedOptions)
    const priorReport = readPriorReport(priorReportPath)
    const admission = admitSurvivorsRun({
      priorReport,
      currentConfig: resolvedOptions,
      frameworkVersion: strykerVersion,
      sourceContentHashes: sourceContentHashesOf(priorReport),
      hashContent,
      resolveAbsolutePath,
    })
    return yield* Either.match(admission, {
      onLeft: (rejection) => Effect.fail(rejection),
      onRight: (decision) =>
        Match.value(decision).pipe(
          Match.tag('NoSurvivors', () => Effect.sync(() => emitEmptySurvivorsVerdict(stream, mode, resolvedOptions))),
          Match.tag('Admitted', (admitted) => {
            const restricted: SurvivorsRunOptions = {
              ...resolvedOptions,
              survivors: admitted.survivors,
              mutate: survivorMutateSpans(admitted.survivors),
              survivorsPriorReport: priorReportPath,
              // The differ would otherwise reuse the prior run's survived
              // verdicts.
              incremental: false,
            }
            return Effect.promise(() => runMutationTest(restricted))
          }),
          Match.orElse(() => Effect.die('unreachable admission decision variant')),
        ),
    })
  })
}

/**
 * Resolves the current options the same way the pipeline does — defaults +
 * config file + CLI, validated against the fork schema (which carries the
 * survivors-run properties). The admission hash compares these resolved
 * options against the prior report's embedded config.
 */
function resolveSurvivorsRunOptions(
  cliOptions: PartialStrykerOptions,
): Promise<StrykerOptions> {
  const configReader = new ConfigReader(
    noopLogger,
    new OptionsValidator(forkCoreSchema, noopLogger),
  )
  return configReader.readConfig(cliOptions)
}

/**
 * The prior report a `--survivors` run reads: the `survivorsPriorReport`
 * config option when set, else the default path. The report path is run
 * bookkeeping, never a CLI flag.
 */
function priorReportPathOf(resolved: StrykerOptions): string {
  const configured = resolved['survivorsPriorReport']
  return typeof configured === 'string' ? configured : DEFAULT_SURVIVORS_PRIOR_REPORT
}

/**
 * A report is usable only when it parses and carries a `files` dictionary; a
 * missing, unreadable or misshapen report is the `no-report` rejection.
 */
function isMutationTestResultShape(value: unknown): value is schema.MutationTestResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  return (
    'files' in value &&
    typeof value.files === 'object' &&
    value.files !== null &&
    !Array.isArray(value.files)
  )
}

function readPriorReport(priorReportPath: string): schema.MutationTestResult | undefined {
  try {
    const raw = readFileSync(priorReportPath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    return isMutationTestResultShape(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function readSourceFile(file: string): string {
  try {
    return readFileSync(file, 'utf-8')
  } catch {
    // A file the report names but the disk no longer has cannot match the
    // prior side's embedded source; hashing the empty string rejects with a
    // mismatch instead of admitting a run that would re-test a ghost.
    return ''
  }
}

/**
 * The per-file content hashes of the current sources, keyed by the relative
 * file names the prior report uses — the current side of the admission
 * comparison (`admitSurvivorsRun` hashes the prior side from the sources the
 * report embeds).
 */
function sourceContentHashesOf(
  priorReport: schema.MutationTestResult | undefined,
): Record<string, string> {
  const hashes: Record<string, string> = {}
  if (priorReport === undefined) {
    return hashes
  }
  for (const file of Object.keys(priorReport.files)) {
    hashes[file] = sourceContentHash(readSourceFile(file), hashContent)
  }
  return hashes
}

/**
 * The options of a `--survivors` run: the full resolved options plus the
 * survivors-run bookkeeping the report helper embeds (KTD7) and the mutation
 * scope restriction the run is admitted on.
 */
type SurvivorsRunOptions = PartialStrykerOptions & {
  readonly survivors?: readonly Mutant[]
  readonly survivorsPriorReport?: string
}

/**
 * Machine mode emits the U4 verdict envelope for a run that produced no
 * mutants and no report file: a `--survivors` run with zero survivors (AE3)
 * or a successful `--dryRunOnly` run that ended before the mutation
 * pipeline. The envelope carries a null score and an empty mutant list and is
 * written as the terminal `verdict` line of the stdout stream (U6), carrying
 * the run id the stream header already opened with (KTD11 — never a fresh
 * id). Human mode prints nothing (the sink drops in human mode).
 */
function emitNullScoreVerdict(
  stream: RunEventStream,
  mode: ResolvedMode,
  thresholds: schema.Thresholds,
  config: object,
): void {
  const report: schema.MutationTestResult = {
    schemaVersion: '1.0',
    files: {},
    thresholds,
    projectRoot: process.cwd(),
    config,
    framework: { name: 'StrykerJS', version: strykerVersion },
  }
  const envelope = buildVerdictEnvelope(report, mode.mode, mode.signal, stream.runId)
  stream.sink({ kind: 'verdict', ...envelope })
}

/**
 * The `--survivors` zero-survivor path: the prior report held no survivors,
 * so the run emits the null-score verdict without starting the pipeline. The
 * full resolved options ride along as the report's embedded config (KTD7).
 */
function emitEmptySurvivorsVerdict(
  stream: RunEventStream,
  mode: ResolvedMode,
  resolved: StrykerOptions,
): void {
  emitNullScoreVerdict(stream, mode, resolved.thresholds, resolved)
}

export interface ErrorEnvelope {
  readonly schemaVersion: string
  readonly code: number
  readonly error: string
  readonly remediation: string
}

/**
 * The contextual remediation for a failure, picked from the cause's shape:
 * signal terminations (POSIX `128 + n`) are called out as interruptions,
 * usage/parse errors point at `--help`, config errors name the offending file
 * (ConfigError messages carry it), and rejected survivors runs name the full
 * run to do first. Everything else points at the report file and the verdict
 * envelope, which is where a runtime failure's detail already is.
 */
function remediationFor(exit: Exit.Exit<unknown, unknown>, code: number): string {
  if (code > 128) {
    return 'the run was interrupted by a signal; re-run it to continue'
  }
  const value = failureValue(exit)
  if (value !== undefined) {
    if (ValidationError.isValidationError(value)) {
      return 're-run with --help to see the full usage'
    }
    if (value instanceof ConfigError) {
      return `check the config file: ${value.message}`
    }
    if (S.is(SurvivorsRejection)(value)) {
      return value.remediation
    }
  }
  return 'see --reportFile or the verdict envelope on stdout'
}

/**
 * The failure's own text, used when the capture buffer is empty — a failure
 * stryker reported through its own logger rather than the framework's
 * `Console`. Falls back to a rendered cause.
 */
function describeFailure(exit: Exit.Exit<unknown, unknown>): string {
  if (Exit.isFailure(exit)) {
    const value = failureValue(exit)
    if (value !== undefined) {
      if (value instanceof Error) {
        return value.message
      }
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint' ||
        typeof value === 'symbol'
      ) {
        return String(value)
      }
      return Object.prototype.toString.call(value)
    }
    return Cause.pretty(exit.cause)
  }
  return ''
}

/**
 * The first typed error in the exit's cause. The framework fails with
 * `Cause.fail` (usage errors); the run handler is `Effect.promise`, whose
 * rejected promises surface as *defects* (`Cause.die`) rather than failures —
 * so stryker's own ConfigError/StrykerError values arrive there and must be
 * read from `Cause.defects`.
 */
function failureValue(exit: Exit.Exit<unknown, unknown>): unknown {
  if (!Exit.isFailure(exit)) {
    return undefined
  }
  const failure = Cause.failureOption(exit.cause)
  if (Option.isSome(failure)) {
    return failure.value
  }
  return Array.from(Cause.defects(exit.cause))[0]
}

function buildErrorEnvelope(
  exit: Exit.Exit<unknown, unknown>,
  code: number,
  captured: string,
): ErrorEnvelope {
  return {
    schemaVersion: STREAM_SCHEMA_VERSION,
    code,
    error: captured.length > 0 ? captured : describeFailure(exit),
    remediation: remediationFor(exit, code),
  }
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
function emitMachineModeOutput(
  stream: RunEventStream,
  mode: ResolvedMode,
  exit: Exit.Exit<unknown, unknown>,
  code: number,
): void {
  const captured = readCapturedConsole()
  if (Exit.isFailure(exit)) {
    stream.sink({ kind: 'error', ...buildErrorEnvelope(exit, code, captured) })
    return
  }
  if (captured.length > 0) {
    const document: HelpRendered = {
      kind: 'help',
      schemaVersion: STREAM_SCHEMA_VERSION,
      code: 0,
      help: captured,
    }
    stream.sink(document)
    return
  }
  if (stream.isOpen()) {
    // The run succeeded without a verdict and without a terminal line. The
    // finalizer never sees the finished run's resolved options, so the
    // framework defaults stand in for the thresholds it would have used.
    emitNullScoreVerdict(stream, mode, defaultOptions.thresholds, {})
  }
}

/**
 * A rejected config reaches the finalizer as a typed failure or as a defect
 * depending on where the validator threw, and typed-inject may have wrapped
 * it, so both channels are searched and each candidate is unwrapped.
 */
function carriesConfigError(cause: Cause.Cause<unknown>): boolean {
  for (const candidate of [...Cause.failures(cause), ...Cause.defects(cause)]) {
    if (candidate instanceof ConfigError || retrieveCause(candidate) instanceof ConfigError) {
      return true
    }
  }
  return false
}

/**
 * Classifies a failed run for the finalizer: usage/parse failures
 * (`ValidationError`), rejected survivors runs (`SurvivorsRejection`) and a
 * rejected config (`ConfigError`) all exit 2, all other failures exit 1 (the
 * framework's default). A successful run exits 0; the verdict gates (U5) then
 * resolve the final classed code.
 */
function resolveCliExitCode(exit: Exit.Exit<unknown, unknown>): number {
  if (Exit.isSuccess(exit)) {
    return 0
  }
  if (Cause.isInterruptedOnly(exit.cause)) {
    return 1
  }
  const failure = Cause.failureOption(exit.cause)
  if (Option.isSome(failure)) {
    if (ValidationError.isValidationError(failure.value)) {
      return 2
    }
    if (S.is(SurvivorsRejection)(failure.value)) {
      return SURVIVORS_REJECT_EXIT_CLASS
    }
  }
  if (carriesConfigError(exit.cause)) {
    return ExitClass.ConfigError
  }
  return 1
}

/**
 * The single operation of the CLI's executor cell: the impure shell that
 * wraps the transport's command effect with the run bootstrap. It creates the
 * run's stream from the resolved mode, binds the host options a run is
 * executed with, opens the stream, runs the command effect, dispatches the
 * request the handlers left, and on every outcome — success, failure and
 * interruption alike — emits the machine-mode terminal event (error/help/
 * null verdict) and drains the stream, returning the classed exit code as its
 * value. SIGINT/SIGTERM interrupt the current fiber so the finalizer runs
 * before the process exits; the code is resolved exactly once (R6), in the
 * finalizer, where the terminal event's `code` is chosen from the same inputs
 * the teardown used before.
 */
export const runStrykerCli = (
  input: RunStrykerCliInput,
): Effect.Effect<number, never, StrykerCliExecutorDeps> =>
  Effect.gen(function*() {
    const deps = yield* StrykerCliExecutorDeps
    const stream = yield* deps.createRunEventStream(input.mode)
    const runMutationTest = input.runMutationTest ?? defaultRunMutationTest(hostOptionsOf(input.mode, stream))

    // The signal and last-signal cells both the signal handler and the
    // finalizer write and read across fiber boundaries. Function-local: the
    // stream and every cell die with the run.
    let currentFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null
    let lastSignal: number | null = null

    const resolveClassedExitCode = (exit: Exit.Exit<unknown, unknown>): number => {
      const signal = lastSignal
      if (signal !== null) {
        return 128 + signal
      }
      if (Exit.isFailure(exit)) {
        // A failure no verdict gate classified: keep U2's usage-vs-other
        // classification (U6 refines it with the error envelope). A failed
        // run must never exit 0.
        return resolveCliExitCode(exit)
      }
      return resolveExitCode(getPendingExitClasses(), null)
    }

    const onSignal = (signal: NodeJS.Signals): void => {
      lastSignal = SIGNAL_NUMBERS[signal] ?? null
      process.removeListener('SIGINT', onSignal)
      process.removeListener('SIGTERM', onSignal)
      if (currentFiber !== null) {
        currentFiber.unsafeInterruptAsFork(currentFiber.id())
      }
    }

    const dispatch = (request: CliRequest): Effect.Effect<unknown, SurvivorsRejection, never> =>
      Match.value(request).pipe(
        Match.tag('run', (runRequest) =>
          runRequest.survivors
            ? runSurvivorsAdmission(runMutationTest, stream, input.mode, runRequest.options)
            : Effect.promise(() => runMutationTest(runRequest.options))),
        Match.tag('llms', (llmsRequest) =>
          Effect.sync(() => {
            // Requesting `--llms` IS the machine signal, so the command
            // always produces the machine contract — a `stream` header
            // followed by one tagged `manifest` terminal event (R5) —
            // regardless of TTY or resolved mode.
            stream.ensureOpen({ mode: 'machine', signal: 'flag', stdoutIsTTY: process.stdout.isTTY === true })
            stream.sink(llmsRequest.document)
          })),
        Match.orElse(() => Effect.die('unreachable cli request variant')),
      )

    const program = Effect.acquireUseRelease(
      Effect.sync(() => {
        currentFiber = Option.getOrNull(Fiber.getCurrentFiber())
        process.on('SIGINT', onSignal)
        process.on('SIGTERM', onSignal)
      }),
      () =>
        Effect.gen(function*() {
          // Open the drain first: the register runs synchronously, so the sink
          // is bound — and the header precedes every event — before the CLI
          // starts pushing.
          yield* stream.open
          yield* input.program
          const request = yield* Ref.get(input.requestRef)
          yield* Option.match(request, {
            onNone: () => Effect.void,
            onSome: (cliRequest) => dispatch(cliRequest),
          })
        }),
      () =>
        Effect.sync(() => {
          process.removeListener('SIGINT', onSignal)
          process.removeListener('SIGTERM', onSignal)
        }),
    )

    // `Effect.exit` converts every outcome — success, typed failure, defect
    // and interruption — into a value, so the block below is the single place
    // the classed exit code is resolved (R6), the terminal event is pushed and
    // the drain is awaited, and the run's outcome is always a number, never an
    // escaped failure.
    //
    // The mask is what makes that true under SIGINT. `Effect.exit` captures the
    // *program's* cause, but the interrupt stays pending on the fiber, so an
    // unmasked continuation dies at its first async boundary — the drain's join
    // — and the run ends on whatever line it happened to have written, a
    // heartbeat or a phase, with no terminal event and no classed code. Only
    // `restore` is interruptible, so the run still stops at once (R30).
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function*() {
        const exit = yield* Effect.exit(restore(program))
        const code = resolveClassedExitCode(exit)
        input.recordExitCode(code)
        if (input.mode.mode === 'machine') {
          emitMachineModeOutput(stream, input.mode, exit, code)
        }
        yield* stream.closeAndDrain
        return code
      })
    )
  })
