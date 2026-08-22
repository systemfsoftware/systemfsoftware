import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

import { noopLogger } from '@stryker-mutator/util'
import { Cell } from '@systemfsoftware/effect-cell-types'
import type { Mutant, PartialStrykerOptions, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { schema } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import { pipe } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import * as CliError from 'effect/unstable/cli/CliError'

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
import type { HelpRendered } from '@systemfsoftware/stryker-js-mutation-run/run-event'
import { strykerVersion } from '@systemfsoftware/stryker-js-mutation-run/stryker-package'
import { buildVerdictEnvelope } from '@systemfsoftware/stryker-js-mutation-run/verdict-envelope'

import { isColorEnabled, isProgressEnabled } from './OutputMode.js'
import type { OutputModeProbe } from './OutputModeAdapter.js'
import { machineConsoleLayer, readCapturedConsole } from './OutputModeConsoleState.js'
import type { RunEventStream, RunEventStreamPort } from './RunEventStreamAdapter.js'
import { STREAM_SCHEMA_VERSION } from './StreamProtocol.js'
import {
  admitSurvivorsRun,
  AdmitSurvivorsRunCommand,
  decodePriorReport,
  DEFAULT_SURVIVORS_PRIOR_REPORT,
  extractSurvivors,
  type HashContent,
  PriorReportFacts,
  priorSourceHashes,
  type ResolveAbsolutePath,
  sourceContentHash,
  survivorMutateSpans,
  type SurvivorsAdmission,
  SurvivorsRejection,
} from './Survivors.workflow.js'
import { SURVIVORS_REJECT_EXIT_CLASS } from './SurvivorsExit.js'

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
 * The mode probe the CLI resolves its mode with (U3): a single detection of
 * the environment, shared by the reporters. Borrowed from the port service
 * type so the handler never hand-writes a signature the port could drift from.
 */
export type DetectModeCapability = OutputModeProbe['detectMode']

/**
 * The run-event-stream factory a run executes with: opens a run's NDJSON
 * stream from the resolved mode. Borrowed from the port service type so the
 * executor never hand-writes a signature the port could drift from.
 */
export type CreateRunEventStreamCapability = RunEventStreamPort['createRunEventStream']

import { CliRequest } from './cli-request.schema.js'

/**
 * The frame the handler hands the executor: the already-run `@effect/cli`
 * program, the parsed request, the resolved mode, the optional run, the exit
 * recorder — and the raw argument tokens, which the error envelope names the
 * offending argument from when the framework reports one it does not know.
 */
export interface RunStrykerCliInput {
  readonly program: Effect.Effect<void, CliError.CliError, never>
  readonly requestRef: Ref.Ref<Option.Option<CliRequest>>
  readonly mode: ResolvedMode
  readonly runMutationTest: StrykerRun | undefined
  readonly recordExitCode: (code: number) => void
  readonly argv: readonly string[]
}
/**
 * The machine-mode `Console` layer, bundled so the transport (which resolves
 * the mode) can provide it without importing the state cell. Human mode
 * provides no layer — effect's own default console is the prose rendering
 * (OutputModeConsoleState.ts).
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
 * The phases of the survivors admission, in one bag so the chain's order is
 * carried by types: resolve and read (config, prior report, source hashes),
 * package the workflow input, call the admission workflow, shape nothing, and
 * dispatch the outcome to the write. A rejection is the decide phase's
 * `Left` — an outcome, not a fault — so it travels through `encode` into the
 * write, which fails the run with it.
 */
interface AdmissionPhases extends Cell.Phases {
  readonly command: PartialStrykerOptions
  readonly raw: {
    readonly resolvedOptions: StrykerOptions
    /**
     * The prior report exactly as it came off disk, undecoded. `undefined` means no
     * report was there to read; a value that is present but malformed is the decode
     * phase's problem, not the read's, so nothing validates it here.
     */
    readonly priorReportRaw: unknown
    readonly priorReportFound: boolean
    readonly priorReportPath: string
    readonly sourceContentHashes: Readonly<Record<string, string>>
  }
  readonly decoded: AdmitSurvivorsRunCommand
  readonly decision: SurvivorsAdmission
  readonly decisionError: SurvivorsRejection
  readonly output: Result.Result<SurvivorsAdmission, SurvivorsRejection>
  readonly response: unknown
  /**
   * A prior report that is present but does not decode. Fatal by construction: a decode
   * `Left` reaches the derived error channel and no write runs, so a malformed report
   * stops the run instead of being classified as a mismatch by the decider.
   */
  readonly decodeError: S.SchemaError
  readonly readError: never
  readonly writeError: SurvivorsRejection
  readonly readContext: never
  readonly writeContext: never
}

/** The run context the admission's write phase dispatches on, threaded beside the decision. */
interface AdmissionRunContext {
  readonly resolvedOptions: StrykerOptions
  readonly priorReportPath: string
}

/**
 * The survivors admission, as a description whose phases chain by type and
 * read in the order they run. The read gathers the admission's whole input
 * product — resolved options, prior report and the current source hashes —
 * across its interior and stashes the shell context the write dispatches on
 * into the executor-owned `runContext` ref; `decode` packages exactly the
 * workflow input; `admitSurvivorsRun` is the decide phase; `encode` is the
 * identity because write receives the outcome as-is; the write reads the
 * stashed context back and dispatches the decision to the verdict/run,
 * failing the run with a rejection.
 */
const survivorsAdmissionDescription = (
  runMutationTest: StrykerRun,
  stream: RunEventStream,
  mode: ResolvedMode,
  runContext: Ref.Ref<AdmissionRunContext | undefined>,
): Cell.WriteDone<AdmissionPhases> =>
  pipe(
    Cell.read<AdmissionPhases>((cliOptions) =>
      Effect.promise(() => resolveSurvivorsRunOptions(cliOptions)).pipe(
        Effect.flatMap((resolvedOptions) => {
          const priorReportPath = priorReportPathOf(resolvedOptions)
          const read = readPriorReport(priorReportPath)
          return Ref.set(runContext, { resolvedOptions, priorReportPath }).pipe(
            Effect.as({
              resolvedOptions,
              priorReportRaw: read.raw,
              priorReportFound: read.found,
              priorReportPath,
              sourceContentHashes: currentSourceHashesFor(priorReportFileKeys(read.raw)),
            }),
          )
        }),
      )
    ),
    /**
     * The one place the prior report is decoded, and the one place the two capabilities
     * are applied. A report that was never there yields a command with no facts, which
     * the decider rejects as `no-report`; a report that was there and does not decode
     * yields a `Left`, which stops the run before the decider sees it.
     */
    Cell.decode<AdmissionPhases>(({ resolvedOptions, priorReportRaw, priorReportFound, sourceContentHashes }) => {
      if (!priorReportFound) {
        return Result.succeed(
          AdmitSurvivorsRunCommand.make({
            priorReport: undefined,
            currentConfig: resolvedOptions,
            frameworkVersion: strykerVersion,
            sourceContentHashes,
            priorSourceHashes: {},
            priorSurvivors: [],
          }),
        )
      }
      return Result.map(decodePriorReport(priorReportRaw), (document) =>
        AdmitSurvivorsRunCommand.make({
          priorReport: PriorReportFacts.make({
            config: document.config ?? {},
            frameworkVersion: document.framework?.version,
          }),
          currentConfig: resolvedOptions,
          frameworkVersion: strykerVersion,
          sourceContentHashes,
          priorSourceHashes: priorSourceHashes(document, hashContent),
          priorSurvivors: extractSurvivors(document, resolveAbsolutePath),
        }))
    }),
    Cell.decide<AdmissionPhases>(admitSurvivorsRun),
    Cell.encode<AdmissionPhases>((outcome) => outcome),
    Cell.write<AdmissionPhases>((outcome) =>
      Effect.flatMap(Ref.get(runContext), (context) => {
        // The chain runs read before write, so the read has stashed the
        // context by the time the write dispatches; an absent one is a
        // chain-order violation, never a run outcome.
        if (context === undefined) {
          return Effect.die('the survivors admission read must run before its write')
        }
        const { resolvedOptions, priorReportPath } = context
        return Result.match(outcome, {
          onSuccess: (decision) =>
            Match.value(decision).pipe(
              Match.tag(
                'NoSurvivors',
                () => Effect.sync(() => emitEmptySurvivorsVerdict(stream, mode, resolvedOptions)),
              ),
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
          onFailure: (rejection) => Effect.fail(rejection),
        })
      })
    ),
  )

/**
 * The `--survivors` request: re-test exactly the prior report's survivor set.
 * The survivors flag was parsed as a boolean; the admission decides between
 * running the survivors and the plain pipeline. The chain's order is carried by
 * the description's phase types; the run's resolved context cell is created
 * here, beside the description it feeds.
 *
 * Two failures reach the caller, and they are not the same thing. A rejection is the
 * decision's own outcome — the run was inspected and refused. A `SchemaError` is a prior
 * report that was present and did not decode, which stops the chain before any decision
 * is made; it is in this signature because the phase types put it there, not because the
 * admission chose it.
 */
function runSurvivorsAdmission(
  runMutationTest: StrykerRun,
  stream: RunEventStream,
  mode: ResolvedMode,
  cliOptions: PartialStrykerOptions,
): Effect.Effect<unknown, S.SchemaError | SurvivorsRejection, never> {
  return Effect.gen(function*() {
    const admissionContext = yield* Ref.make<AdmissionRunContext | undefined>(undefined)
    return yield* Cell.apply(
      survivorsAdmissionDescription(runMutationTest, stream, mode, admissionContext),
      cliOptions,
    )
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

/** A prior report as it came off disk: whether a file was there, and what it held. */
interface PriorReportRead {
  readonly found: boolean
  readonly raw: unknown
}

/**
 * Reads the prior report without validating it. Absence and malformation are different
 * outcomes and the caller must be able to tell them apart: an absent report is the
 * `no-report` rejection the decider states, while a present-but-malformed one is a decode
 * failure that stops the run. Text that is not JSON is reported as found, carrying the
 * text itself, so the codec refuses it and names what it got.
 */
function readPriorReport(priorReportPath: string): PriorReportRead {
  let text: string
  try {
    text = readFileSync(priorReportPath, 'utf-8')
  } catch {
    return { found: false, raw: undefined }
  }
  try {
    return { found: true, raw: JSON.parse(text) }
  } catch {
    return { found: true, raw: text }
  }
}

/**
 * The relative file names a report claims, read structurally rather than through the
 * codec because the current sources must be hashed before the report is decoded — the
 * read phase does the disk I/O, and the keys are what tell it which files to read. An
 * unrecognisable report yields no keys and is refused a phase later by the codec.
 */
function priorReportFileKeys(raw: unknown): readonly string[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return []
  if (!('files' in raw)) return []
  const files = raw.files
  if (typeof files !== 'object' || files === null || Array.isArray(files)) return []
  return Object.keys(files)
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
 * The per-file content hashes of the current sources, keyed by the relative file names
 * the prior report uses — the current side of the admission comparison. The prior side is
 * hashed from the sources the report embeds, in the decode phase.
 */
function currentSourceHashesFor(files: readonly string[]): Record<string, string> {
  const hashes: Record<string, string> = {}
  for (const file of files) {
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
    if (CliError.isCliError(value)) {
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
      if (S.is(SurvivorsRejection)(value)) {
        return value.remediation
      }
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
 * The argument the framework reports it does not know, named the way the wire
 * contract spells it. The v4 parser fails wrapped in a ShowHelp whose errors
 * carry the offending flag or operand; when the unrecognized flag was given a
 * separate value (`--format text`), the value is the token the old parser
 * reported, so the token after the flag is named when one was given.
 */
function unrecognizedArgumentOf(exit: Exit.Exit<unknown, unknown>, argv: readonly string[]): string | undefined {
  if (!Exit.isFailure(exit)) {
    return undefined
  }
  const value = failureValue(exit)
  if (value === undefined || !CliError.isCliError(value)) {
    return undefined
  }
  const errors = S.is(CliError.ShowHelp)(value) ? value.errors : [value]
  for (const error of errors) {
    if (S.is(CliError.UnrecognizedOption)(error)) {
      const at = argv.indexOf(error.option)
      const next = at >= 0 ? argv[at + 1] : undefined
      return next !== undefined && !next.startsWith('-') ? next : error.option
    }
    if (S.is(CliError.UnexpectedArgument)(error)) {
      return error.arguments[0]
    }
    if (S.is(CliError.UnknownSubcommand)(error)) {
      return error.subcommand
    }
  }
  return undefined
}

/**
 * The first typed error in the exit's cause. The framework fails with
 * `Cause.fail` (usage errors); the run handler is `Effect.promise`, whose
 * rejected promises surface as *defects* (`Die` reasons) rather than
 * failures — so stryker's own ConfigError/StrykerError values arrive there
 * and must be read from the cause's `Die` reasons.
 */
function failureValue(exit: Exit.Exit<unknown, unknown>): unknown {
  if (!Exit.isFailure(exit)) {
    return undefined
  }
  const failure = Cause.findErrorOption(exit.cause)
  if (Option.isSome(failure)) {
    return failure.value
  }
  const dieReason = exit.cause.reasons.find(Cause.isDieReason)
  return dieReason === undefined ? undefined : dieReason.defect
}

function buildErrorEnvelope(
  exit: Exit.Exit<unknown, unknown>,
  code: number,
  captured: string,
  argv: readonly string[],
): ErrorEnvelope {
  // An unrecognized argument is the wire contract's own message, not the
  // framework's usage document: the document is what --help is for.
  const unrecognized = unrecognizedArgumentOf(exit, argv)
  return {
    schemaVersion: STREAM_SCHEMA_VERSION,
    code,
    error: unrecognized !== undefined
      ? `Received unknown argument: '${unrecognized}'`
      : captured.length > 0
      ? captured
      : describeFailure(exit),
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
  argv: readonly string[],
): void {
  const captured = readCapturedConsole()
  // A clean help request fails the effect (the runner rethrows the ShowHelp)
  // while exiting 0 and carrying the rendered document in the capture: it is
  // the help terminal event, not an error.
  const value = failureValue(exit)
  const helpShaped = Exit.isFailure(exit) && S.is(CliError.ShowHelp)(value) && value.errors.length === 0
  if (helpShaped) {
    const document: HelpRendered = {
      kind: 'help',
      schemaVersion: STREAM_SCHEMA_VERSION,
      code: 0,
      help: captured,
    }
    stream.sink(document)
    return
  }
  if (Exit.isFailure(exit)) {
    stream.sink({ kind: 'error', ...buildErrorEnvelope(exit, code, captured, argv) })
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
  for (const reason of cause.reasons) {
    const candidate = Cause.isFailReason(reason)
      ? reason.error
      : Cause.isDieReason(reason)
      ? reason.defect
      : undefined
    if (
      candidate !== undefined && (candidate instanceof ConfigError || retrieveCause(candidate) instanceof ConfigError)
    ) {
      return true
    }
  }
  return false
}

/**
 * Classifies a failed run for the finalizer: usage/parse failures
 * (`CliError` — except a bare help request, which exits 0), rejected
 * survivors runs (`SurvivorsRejection`) and a rejected config (`ConfigError`)
 * all exit 2, all other failures exit 1 (the framework's default). A
 * successful run exits 0; the verdict gates (U5) then resolve the final
 * classed code.
 */
function resolveCliExitCode(exit: Exit.Exit<unknown, unknown>): number {
  if (Exit.isSuccess(exit)) {
    return 0
  }
  if (Cause.hasInterruptsOnly(exit.cause)) {
    return 1
  }
  const failure = Cause.findErrorOption(exit.cause)
  if (Option.isSome(failure)) {
    const value = failure.value
    if (S.is(CliError.ShowHelp)(value)) {
      // An explicit help request (bare `stryker`, `--help`) rendered the
      // usage document into the capture buffer and exits 0; a parse failure
      // the runner wrapped into ShowHelp exits 2.
      return value.errors.length > 0 ? 2 : 0
    }
    if (CliError.isCliError(value)) {
      return 2
    }
    if (S.is(SurvivorsRejection)(value)) {
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
  createRunEventStream: CreateRunEventStreamCapability,
): Effect.Effect<number, never, never> =>
  Effect.gen(function*() {
    const stream = yield* createRunEventStream(input.mode)
    const runMutationTest = input.runMutationTest ?? defaultRunMutationTest(hostOptionsOf(input.mode, stream))

    // The signal and last-signal cells both the signal handler and the
    // finalizer write and read across fiber boundaries. Function-local: the
    // stream and every cell die with the run.
    let currentFiber: Fiber.Fiber<unknown, unknown> | null = null
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
        currentFiber.interruptUnsafe(currentFiber.id)
      }
    }

    const dispatch = (request: CliRequest): Effect.Effect<unknown, S.SchemaError | SurvivorsRejection, never> =>
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
        currentFiber = Fiber.getCurrent() ?? null
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
          emitMachineModeOutput(stream, input.mode, exit, code, input.argv)
        }
        yield* stream.closeAndDrain
        return code
      })
    )
  })
