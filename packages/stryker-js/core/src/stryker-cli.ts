import semver from 'semver'

guardMinimalNodeVersion()

import { readFileSync } from 'node:fs'

import * as Args from '@effect/cli/Args'
import * as CliConfig from '@effect/cli/CliConfig'
import * as Command from '@effect/cli/Command'
import * as HelpDoc from '@effect/cli/HelpDoc'
import * as Options from '@effect/cli/Options'
import * as ValidationError from '@effect/cli/ValidationError'
import * as FileSystem from '@effect/platform/FileSystem'
import * as Path from '@effect/platform/Path'
import * as Runtime from '@effect/platform/Runtime'
import * as Terminal from '@effect/platform/Terminal'
import type { LogLevel, PartialStrykerOptions, StrykerOptions } from '@stryker-mutator/api/core'
import { Mutant, schema } from '@stryker-mutator/api/core'
import { noopLogger } from '@stryker-mutator/util'
import * as Cause from 'effect/Cause'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import { forkCoreSchema } from './config/fork-schema.js'
import { ConfigReader, defaultOptions, OptionsValidator } from './config/index.js'
import { ConfigError, retrieveCause } from './errors.js'
import { emitLLMSManifest } from './llms-manifest.js'
import { toRelativeNormalizedFileName } from './mutants/incremental-differ.js'
import {
  admitSurvivorsRun,
  DEFAULT_SURVIVORS_PRIOR_REPORT,
  sourceContentHash,
  SURVIVORS_REJECT_EXIT_CLASS,
  SurvivorsRejection,
} from './mutants/survivors.js'
import {
  detectMode,
  humanConsoleLayer,
  isColorEnabled,
  isProgressEnabled,
  machineConsoleLayer,
  readCapturedConsole,
  type ResolvedMode,
} from './output-mode.js'
import { buildVerdictEnvelope } from './reporters/verdict-envelope.js'
import { createRunEventStream, type RunEventStream, STREAM_SCHEMA_VERSION } from './run-event-stream.js'
import type { HelpRendered, ManifestRendered } from './run-event.js'
import { strykerEngines, strykerVersion } from './stryker-package.js'
import { Stryker, type StrykerHostOptions } from './stryker.js'
import { ExitClass, getPendingExitClasses, resolveExitCode } from './utils/object-utils.js'

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
 * The run's stream, bound once by the terminating bootstrap. The command
 * tree's `--llms` handler and the teardown push their terminal events through
 * it; `ensureActiveStream` mints one on first use so a bare effect run
 * (tests) keeps working without a bootstrap.
 */
let activeStream: RunEventStream | null = null

/**
 * The mode the terminating bootstrap resolved once at the edge (R27). The
 * null-verdict path reads it instead of probing the terminal a second time;
 * the fallback keeps a bare effect run working without a bootstrap.
 */
let activeResolvedMode: ResolvedMode | null = null

function ensureActiveStream(): RunEventStream {
  activeStream ??= createRunEventStream(activeResolvedMode ?? detectMode())
  return activeStream
}

function createSplitter(separator: string) {
  return (value: string) => value.split(separator).filter(Boolean)
}

const splitOnComma = createSplitter(',')
const splitOnSpace = createSplitter(' ')

/**
 * Commander characterization: `always` stays a string, everything else is a
 * boolean where `false`/`0` (case-insensitively) mean `false` — a tri-state a
 * plain boolean or choice would flatten.
 */
function parseCleanDirOption(value: string): 'always' | boolean {
  const v = value.toLocaleLowerCase()
  return v === 'always' ? v : v !== 'false' && v !== '0'
}

/**
 * Commander characterization: a pure integer is parsed as a number, anything
 * else (e.g. `"50%"`) stays a string.
 */
function parseConcurrency(value: string): number | string {
  if (/^\d+$/.test(value)) {
    return parseInt(value, 10)
  }
  return value
}

const optional = <A>(option: Options.Options<A>) => Options.optional(option)

/**
 * Commander left an omitted flag out of the parsed options; `deepMerge` treats
 * `undefined` as absent but an explicit `false` would override a config-file
 * `true`. The framework's boolean defaults to `false` when absent, so map that
 * back to `undefined` (KTD4).
 */
const absentWhenFalse = (value: boolean): boolean | undefined => value ? true : undefined

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'off'] as const
const LOG_LEVEL_LOOKUP: Record<string, true> = {
  fatal: true,
  error: true,
  warn: true,
  info: true,
  debug: true,
  trace: true,
  off: true,
}

// The schema-generated StrykerOptions types the levels as the upstream's
// nominal `declare const enum LogLevel`, whose runtime values are exactly
// these strings; `Options.choice` already guarantees membership, so this guard
// re-types the parsed string at the boundary (the same pattern as
// `OptionsValidator.validate`'s assertion).
function isLogLevel(value: string): value is LogLevel {
  return LOG_LEVEL_LOOKUP[value] === true
}

