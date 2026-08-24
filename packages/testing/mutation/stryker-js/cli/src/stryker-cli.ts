import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import * as NodeStdio from '@effect/platform-node/NodeStdio'
import type { ManifestRendered } from '@systemfsoftware/stryker-js-mutation-run/run-event'
import { strykerVersion } from '@systemfsoftware/stryker-js-mutation-run/stryker-package'
import { RENDERED_OPTION_DEFAULTS } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { LogLevel, PartialStrykerOptions, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as Terminal from 'effect/Terminal'
import * as Argument from 'effect/unstable/cli/Argument'
import * as CliConfig from 'effect/unstable/cli/CliConfig'
import * as CliError from 'effect/unstable/cli/CliError'
import * as Command from 'effect/unstable/cli/Command'
import * as Flag from 'effect/unstable/cli/Flag'
import * as GlobalFlag from 'effect/unstable/cli/GlobalFlag'
import type { CreateRunEventStreamCapability, DetectModeCapability, StrykerRun } from './cli-ports.js'
import type { CliRequest } from './cli-request.schema.js'
import { runStrykerCli } from './cli-run.js'
import { machineConsoleLayer } from './console-capture.js'
import { emitLLMSManifest } from './llms-manifest.js'
import type { SignalObserver } from './signal-observer.js'
import { STREAM_SCHEMA_VERSION } from './stream-protocol.js'

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

const optional = <A>(option: Flag.Flag<A>) => Flag.optional(option)

/**
 * Commander left an omitted flag out of the parsed options; `deepMerge` treats
 * `undefined` as absent but an explicit `false` would override a config-file
 * `true`. `Flag.optional` yields `Option.none` when the flag is absent and
 * `Option.some(false)` for an explicit `--no-x`, so both map back to
 * `undefined` and leave the config-file default in force (KTD4).
 */
const absentWhenFalse = (value: Option.Option<boolean>): boolean | undefined =>
  Option.isSome(value) && value.value ? true : undefined

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
// these strings; `Flag.choice` already guarantees membership, so this guard
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
  ignorePatterns: Flag.string('ignorePatterns')
    .pipe(
      Flag.withDescription(
        'A comma separated list of patterns used for specifying which files need to be ignored. This should only be used in cases where you experience a slow Stryker startup, because too many (or too large) files are copied to the sandbox that are not needed to run the tests. For example, image or movie directories. Note: This option will have NO effect when using the `--inPlace` option. The directories `node_modules`, `.git` and some others are always ignored. Example: `--ignorePatterns dist`. These patterns are ALWAYS ignored: [`node_modules`, `.git`, `/reports`, `*.tsbuildinfo`, `/stryker.log`, `.stryker-tmp`]. Because Stryker always ignores these, you should rarely have to adjust the `ignorePatterns` setting at all. This is useful to speed up Stryker by reducing the size of the sandbox directory which has a positive effect on performance.',
      ),
      Flag.map(splitOnComma),
      optional,
    ),
  ignoreStatic: Flag.map(optional(Flag.boolean('ignoreStatic')), absentWhenFalse).pipe(
    Flag.withDescription(
      'Ignore static mutants. Static mutants are mutants which are only executed during the loading of a file.',
    ),
  ),
  incremental: Flag.map(optional(Flag.boolean('incremental')), absentWhenFalse).pipe(
    Flag.withDescription(
      "Enable 'incremental mode'. Stryker will store results in a file and use that file to speed up the next --incremental run",
    ),
  ),
  allowEmpty: Flag.map(optional(Flag.boolean('allowEmpty')), absentWhenFalse).pipe(
    Flag.withDescription(
      'Allows stryker to exit without any errors in cases where no tests are found',
    ),
  ),
  incrementalFile: Flag.string('incrementalFile')
    .pipe(
      Flag.withDescription('Specify the file to use for incremental mode.'),
      optional,
    ),
  force: Flag.map(optional(Flag.boolean('force')), absentWhenFalse).pipe(
    Flag.withDescription(
      'Run all mutants, even if --incremental is provided and an incremental file exists. Can be used to force a rebuild of the incremental file.',
    ),
  ),
  mutate: Flag.string('mutate')
    .pipe(
      Flag.withAlias('m'),
      Flag.withDescription(
        'With `mutate` you configure the subset of files or just one specific file to be mutated. These should be your _production code files_, and definitely not your test files. (Whereas with `ignorePatterns` you prevent non-relevant files from being copied to the sandbox directory in the first place)\nThe default will try to guess your production code files based on sane defaults. It reads like this:\n- Include all js-like files inside the `src` or `lib` dir\n- Except files inside `__tests__` directories and file names ending with `test` or `spec`.\nIf the defaults are not sufficient for you, for example in a angular project you might want to **exclude** not only the `*.spec.ts` files but other files too, just like the default already does.\nIt is possible to override the defaults by: - supplying one or more [glob patterns](https://github.com/isaacs/minimatch) to include (e.g. `src/**/*.js`) - or one or more comma separated glob patterns preceded with `!` to exclude (e.g. `!src/**/*.spec.js`) - or both (e.g. `src/**/*.js,!src/**/*.spec.js`).\nNote: Stryker will use [minimatch](https://github.com/isaacs/minimatch) for parsing these patterns, see minimatch for the exact syntax.',
      ),
      Flag.map(splitOnComma),
      optional,
    ),
  testFiles: Flag.string('testFiles')
    .pipe(
      Flag.withAlias('t'),
      Flag.withDescription(
        "With `testFiles` you can limit which test files are executed during mutation testing. When specified, only tests from these files will be run. This allows you to verify that a module's dedicated unit tests can kill all its mutants independently.",
      ),
      Flag.map(splitOnComma),
      optional,
    ),
  buildCommand: Flag.string('buildCommand')
    .pipe(
      Flag.withAlias('b'),
      Flag.withDescription(
        'Configure a build command to run after mutating the code, but before mutants are tested. This is generally used to transpile your code before testing.' +
          " Only configure this if your test runner doesn't take care of this already and you're not using just-in-time transpiler like `babel/register` or `ts-node`.",
      ),
      optional,
    ),
  dryRunOnly: Flag.map(optional(Flag.boolean('dryRunOnly')), absentWhenFalse).pipe(
    Flag.withDescription(
      'Execute the initial test run only, without doing actual mutation testing. Doing a dry run only can be used to test that StrykerJS can run your test setup, for example, in CI pipelines.',
    ),
  ),
  checkers: Flag.string('checkers')
    .pipe(
      Flag.withDescription(
        'A comma separated list of checkers to use, for example --checkers typescript',
      ),
      Flag.map(splitOnComma),
      optional,
    ),
  checkerNodeArgs: Flag.string('checkerNodeArgs')
    .pipe(
      Flag.withDescription(
        'A list of node args to be passed to checker child processes. Split on spaces (commander characterization): `--checkerNodeArgs "--inspect-brk --trace-warnings"`.',
      ),
      Flag.map(splitOnSpace),
      optional,
    ),
  coverageAnalysis: Flag.choice('coverageAnalysis', ['perTest', 'all', 'off'])
    .pipe(
      Flag.withDescription(
        `The coverage analysis strategy you want to use. Default value: "${RENDERED_OPTION_DEFAULTS.coverageAnalysis}"`,
      ),
      optional,
    ),
  testRunner: Flag.string('testRunner')
    .pipe(
      Flag.withDescription('The name of the test runner you want to use'),
      optional,
    ),
  testRunnerNodeArgs: Flag.string('testRunnerNodeArgs')
    .pipe(
      Flag.withDescription(
        'A list of node args to be passed to test runner child processes. Split on spaces (commander characterization): `--testRunnerNodeArgs "--inspect-brk --trace-warnings"`.',
      ),
      Flag.map(splitOnSpace),
      optional,
    ),
  reporters: Flag.string('reporters')
    .pipe(
      Flag.withDescription(
        'A comma separated list of the names of the reporter(s) you want to use',
      ),
      Flag.map(splitOnComma),
      optional,
    ),
  plugins: Flag.string('plugins')
    .pipe(
      Flag.withDescription(
        'A list of plugins you want stryker to load (`require`).',
      ),
      Flag.map(splitOnComma),
      optional,
    ),
  appendPlugins: Flag.string('appendPlugins')
    .pipe(
      Flag.withDescription(
        'A list of additional plugins you want Stryker to load (`require`) without overwriting the (default) `plugins`.',
      ),
      Flag.map(splitOnComma),
      optional,
    ),
  timeoutMS: Flag.integer('timeoutMS')
    .pipe(
      Flag.withDescription(
        'Tweak the absolute timeout used to wait for a test runner to complete',
      ),
      optional,
    ),
  timeoutFactor: Flag.float('timeoutFactor')
    .pipe(
      Flag.withDescription(
        'Tweak the standard deviation relative to the normal test run of a mutated test',
      ),
      optional,
    ),
  dryRunTimeoutMinutes: Flag.float('dryRunTimeoutMinutes')
    .pipe(
      Flag.withDescription(
        'Configure an absolute timeout for the initial test run. (It can take a while.)',
      ),
      optional,
    ),
  maxConcurrentTestRunners: Flag.integer('maxConcurrentTestRunners')
    .pipe(
      Flag.withDescription(
        'Set the number of max concurrent test runner to spawn (default: cpuCount)',
      ),
      optional,
    ),
  concurrency: Flag.string('concurrency')
    .pipe(
      Flag.withAlias('c'),
      Flag.withDescription(
        'Set the concurrency of workers. Stryker will always run checkers and test runners in parallel by creating worker processes (default: cpuCount - 1)',
      ),
      Flag.map(parseConcurrency),
      optional,
    ),
  disableBail: Flag.map(optional(Flag.boolean('disableBail')), absentWhenFalse).pipe(
    Flag.withDescription(
      'Force the test runner to keep running tests, even when a mutant is already killed.',
    ),
  ),
  maxTestRunnerReuse: Flag.integer('maxTestRunnerReuse')
    .pipe(
      Flag.withDescription(
        'Restart each test runner worker process after `n` runs. Not recommended unless you are experiencing memory leaks that you are unable to resolve. Configuring `0` here means infinite reuse.',
      ),
      optional,
    ),
  logLevel: Flag.choice('logLevel', LOG_LEVELS)
    .pipe(
      Flag.withDescription(
        `Set the log level for the console. Possible values: fatal, error, warn, info, debug, trace and off. Default is "${RENDERED_OPTION_DEFAULTS.logLevel}"`,
      ),
      optional,
    ),
  fileLogLevel: Flag.choice('fileLogLevel', LOG_LEVELS)
    .pipe(
      Flag.withDescription(
        `Set the log level for the "stryker.log" file. Possible values: fatal, error, warn, info, debug, trace and off. Default is "${RENDERED_OPTION_DEFAULTS.fileLogLevel}"`,
      ),
      optional,
    ),
  inPlace: Flag.map(optional(Flag.boolean('inPlace')), absentWhenFalse).pipe(
    Flag.withDescription(
      'Determines whether or not Stryker should mutate your files in place. Note: mutating your files in place is generally not needed for mutation testing, unless you have a dependency in your project that is really dependent on the file locations (like "app-root-path" for example).\nWhen `true`, Stryker will override your files, but it will keep a copy of the originals in the temp directory (using `tempDirName`) and it will place the originals back after it is done. Also with `true` the `ignorePatterns` has no effect any more.\nWhen `false` (default) Stryker will work in the copy of your code inside the temp directory.',
    ),
  ),
  tempDirName: Flag.string('tempDirName')
    .pipe(
      Flag.withDescription(
        'Set the name of the directory that is used by Stryker as a working directory. This directory will be cleaned after a successful run',
      ),
      optional,
    ),
  cleanTempDir: Flag.string('cleanTempDir')
    .pipe(
      Flag.withDescription(
        `Choose whether or not to clean the temp dir (which is "${RENDERED_OPTION_DEFAULTS.tempDirName}" inside the current working directory by default) after a run.\n- false: Never delete the temp dir;\n- true: Delete the tmp dir after a successful run;\n- always: Always delete the temp dir, regardless of whether the run was successful.`,
      ),
      Flag.map(parseCleanDirOption),
      optional,
    ),
  survivors: Flag.map(optional(Flag.boolean('survivors')), absentWhenFalse).pipe(
    Flag.withDescription(
      "Re-run only the mutants that survived a previous run. Admits against the previous run's mutation report (the `survivorsPriorReport` config option, default `reports/mutation-report.json`) and re-tests exactly the survivor set. Exits 2 with a remediation naming a full run when the report is missing, drifted, or the configuration changed; exits 0 with a null score when the report has no survivors.",
    ),
  ),
} satisfies Record<string, Flag.Flag<unknown>>

