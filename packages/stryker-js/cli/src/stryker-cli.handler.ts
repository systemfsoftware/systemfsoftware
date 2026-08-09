import * as Args from '@effect/cli/Args'
import * as CliConfig from '@effect/cli/CliConfig'
import * as Command from '@effect/cli/Command'
import * as HelpDoc from '@effect/cli/HelpDoc'
import * as Options from '@effect/cli/Options'
import * as ValidationError from '@effect/cli/ValidationError'
import * as FileSystem from '@effect/platform/FileSystem'
import * as Path from '@effect/platform/Path'
import * as Terminal from '@effect/platform/Terminal'
import type { LogLevel, PartialStrykerOptions, StrykerOptions } from '@stryker-mutator/api/core'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'

import { defaultOptions } from '@systemfsoftware/stryker-js-mutation-run/config/config-resolution'
import type { ManifestRendered } from '@systemfsoftware/stryker-js-mutation-run/run-event'
import { strykerVersion } from '@systemfsoftware/stryker-js-mutation-run/stryker-package'

import { emitLLMSManifest } from './llms-manifest.kernel.js'
import { STREAM_SCHEMA_VERSION } from './stream-protocol.kernel.js'
import {
  type CliRequest,
  runStrykerCli,
  strykerCliConsoleLayers,
  StrykerCliExecutorDeps,
  type StrykerRun,
} from './stryker-cli.executor.js'

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
        'A comma separated list of patterns used for specifying which files need to be ignored. This should only be used in cases where you experience a slow Stryker startup, because too many (or too large) files are copied to the sandbox that are not needed to run the tests. For example, image or movie directories. Note: This option will have NO effect when using the `--inPlace` option. The directories `node_modules`, `.git` and some others are always ignored. Example: `--ignorePatterns dist`. These patterns are ALWAYS ignored: [`node_modules`, `.git`, `/reports`, `*.tsbuildinfo`, `/stryker.log`, `.stryker-tmp`]. Because Stryker always ignores these, you should rarely have to adjust the `ignorePatterns` setting at all. This is useful to speed up Stryker by reducing the size of the sandbox directory which has a positive effect on performance.',
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
        'With `mutate` you configure the subset of files or just one specific file to be mutated. These should be your _production code files_, and definitely not your test files. (Whereas with `ignorePatterns` you prevent non-relevant files from being copied to the sandbox directory in the first place)\nThe default will try to guess your production code files based on sane defaults. It reads like this:\n- Include all js-like files inside the `src` or `lib` dir\n- Except files inside `__tests__` directories and file names ending with `test` or `spec`.\nIf the defaults are not sufficient for you, for example in a angular project you might want to **exclude** not only the `*.spec.ts` files but other files too, just like the default already does.\nIt is possible to override the defaults by: - supplying one or more [glob patterns](https://github.com/isaacs/minimatch) to include (e.g. `src/**/*.js`) - or one or more comma separated glob patterns preceded with `!` to exclude (e.g. `!src/**/*.spec.js`) - or both (e.g. `src/**/*.js,!src/**/*.spec.js`).\nNote: Stryker will use [minimatch](https://github.com/isaacs/minimatch) for parsing these patterns, see minimatch for the exact syntax.',
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
    (config): Effect.Effect<void, ValidationError.ValidationError, never> => {
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
    if (Option.isSome(config['configFile'])) {
      options['configFile'] = config['configFile'].value
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
      // so the executor always produces the machine contract — a `stream`
      // header followed by one tagged `manifest` terminal event (R5) —
      // regardless of TTY or resolved mode.
      const document: ManifestRendered = {
        kind: 'manifest',
        schemaVersion: STREAM_SCHEMA_VERSION,
        code: 0,
        manifest: emitLLMSManifest(strykerCommand, strykerVersion),
      }
      return Ref.set(requestRef, Option.some({ _tag: 'llms', document }))
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
 * The transport entry: builds the command tree, resolves the mode once at
 * the edge (never a second probe), provides the CLI and Console layers the
 * framework renders through, delegates the whole run to the executor cell and
 * returns the classed exit code it computes. The executor is the I/O
 * sandwich; this function only frames it.
 */
export function strykerCliEffect(
  argv: string[],
  runMutationTest: StrykerRun | undefined,
  recordExitCode: (code: number) => void,
): Effect.Effect<number, never, StrykerCliExecutorDeps> {
  return Effect.gen(function*() {
    const deps = yield* StrykerCliExecutorDeps
    // One resolved mode decides the Console layer and the stream, from the
    // same detection inputs the reporters use (U3) — never a second probe.
    const mode = deps.detectMode()
    const requestRef = yield* Ref.make<Option.Option<CliRequest>>(Option.none())
    const command = makeStrykerCommand(requestRef)
    // The framework renders help/error documents through the `Console`
    // service (KTD3), so the machine-mode layer is provided before the
    // command effect runs — nothing reaches any real descriptor during the
    // run, and the executor's finalizer emits the captured content as the
    // terminal event. Human mode provides no Console layer: effect's own
    // default console already writes the prose rendering to the real
    // descriptors (output-mode-console.state.ts).
    const cliEffect = Command.run({ name: 'stryker', version: strykerVersion })(command)(argv).pipe(
      Effect.provide(
        Layer.mergeAll(
          mode.mode === 'machine' ? strykerCliConsoleLayers.machine() : Layer.empty,
          cliLayer,
        ),
      ),
    )
    const outcome = yield* Effect.either(
      runStrykerCli({ program: cliEffect, requestRef, mode, runMutationTest, recordExitCode }),
    )
    return Either.isLeft(outcome) ? outcome.left : outcome.right
  })
}