function setLogLevel(
  target: PartialStrykerOptions,
  key: 'logLevel' | 'fileLogLevel',
  value: Option.Option<string> | string | undefined,
): void {
  const unwrapped = unwrap(value)
  if (unwrapped !== undefined && isLogLevel(unwrapped)) {
    target[key] = unwrapped
  }
}

const runOptions = {
  ignorePatterns: Options.text('ignorePatterns')
    .pipe(
      Options.withDescription(
        'A comma separated list of patterns used for specifying which files need to be ignored. This should only be used in cases where you experience a slow Stryker startup, because too many (or too large) files are copied to the sandbox that are not needed to run the tests. For example, image or movie directories. Note: This option will have NO effect when using the `--inPlace` option. The directories `node_modules`, `.git` and some others are always ignored. Example: `--ignorePatterns dist`. These patterns are ALWAYS ignored: [`node_modules`, `.git`, `/reports`, `*.tsbuildinfo`, `/stryker.log`, `.stryker-tmp`]. Because Stryker always ignores these, you should rarely have to adjust the `ignorePatterns` setting at all. This is useful to speed up Stryker by not copying over irrelevant files to the sandbox.',
      ),
      Options.map(splitOnComma),
      optional,
    ),
  ignoreStatic: Options.map(Options.boolean('ignoreStatic'), absentWhenFalse).pipe(
    Options.withDescription(
      'Ignore static mutants. Static mutants are mutants which are only executed during the loading of a file.',
    ),
  ),
  incremental: Options.map(Options.boolean('incremental'), absentWhenFalse).pipe(
    Options.withDescription(
      "Enable 'incremental mode'. Stryker will store results in a file and use that file to speed up the next --incremental run",
    ),
  ),
  allowEmpty: Options.map(Options.boolean('allowEmpty'), absentWhenFalse).pipe(
    Options.withDescription(
      'Allows stryker to exit without any errors in cases where no tests are found',
    ),
  ),
  incrementalFile: Options.text('incrementalFile')
    .pipe(
      Options.withDescription('Specify the file to use for incremental mode.'),
      optional,
    ),
  force: Options.map(Options.boolean('force'), absentWhenFalse).pipe(
    Options.withDescription(
      'Run all mutants, even if --incremental is provided and an incremental file exists. Can be used to force a rebuild of the incremental file.',
    ),
  ),
  mutate: Options.text('mutate')
    .pipe(
      Options.withAlias('m'),
      Options.withDescription(
        'With `mutate` you configure the subset of files or just one specific file to be mutated. These should be your _production code files_, and definitely not your test files. (Whereas with `ignorePatterns` you prevent non-relevant files from being copied to the sandbox directory in the first place)\nThe default will try to guess your production code files based on sane defaults. It reads like this:\n- Include all js-like files inside the `src` or `lib` dir\n- Except files inside `__tests__` directories and file names ending with `test` or `spec`.\nIf the defaults are not sufficient for you, for example in a angular project you might want to **exclude** not only the `*.spec.ts` files but other files too, just like the default already does.\nIt is possible to provide a comma separated list of globbing patterns: `--mutate src/**/*.js,src/**/*.ts`.\nYou can also use negation: `--mutate !src/**/*.spec.ts` (negation is only supported in config files and CLI arguments).\nThe patterns are relative to the current working directory. If you are using the `--inPlace` option, the `mutate` patterns are relative to the current working directory as well.\nA `**` wildcard will match any number of characters, but only within a single directory. Use `**/*` to match files in subdirectories as well.',
      ),
      Options.map(splitOnComma),
      optional,
    ),
  testFiles: Options.text('testFiles')
    .pipe(
      Options.withAlias('t'),
      Options.withDescription(
        "With `testFiles` you can limit which test files are executed during mutation testing. When specified, only tests from these files will be run. This allows you to verify that a module's dedicated unit tests can kill all its mutants independently.",
      ),
      Options.map(splitOnComma),
      optional,
    ),
  buildCommand: Options.text('buildCommand')
    .pipe(
      Options.withAlias('b'),
      Options.withDescription(
        'Configure a build command to run after mutating the code, but before mutants are tested. This is generally used to transpile your code before testing.' +
          " Only configure this if your test runner doesn't take care of this already and you're not using just-in-time transpiler like `babel/register` or `ts-node`.",
      ),
      optional,
    ),
  dryRunOnly: Options.map(Options.boolean('dryRunOnly'), absentWhenFalse).pipe(
    Options.withDescription(
      'Execute the initial test run only, without doing actual mutation testing. Doing a dry run only can be used to test that StrykerJS can run your test setup, for example, in CI pipelines.',
    ),
  ),
  checkers: Options.text('checkers')
    .pipe(
      Options.withDescription(
        'A comma separated list of checkers to use, for example --checkers typescript',
      ),
      Options.map(splitOnComma),
      optional,
    ),
  checkerNodeArgs: Options.text('checkerNodeArgs')
    .pipe(
      Options.withDescription(
        'A list of node args to be passed to checker child processes. Split on spaces (commander characterization): `--checkerNodeArgs "--inspect-brk --trace-warnings"`.',
      ),
      Options.map(splitOnSpace),
      optional,
    ),
  coverageAnalysis: Options.choice('coverageAnalysis', ['perTest', 'all', 'off'])
    .pipe(
      Options.withDescription(
        `The coverage analysis strategy you want to use. Default value: "${defaultOptions.coverageAnalysis}"`,
      ),
      optional,
    ),
  testRunner: Options.text('testRunner')
    .pipe(
      Options.withDescription('The name of the test runner you want to use'),
      optional,
    ),
  testRunnerNodeArgs: Options.text('testRunnerNodeArgs')
    .pipe(
      Options.withDescription(
        'A list of node args to be passed to test runner child processes. Split on spaces (commander characterization): `--testRunnerNodeArgs "--inspect-brk --trace-warnings"`.',
      ),
      Options.map(splitOnSpace),
      optional,
    ),
  reporters: Options.text('reporters')
    .pipe(
      Options.withDescription(
        'A comma separated list of the names of the reporter(s) you want to use',
      ),
      Options.map(splitOnComma),
      optional,
    ),
  plugins: Options.text('plugins')
    .pipe(
      Options.withDescription(
        'A list of plugins you want stryker to load (`require`).',
      ),
      Options.map(splitOnComma),
      optional,
    ),
  appendPlugins: Options.text('appendPlugins')
    .pipe(
      Options.withDescription(
        'A list of additional plugins you want Stryker to load (`require`) without overwriting the (default) `plugins`.',
      ),
      Options.map(splitOnComma),
      optional,
    ),
  timeoutMS: Options.integer('timeoutMS')
    .pipe(
      Options.withDescription(
        'Tweak the absolute timeout used to wait for a test runner to complete',
      ),
      optional,
    ),
  timeoutFactor: Options.float('timeoutFactor')
    .pipe(
      Options.withDescription(
        'Tweak the standard deviation relative to the normal test run of a mutated test',
      ),
      optional,
    ),
  dryRunTimeoutMinutes: Options.float('dryRunTimeoutMinutes')
    .pipe(
      Options.withDescription(
        'Configure an absolute timeout for the initial test run. (It can take a while.)',
      ),
      optional,
    ),
  maxConcurrentTestRunners: Options.integer('maxConcurrentTestRunners')
    .pipe(
      Options.withDescription(
        'Set the number of max concurrent test runner to spawn (default: cpuCount)',
      ),
      optional,
    ),
  concurrency: Options.text('concurrency')
    .pipe(
      Options.withAlias('c'),
      Options.withDescription(
        'Set the concurrency of workers. Stryker will always run checkers and test runners in parallel by creating worker processes (default: cpuCount - 1)',
      ),
      Options.map(parseConcurrency),
      optional,
    ),
  disableBail: Options.map(Options.boolean('disableBail'), absentWhenFalse).pipe(
    Options.withDescription(
      'Force the test runner to keep running tests, even when a mutant is already killed.',
    ),
  ),
  maxTestRunnerReuse: Options.integer('maxTestRunnerReuse')
    .pipe(
      Options.withDescription(
        'Restart each test runner worker process after `n` runs. Not recommended unless you are experiencing memory leaks that you are unable to resolve. Configuring `0` here means infinite reuse.',
      ),
      optional,
    ),
  logLevel: Options.choice('logLevel', LOG_LEVELS)
    .pipe(
      Options.withDescription(
        `Set the log level for the console. Possible values: fatal, error, warn, info, debug, trace and off. Default is "${defaultOptions.logLevel}"`,
      ),
      optional,
    ),
  fileLogLevel: Options.choice('fileLogLevel', LOG_LEVELS)
    .pipe(
      Options.withDescription(
        `Set the log level for the "stryker.log" file. Possible values: fatal, error, warn, info, debug, trace and off. Default is "${defaultOptions.fileLogLevel}"`,
      ),
      optional,
    ),
  inPlace: Options.map(Options.boolean('inPlace'), absentWhenFalse).pipe(
    Options.withDescription(
      'Determines whether or not Stryker should mutate your files in place. Note: mutating your files in place is generally not needed for mutation testing, unless you have a dependency in your project that is really dependent on the file locations (like "app-root-path" for example).\nWhen `true`, Stryker will override your files, but it will keep a copy of the originals in the temp directory (using `tempDirName`) and it will place the originals back after it is done. Also with `true` the `ignorePatterns` has no effect any more.\nWhen `false` (default) Stryker will work in the copy of your code inside the temp directory.',
    ),
  ),
  tempDirName: Options.text('tempDirName')
    .pipe(
      Options.withDescription(
        'Set the name of the directory that is used by Stryker as a working directory. This directory will be cleaned after a successful run',
      ),
      optional,
    ),
  cleanTempDir: Options.text('cleanTempDir')
    .pipe(
      Options.withDescription(
        `Choose whether or not to clean the temp dir (which is "${defaultOptions.tempDirName}" inside the current working directory by default) after a run.\n- false: Never delete the temp dir;\n- true: Delete the tmp dir after a successful run;\n- always: Always delete the temp dir, regardless of whether the run was successful.`,
      ),
      Options.map(parseCleanDirOption),
      optional,
    ),
  survivors: Options.map(Options.boolean('survivors'), absentWhenFalse).pipe(
    Options.withDescription(
      "Re-run only the mutants that survived a previous run. Admits against the previous run's mutation report (the `survivorsPriorReport` config option, default `reports/mutation-report.json`) and re-tests exactly the survivor set. Exits 2 with a remediation naming a full run when the report is missing, drifted, or the configuration changed; exits 0 with a null score when the report has no survivors.",
    ),
  ),
} satisfies Record<string, Options.Options<unknown>>