const runArgs = {
  configFile: Argument.optional(Argument.string('configFile')),
}

const runConfig = {
  ...runOptions,
  ...runArgs,
}

const rootConfig = {
  llms: Flag.map(optional(Flag.boolean('llms')), absentWhenFalse).pipe(
    Flag.withDescription(
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

/**
 * Builds the full command tree — root plus the `run` subcommand — from the
 * same option/arg records the parser matches against. Each handler leaves the
 * request the executor runs: the run handler writes the parsed options (and
 * the survivors flag, which the admission consumes and the pipeline must not
 * see), the `--llms` handler writes the pre-rendered manifest document, and
 * the bare root writes nothing — `helpRequested` makes the framework render
 * help, which the executor's finalizer turns into the `help` terminal event.
 */
function makeStrykerCommand(requestRef: Ref.Ref<Option.Option<CliRequest>>) {
  const runCommand = Command.make(
    'run',
    runConfig,
    (config): Effect.Effect<void, CliError.CliError, never> => {
      // The framework would otherwise swallow any unmatched `--flag` as the
      // configFile positional, silently accepting removed flags (`--files`,
      // `--allowConsoleColors`, `--dashboard.*`). Reject dash-prefixed values so
      // they surface as unknown arguments (exit 2), like commander did. The
      // message is stryker's own (the machine wire contract), so it is written
      // through the Console layer and the failure is the framework's leftover-
      // operand error.
      const configFile = Option.getOrUndefined(config.configFile)
      if (configFile !== undefined && configFile.startsWith('-')) {
        return Console.error(`Received unknown argument: '${configFile}'`).pipe(
          Effect.andThen(Effect.failSync(() => CliError.UnexpectedArgument.make({ arguments: [configFile] }))),
        )
      }
      return Ref.set(
        requestRef,
        Option.some({
          _tag: 'run',
          options: readStrykerOptions(config),
          survivors: config.survivors === true,
        }),
      )
    },
  ).pipe(Command.withDescription('Run mutation testing'))

  // The parsed-config type mirrors `Command.ParseConfig` (not resolvable under
  // the TS7 compiler used in this workspace): each option/arg unwraps to its
  // value type, so optional values are `Option<A>`.
  type ParsedConfigValue<A> = A extends Argument.Argument<infer Value> ? Value
    : A extends Flag.Flag<infer Value> ? Value
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
    if (Option.isSome(config['configFile'])) {
      options['configFile'] = config['configFile'].value
    }
    return options
  }

  // The explicit type breaks the circular inference from `root` being
  // referenced inside its own handler, which would collapse R/E to unknown.
  const root: Command.Command<'stryker', { readonly llms: boolean | undefined }, {}, CliError.CliError, never> = Command
    .make('stryker', rootConfig, (config) => {
      if (config.llms === true) {
        // U11 — the manifest is walked from the command's own compiled form
        // (LlmsManifest.ts), so a newly added option appears with no
        // manifest change. `strykerCommand` is the final tree, subcommands
        // included; the handler runs only after the const is bound (the same
        // pattern as the explicit root type above). Requesting `--llms` IS
        // the machine signal, so the executor always produces the machine
        // contract — a `stream` header followed by one tagged `manifest`
        // terminal event (R5) — regardless of TTY or resolved mode.
        const document: ManifestRendered = {
          kind: 'manifest',
          schemaVersion: STREAM_SCHEMA_VERSION,
          code: 0,
          manifest: emitLLMSManifest(strykerCommand, strykerVersion),
        }
        return Ref.set(requestRef, Option.some({ _tag: 'llms', document }))
      }
      // Bare `stryker`: render help and exit 0, matching commander. The
      // runner renders the ShowHelp document through the Console layer (the
      // machine capture) before rethrowing it; the executor maps an error-free
      // ShowHelp to exit 0 and the `help` terminal event.
      return Effect.failSync(() => CliError.ShowHelp.make({ commandPath: ['stryker'], errors: [] }))
    })

  const strykerCommand = root.pipe(Command.withSubcommands([runCommand]))
  return strykerCommand
}
/**
 * The CLI parses only text/number/choice options, so the framework's platform
 * services are never read at runtime; the v4 runner still demands them in its
 * environment. The bootstrap provides `Path.layer` (the universal
 * implementation in `effect/Path`), an *empty* file system (`layerNoop`:
 * every operation reports not-found), and a process-stdio `Terminal` whose
 * interactive input primitives fail loudly — the run-only surface (R14) has
 * no prompts. `@effect/platform-node` is a declared dependency of this
 * package (it provides the `NodeRuntime` the bin runs through), but no
 * platform-node service is wired into the command environment: the parser
 * never reads a real file system at run time, so the noop layers are
 * sufficient.
 */
const terminalLayer = Layer.succeed(
  Terminal.Terminal,
  Terminal.make({
    columns: Effect.sync(() => process.stdout.columns),
    rows: Effect.sync(() => process.stdout.rows),
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
  }),
)

const cliLayer = Layer.mergeAll(
  // v4 matches flags by exact name — commander's case-sensitive behaviour —
  // and exposes no case-normalisation switch; the previous `CliConfig.layer({
  // isCaseSensitive: true })` pin is therefore the framework default now.
  // The wire contract's version line is the bare semver (commander's shape);
  // the framework's built-in renders `stryker v<version>`, so the Version
  // action is replaced with one that prints the semver alone.
  CliConfig.layer({
    builtIns: [
      GlobalFlag.Help,
      GlobalFlag.action({
        flag: Flag.boolean('version').pipe(Flag.withAlias('v'), Flag.withDescription('Show version information')),
        run: () => Console.log(strykerVersion),
      }),
      GlobalFlag.Wizard,
      GlobalFlag.Completions,
      GlobalFlag.LogLevel,
    ],
  }),
  Path.layer,
  FileSystem.layerNoop({}),
  terminalLayer,
  // The v4 framework renders help and version documents through the `Stdio`
  // service's sinks, so the CLI provides the real process-backed layer —
  // `Stdio.layerTest` drains those sinks to nowhere, which swallowed every
  // framework-rendered document and left the process with nothing to show.
  NodeStdio.layer,
  NodeChildProcessSpawner.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
  ),
)
/**
 * The transport entry: builds the command tree, resolves the mode once at
 * the edge (never a second probe), provides the CLI and Console layers the
 * framework renders through, delegates the whole run to the executor cell and
 * returns the classed exit code it computes. The executor is the I/O
 * sandwich; this function only frames it.
 */
export function strykerCliEffect(
  argv: string[],
  runMutationTest: StrykerRun | undefined,
  detectMode: DetectModeCapability,
  createRunEventStream: CreateRunEventStreamCapability,
  lastSignal: SignalObserver,
): Effect.Effect<number, never, never> {
  return Effect.gen(function*() {
    // One resolved mode decides the Console layer and the stream, from the
    // same detection inputs the reporters use (U3) — never a second probe.
    const mode = detectMode()
    const requestRef = yield* Ref.make<Option.Option<CliRequest>>(Option.none())
    const command = makeStrykerCommand(requestRef)
    // The framework renders help/error documents through the `Console`
    // reference (KTD3), so the machine-mode layer is provided before the
    // command effect runs — nothing reaches any real descriptor during the
    // run, and the executor's finalizer emits the captured content as the
    // terminal event. Human mode provides no Console binding: effect's own
    // default console already writes the prose rendering to the real
    // descriptors (OutputModeConsoleState.ts).
    const cliEffect = Command.runWith(command, { version: strykerVersion })(argv).pipe(
      Effect.provide(
        Layer.mergeAll(
          mode.mode === 'machine' ? machineConsoleLayer : Layer.empty,
          cliLayer,
        ),
      ),
    )
    const outcome = yield* Effect.result(
      runStrykerCli(
        { program: cliEffect, requestRef, mode, runMutationTest, argv, lastSignal },
        createRunEventStream,
      ),
    )
    return Result.isFailure(outcome) ? outcome.failure : outcome.success
  })
}