const runArgs = {
  configFile: Args.optional(Args.text({ name: 'configFile' })),
}

const runConfig = {
  ...runOptions,
  ...runArgs,
}

const rootConfig = {
  llms: Options.map(Options.boolean('llms'), absentWhenFalse).pipe(
    Options.withDescription(
      'Print the agent-facing command manifest as one JSON object on stdout: every option, alias, kind, default, allowed value set and description, plus the subcommands and positional arguments, walked from the command descriptors.',
    ),
  ),
}

function unwrap<A>(value: Option.Option<A> | A | undefined): A | undefined {
  if (Option.isOption(value)) {
    return Option.match(value, { onNone: () => undefined, onSome: (v) => v })
  }
  return value
}

function setIfPresent<K extends keyof StrykerOptions>(
  target: PartialStrykerOptions,
  key: K,
  value: Option.Option<StrykerOptions[K]> | StrykerOptions[K] | undefined,
): void {
  const unwrapped = unwrap(value)
  if (unwrapped !== undefined) {
    target[key] = unwrapped
  }
}

// =============================================================================
// U8 — the `--survivors` run (R10, R11, KTD6, KTD7)
//
// When `--survivors` is given, the run handler admits against the prior run's
// mutation report instead of starting the pipeline straight away: a single
// structural hash of the resolved options, the framework version and the
// per-file source content must all match (KTD6). On admission the mutant set
// is restricted to the survivor spans and the run re-tests exactly those
// mutants. A missing, unreadable or misshapen report, a drifted source or a
// changed configuration rejects with a `SurvivorsRejection` (exit 2) whose
// remediation names the full run to do first; a report with zero survivors
// exits 0 through the success path without starting the pipeline, and machine
// mode still emits the U4 verdict envelope with a null score.
// =============================================================================

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
 * Resolves the current options the same way the pipeline does — defaults +
 * config file + CLI, validated against the fork schema (which carries the
 * survivors-run properties). The admission hash compares these resolved
 * options against the prior report's embedded config.
 */
async function resolveSurvivorsRunOptions(
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
    hashes[file] = sourceContentHash(readSourceFile(file))
  }
  return hashes
}

/**
 * The survivor spans as `file:startLine:startCol-endLine:endCol` mutate
 * ranges: the report's 1-based lines with the internal 0-based columns,
 * relative file names, deduplicated in first-seen order.
 */
function survivorMutateSpans(survivors: readonly Mutant[]): string[] {
  const spans: string[] = []
  const seen = new Set<string>()
  for (const survivor of survivors) {
    const file = toRelativeNormalizedFileName(survivor.fileName)
    const { start, end } = survivor.location
    const span = `${file}:${start.line + 1}:${start.column}-${end.line + 1}:${end.column}`
    if (!seen.has(span)) {
      seen.add(span)
      spans.push(span)
    }
  }
  return spans
}

/**
 * Machine mode emits the U4 verdict envelope for a run that produced no
 * mutants and no report file: a `--survivors` run with zero survivors (AE3)
 * or a successful `--dryRunOnly` run that ended before the mutation
 * pipeline. The envelope carries a null score and an empty mutant list and is
 * written as the terminal `verdict` line of the stdout stream (U6), carrying
 * the run id the stream header already opened with (KTD11 — never a fresh
 * id). Human mode prints nothing.
 */
function emitNullScoreVerdict(thresholds: schema.Thresholds, config: object): void {
  const stream = ensureActiveStream()
  const resolvedMode = activeResolvedMode ?? detectMode()
  const report: schema.MutationTestResult = {
    schemaVersion: '1.0',
    files: {},
    thresholds,
    projectRoot: process.cwd(),
    config,
    framework: { name: 'StrykerJS', version: strykerVersion },
  }
  const envelope = buildVerdictEnvelope(
    report,
    resolvedMode.mode,
    resolvedMode.signal,
    stream.runId,
  )
  stream.sink({ kind: 'verdict', ...envelope })
}

/**
 * The `--survivors` zero-survivor path: the prior report held no survivors,
 * so the run emits the null-score verdict without starting the pipeline. The
 * full resolved options ride along as the report's embedded config (KTD7).
 */
function emitEmptySurvivorsVerdict(resolved: StrykerOptions): void {
  emitNullScoreVerdict(resolved.thresholds, resolved)
}

/**
 * The `--survivors` run: resolve the current options, read and guard the
 * prior report, admit against it, then re-run only the survivors. A rejected
 * admission fails with a `SurvivorsRejection` (exit 2); zero survivors exits
 * `SURVIVORS_EMPTY_EXIT_CODE` (0) through the success path without starting
 * the pipeline or touching the prior report.
 */
function runSurvivorsAdmission(
  runMutationTest: StrykerRun,
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
    })
    if (admission.ok === false) {
      const reason = admission.reason
      const remediation = admission.remediation
      if (reason === 'empty') {
        emitEmptySurvivorsVerdict(resolvedOptions)
        return undefined
      }
      return yield* Effect.failSync(() => new SurvivorsRejection(reason, remediation))
    }
    const restricted: SurvivorsRunOptions = {
      ...resolvedOptions,
      survivors: admission.survivors,
      mutate: survivorMutateSpans(admission.survivors),
      survivorsPriorReport: priorReportPath,
      // The differ would otherwise reuse the prior run's survived verdicts.
      incremental: false,
    }
    return yield* Effect.promise(() => runMutationTest(restricted))
  })
}

/**
 * Builds the full command tree — root plus the `run` subcommand — from the
 * same option/arg records the parser matches against. Exported so the U11
 * manifest tests can walk the real surface.
 */
export function makeStrykerCommand(runMutationTest: StrykerRun) {
  const runCommand = Command.make(
    'run',
    runConfig,
    (config): Effect.Effect<void, ValidationError.ValidationError | SurvivorsRejection, never> => {
      // The framework would otherwise swallow any unmatched `--flag` as the
      // configFile positional, silently accepting removed flags (`--files`,
      // `--allowConsoleColors`, `--dashboard.*`). Reject dash-prefixed values so
      // they surface as unknown arguments (exit 2), like commander did.
      const configFile = Option.getOrUndefined(config.configFile)
      if (configFile !== undefined && configFile.startsWith('-')) {
        return Effect.zipRight(
          Console.error(`Received unknown argument: '${configFile}'`),
          Effect.failSync(() => ValidationError.invalidValue(HelpDoc.p(`Received unknown argument: '${configFile}'`))),
        )
      }
      if (config.survivors === true) {
        return runSurvivorsAdmission(runMutationTest, readStrykerOptions(config))
      }
      return Effect.promise(() => runMutationTest(readStrykerOptions(config)))
    },
  ).pipe(Command.withDescription('Run mutation testing'))

  // The parsed-config type mirrors `Command.ParseConfig` (not resolvable under
  // the TS7 compiler used in this workspace): each option/arg unwraps to its
  // value type, so optional values are `Option<A>`.
  type ParsedConfigValue<A> = A extends Args.Args<infer Value> ? Value
    : A extends Options.Options<infer Value> ? Value
    : never
  type RunParsedConfig = {
    readonly [Key in keyof typeof runConfig]: ParsedConfigValue<(typeof runConfig)[Key]>
  }

  /**
   * Rebuilds the `PartialStrykerOptions` object commander produced: only options
   * actually given on the command line become keys (KTD4). `survivors` is
   * deliberately not forwarded — the survivor re-run logic (U8) consumes it.
   */
  function readStrykerOptions(config: RunParsedConfig): PartialStrykerOptions {
    const options: PartialStrykerOptions = {}
    setIfPresent(options, 'ignorePatterns', config.ignorePatterns)
    setIfPresent(options, 'ignoreStatic', config.ignoreStatic)
    setIfPresent(options, 'incremental', config.incremental)
    setIfPresent(options, 'allowEmpty', config.allowEmpty)
    setIfPresent(options, 'incrementalFile', config.incrementalFile)
    setIfPresent(options, 'force', config.force)
    setIfPresent(options, 'mutate', config.mutate)
    setIfPresent(options, 'testFiles', config.testFiles)
    setIfPresent(options, 'buildCommand', config.buildCommand)
    setIfPresent(options, 'dryRunOnly', config.dryRunOnly)
    setIfPresent(options, 'checkers', config.checkers)
    setIfPresent(options, 'checkerNodeArgs', config.checkerNodeArgs)
    setIfPresent(options, 'coverageAnalysis', config.coverageAnalysis)
    setIfPresent(options, 'testRunner', config.testRunner)
    setIfPresent(options, 'testRunnerNodeArgs', config.testRunnerNodeArgs)
    setIfPresent(options, 'reporters', config.reporters)
    setIfPresent(options, 'plugins', config.plugins)
    setIfPresent(options, 'appendPlugins', config.appendPlugins)
    setIfPresent(options, 'timeoutMS', config.timeoutMS)
    setIfPresent(options, 'timeoutFactor', config.timeoutFactor)
    setIfPresent(options, 'dryRunTimeoutMinutes', config.dryRunTimeoutMinutes)
    setIfPresent(options, 'maxConcurrentTestRunners', config.maxConcurrentTestRunners)
    setIfPresent(options, 'concurrency', config.concurrency)
    setIfPresent(options, 'disableBail', config.disableBail)
    setIfPresent(options, 'maxTestRunnerReuse', config.maxTestRunnerReuse)
    setLogLevel(options, 'logLevel', config.logLevel)
    setLogLevel(options, 'fileLogLevel', config.fileLogLevel)
    setIfPresent(options, 'inPlace', config.inPlace)
    setIfPresent(options, 'tempDirName', config.tempDirName)
    setIfPresent(options, 'cleanTempDir', config.cleanTempDir)
    if (Option.isSome(config.configFile)) {
      options.configFile = config.configFile.value
    }
    return options
  }

  // The explicit type breaks the circular inference from `root` being
  // referenced inside its own handler, which would collapse R/E to unknown.
  const root: Command.Command<'stryker', never, ValidationError.ValidationError, {
    readonly llms: boolean | undefined
  }> = Command.make('stryker', rootConfig, (config) => {
    if (config.llms === true) {
      // U11 — the manifest is walked from the command's own descriptors
      // (llms-manifest.ts), so a newly added option appears with no manifest
      // change. `strykerCommand` is the final tree, subcommands included; the
      // handler runs only after the const is bound (the same pattern as
      // `root.descriptor` below). Requesting `--llms` IS the machine signal,
      // so the command always produces the machine contract — a `stream`
      // header followed by one tagged `manifest` terminal event (R5) —
      // regardless of TTY or resolved mode. When the run bootstrap did not
      // open the stream (a TTY or a bare effect run), the handler drives the
      // drain itself so the header precedes the terminal line; a raw
      // document never reaches stdout on any path.
      const document: ManifestRendered = {
        kind: 'manifest',
        schemaVersion: STREAM_SCHEMA_VERSION,
        code: 0,
        manifest: emitLLMSManifest(strykerCommand, strykerVersion),
      }
      return Effect.gen(function*() {
        const stream = ensureActiveStream()
        stream.ensureOpen({ mode: 'machine', signal: 'flag', stdoutIsTTY: process.stdout.isTTY === true })
        if (stream.isOpen()) {
          stream.sink(document)
          return
        }
        // No run bootstrap is consuming the stream: open, push and await the
        // drain here so --llms still closes with the terminal line written.
        yield* stream.open
        stream.sink(document)
        yield* stream.closeAndDrain
      })
    }
    // Bare `stryker`: render help and exit 0, matching commander.
    return Effect.failSync(() => ValidationError.helpRequested(root.descriptor))
  })

  const strykerCommand = root.pipe(Command.withSubcommands([runCommand]))
  return strykerCommand
}

/**
 * The CLI parses only text/number/choice options, so the framework's platform
 * services are never read at runtime; `CliApp` still demands them in its
 * environment. `@effect/platform-node` is deliberately not a dependency
 * (KTD9: only the four U1 peers), so the bootstrap provides `Path.layer` (the
 * universal implementation in `@effect/platform`), an *empty* file system
 * (`layerNoop`: every operation reports not-found), and a process-stdio
 * `Terminal` whose interactive input primitives fail loudly — the run-only
 * surface (R14) has no prompts.
 */
const terminalLayer = Layer.succeed(Terminal.Terminal, {
  columns: Effect.sync(() => process.stdout.columns),
  rows: Effect.sync(() => process.stdout.rows),
  isTTY: Effect.sync(() => process.stdout.isTTY),
  readInput: Effect.die(
    new Error('stryker has no interactive prompts: Terminal.readInput is not supported'),
  ),
  readLine: Effect.die(
    new Error('stryker has no interactive prompts: Terminal.readLine is not supported'),
  ),
  display: (text: string) =>
    Effect.sync(() => {
      process.stdout.write(text)
    }),
})

const cliLayer = Layer.mergeAll(
  // KTD5: commander matched flags case-sensitively; the framework defaults to
  // case-insensitive matching, so pin it explicitly.
  CliConfig.layer({ isCaseSensitive: true }),
  Path.layer,
  FileSystem.layerNoop({}),
  terminalLayer,
)

/**
 * A rejected config reaches the teardown as a typed failure or as a defect
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
 * Classifies a failed run for the teardown: usage/parse failures
 * (`ValidationError`), rejected survivors runs (`SurvivorsRejection`) and a
 * rejected config (`ConfigError`) all exit 2, all other failures exit 1 (the
 * framework's default). A successful run exits 0; the verdict gates (U5) then
 * resolve the final classed code.
 */
export function resolveCliExitCode(exit: Exit.Exit<unknown, unknown>): number {
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
    if (failure.value instanceof SurvivorsRejection) {
      return SURVIVORS_REJECT_EXIT_CLASS
    }
  }
  if (carriesConfigError(exit.cause)) {
    return ExitClass.ConfigError
  }
  return 1
}

/**
 * The composed CLI run as an effect with the CLI environment provided. The
 * framework drops the executable prefix (`argv[0..1]`), so callers pass the
 * full `process.argv` shape. `runMutationTest` is injectable for tests.
 */
export function strykerCliEffect(
  argv: string[],
  runMutationTest: StrykerRun,
): Effect.Effect<void, unknown, never> {
  const command = makeStrykerCommand(runMutationTest)
  return Command.run({ name: 'stryker', version: strykerVersion })(command)(argv).pipe(
    Effect.provide(cliLayer),
  )
}

const SIGNAL_NUMBERS: Readonly<Partial<Record<NodeJS.Signals, number>>> = Object.freeze({
  SIGINT: 2,
  SIGTERM: 15,
})

// =============================================================================
// U6 — the terminal events on stdout (R5, R7)
//
// A machine-mode failure must be exactly one parseable JSON object — the
// `error` terminal event — written as the last line of the stdout stream,
// never the framework's ANSI-rendered help/error document. The framework
// writes that document through the `Console` service (KTD3), so machine mode
// swaps in the capturing layer from output-mode.ts: nothing reaches any real
// descriptor during the run, and the teardown below emits the captured
// content through the stream module (U7) as the terminal event. The
// envelope's `code` is the same code the process exits with; the remediation
// is picked from the cause's shape. A successful machine-mode `--help` or
// `--version` run emits its captured document as the `help` terminal event
// (U7), closing the stream it opened; a successful run that never reached a
// verdict — `--dryRunOnly` ends before the mutation pipeline — closes the
// stream with a null-score `verdict`. The last stdout line is therefore
// always a terminal event (R5).
// =============================================================================

export interface ErrorEnvelope {
  readonly schemaVersion: string
  readonly code: number
  readonly error: string
  readonly remediation: string
}

const ISSUE_TRACKER_URL = 'https://github.com/systemfsoftware/systemfsoftware/issues'

/**
 * The contextual remediation for a failure, picked from the cause's shape:
 * usage/parse errors point at `--help`, config errors name the offending file
 * (ConfigError messages carry it), rejected survivors runs name the full run
 * to do first, runtime errors point at the report file and the verdict
 * envelope, and internal defects ask for a bug report. Signal terminations
 * (POSIX `128 + n`) are called out as interruptions.
 */
export function remediationFor(exit: Exit.Exit<unknown, unknown>, code: number): string {
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
    if (value instanceof SurvivorsRejection) {
      return value.remediation
    }
  }
  switch (code) {
    case ExitClass.InternalError:
      return `this is a bug; please file it at ${ISSUE_TRACKER_URL}`
    default:
      return 'see --reportFile or the verdict envelope on stdout'
  }
}

/**
 * The failure's own text, used when the capture buffer is empty — a failure
 * stryker reported through its own logger rather than the framework's
 * `Console`. Falls back to a rendered cause.
 */
export function describeFailure(exit: Exit.Exit<unknown, unknown>): string {
  if (Exit.isFailure(exit)) {
    const value = failureValue(exit)
    if (value !== undefined) {
      if (value instanceof Error) {
        return value.message
      }
      return String(value)
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
function failureValue(exit: Exit.Exit<unknown, unknown>): unknown | undefined {
  if (!Exit.isFailure(exit)) {
    return undefined
  }
  const failure = Cause.failureOption(exit.cause)
  if (Option.isSome(failure)) {
    return failure.value
  }
  return Array.from(Cause.defects(exit.cause))[0]
}

export function buildErrorEnvelope(
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
 * Emits the machine-mode output from the run's `onExit` finalizer — it runs
 * on success, failure and interruption alike (R30): a failed run writes the
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
function emitMachineModeOutput(exit: Exit.Exit<unknown, unknown>, code: number): void {
  const stream = ensureActiveStream()
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
    // teardown never sees the finished run's resolved options, so the
    // framework defaults stand in for the thresholds it would have used.
    emitNullScoreVerdict(defaultOptions.thresholds, {})
  }
}

/**
 * Runs the CLI through an Effect runtime main — the equivalent of
 * `NodeRuntime.runMain` (same `Runtime.makeRunMain` seam). SIGINT/SIGTERM
 * interrupt the main fiber (so finalizers run) instead of exiting
 * synchronously; the terminal line is written from an `onExit` finalizer so
 * it fires on success, failure and interruption alike, and the drain is
 * awaited before the process exits (R30).
 *
 * Machine mode (U6) forks the stdout drain before the program runs — the
 * header and heartbeat precede every phase and terminal event — hands the
 * sink, run id, mode and timing to core through `StrykerHostOptions`,
 * provides the capturing `Console` layer, and pushes the captured content as
 * the `error` terminal event from the finalizer (or a structured help
 * document on stdout for `--help`). The framework's automatic error
 * reporting is disabled in machine mode — it renders the failure cause
 * through the effect logger *outside* the provided layer's scope, which
 * would leak prose into a stderr that must carry only logs and prose.
 *
 * The classed exit code is resolved exactly once (R6) — in the finalizer,
 * where the terminal event's `code` is chosen from the same inputs the
 * teardown used before: a tracked signal maps to `128 + n`, a failed run
 * keeps the usage-vs-other classification, and a successful run lets the
 * pending verdict classes decide. `process.exit` is called at most once,
 * only when a signal was received or the code is non-zero, so a clean run
 * flushes stdout.
 */
export function runStrykerCli(
  argv: string[] = process.argv,
  runMutationTest: StrykerRun | undefined,
): void {
  // One resolved mode decides the Console layer and the stream, from the
  // same detection inputs the reporters use (U3) — never a second probe.
  const resolvedMode = detectMode()
  activeResolvedMode = resolvedMode
  const stream = createRunEventStream(resolvedMode)
  activeStream = stream
  const hostOptions: StrykerHostOptions = {
    // Machine mode keeps stdout exclusively for the NDJSON stream, so the
    // logging backend is pointed at stderr; human mode keeps the stdout
    // sink. The fix is the descriptor, never the log level.
    loggerConsoleOut: resolvedMode.mode === 'machine' ? process.stderr : process.stdout,
    showColors: isColorEnabled(resolvedMode, process.env['NO_COLOR']),
    runEventSink: stream.sink,
    runId: stream.runId,
    resolvedMode,
    progressEnabled: isProgressEnabled(resolvedMode),
    clearTextEnabled: resolvedMode.mode === 'human',
    runStartedAt: stream.startedAt,
  }
  const consoleLayer = resolvedMode.mode === 'machine'
    ? machineConsoleLayer()
    : humanConsoleLayer()
  const cliEffect = strykerCliEffect(
    argv,
    runMutationTest ?? defaultRunMutationTest(hostOptions),
  ).pipe(Effect.provide(consoleLayer))

  // The signal and exit-code cells both the signal handler and the finalizer
  // write and read across fiber boundaries.
  const lastSignal: { current: number | null } = { current: null }
  const resolvedExitCode: { current: number | null } = { current: null }

  const resolveClassedExitCode = (exit: Exit.Exit<unknown, unknown>): number => {
    const signal = lastSignal.current
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

  const program = Effect.gen(function*() {
    // Fork the drain first: the register runs synchronously inside the fork,
    // so the sink is bound — and the header precedes every event — before
    // the CLI starts pushing.
    yield* stream.open
    yield* cliEffect
  }).pipe(
    Effect.onExit((exit) => {
      const code = resolveClassedExitCode(exit)
      resolvedExitCode.current = code
      if (resolvedMode.mode === 'machine') {
        emitMachineModeOutput(exit, code)
      }
      // Runs on success, failure and interruption (R30): the terminal event
      // above (or the run's own verdict) ended the stream, and this waits
      // until every buffered line is written and stdout has finished.
      return stream.closeAndDrain
    }),
  )

  Runtime.makeRunMain(({ fiber, teardown }) => {
    const keepAlive = setInterval(() => {}, 2 ** 31 - 1)
    const onSignal = (signal: NodeJS.Signals): void => {
      lastSignal.current = SIGNAL_NUMBERS[signal] ?? null
      process.removeListener('SIGINT', onSignal)
      process.removeListener('SIGTERM', onSignal)
      fiber.unsafeInterruptAsFork(fiber.id())
    }
    process.on('SIGINT', onSignal)
    process.on('SIGTERM', onSignal)
    fiber.addObserver((exit) => {
      clearInterval(keepAlive)
      if (lastSignal.current === null) {
        process.removeListener('SIGINT', onSignal)
        process.removeListener('SIGTERM', onSignal)
      }
      teardown(exit, (code) => {
        if (lastSignal.current !== null || code !== 0) {
          process.exit(code)
        } else {
          process.exitCode = code
        }
      })
    })
  })(program, {
    disableErrorReporting: resolvedMode.mode === 'machine',
    // The finalizer already resolved the classed code; the fallback re-runs
    // the classification for a hypothetical run whose finalizer never ran.
    teardown: (exit, onExit) => {
      onExit(resolvedExitCode.current ?? resolveClassedExitCode(exit))
    },
  })
}

export function guardMinimalNodeVersion(
  processVersion = process.version,
): void {
  if (!semver.satisfies(processVersion, strykerEngines.node)) {
    throw new Error(
      `Node.js version ${processVersion} detected. StrykerJS requires version to match ${strykerEngines.node}. Please update your Node.js version or visit https://nodejs.org/ for additional instructions`,
    )
  }
}
