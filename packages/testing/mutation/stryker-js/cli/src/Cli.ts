import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import * as NodeStdio from '@effect/platform-node/NodeStdio'
import { makeRunLayer, readConfig, runMutationTest, strykerVersion } from '@systemfsoftware/stryker-js-platform-node'
import type {
  ConfigFileInvalidError,
  ConfigFileNotFoundError,
  ConfigFileUnreadableError,
  ResolvedMode,
  RunEnvironmentShape,
} from '@systemfsoftware/stryker-js-platform-node'
import { ManifestRendered, type RunEvent, RunEvents } from '@systemfsoftware/stryker-js/Run'
import { RENDERED_OPTION_DEFAULTS } from '@systemfsoftware/stryker-js/Schema'
import type { LogLevel, PartialStrykerOptions, StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import * as Cause from 'effect/Cause'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Queue from 'effect/Queue'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import type { SchemaError } from 'effect/Schema'
import * as Terminal from 'effect/Terminal'
import * as Argument from 'effect/unstable/cli/Argument'
import * as CliConfig from 'effect/unstable/cli/CliConfig'
import * as CliError from 'effect/unstable/cli/CliError'
import * as Command from 'effect/unstable/cli/Command'
import * as Flag from 'effect/unstable/cli/Flag'
import * as GlobalFlag from 'effect/unstable/cli/GlobalFlag'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve as resolvePath } from 'node:path'
import type { CliRequest } from './Cli.schema.js'
import {
  buildErrorEnvelope,
  classifyRunOutcome,
  collectExitClasses,
  describeFailure,
  type ErrorEnvelope,
  exitClassOf,
  failureValue,
  isExitClass,
  machineConsoleLayer,
  readCapturedConsole,
  remediationFor,
  resetCapturedConsole,
  runOutcomeCode,
  unrecognizedArgumentOf,
} from './Envelope.js'
import { emitMachineModeOutput, isColorEnabled } from './Output.js'
import type { OutputModeProbe, RunEventStream, RunEventStreamPort } from './Output.js'
import { DEFAULT_PROGRESS_STREAM_FILE } from './StreamFile.js'
import { STREAM_SCHEMA_VERSION } from './StreamVersion.js'
import type { StrykerRun } from './StrykerRun.js'
import { runSurvivorsAdmission } from './Survivors.js'
import { SurvivorsRejection } from './Survivors.workflow.js'

export { type StrykerRun }
export {
  buildErrorEnvelope,
  collectExitClasses,
  describeFailure,
  type ErrorEnvelope,
  exitClassOf,
  failureValue,
  isExitClass,
  machineConsoleLayer,
  readCapturedConsole,
  remediationFor,
  resetCapturedConsole,
  unrecognizedArgumentOf,
}
export { STREAM_SCHEMA_VERSION }

export function resolveCliExitCode(exit: Exit.Exit<unknown, unknown>): number {
  return runOutcomeCode(classifyRunOutcome(exit, null, []))
}

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

/**
 * The frame the handler hands the executor: the already-run `@effect/cli`
 * program, the parsed request, the resolved mode, the optional run — and the
 * raw argument tokens, which the error envelope names the offending argument
 * from when the framework reports one it does not know.
 */
export interface RunStrykerCliInput {
  readonly program: Effect.Effect<void, CliError.CliError, never>
  readonly requestRef: Ref.Ref<Option.Option<CliRequest>>
  readonly mode: ResolvedMode
  readonly runMutationTest: StrykerRun | undefined
  readonly argv: readonly string[]
  /** The terminating signal, observed at the process edge (`signal-observer.ts`). */
  readonly lastSignal: SignalObserver
}

/**
 * The terminating signal, observed once at the process edge.
 *
 * Two readers need this one fact and they read it at different times. The run
 * needs it while it is still running, to put the classed code in the terminal
 * event it emits on the way out; the teardown needs it after the run's fiber
 * is gone, to hand the shell the status a signal leaves behind. The second
 * reader is why the observation cannot live inside the run: a signal
 * interrupts the run's fiber, and an interrupted fiber's exit is a failure no
 * matter what its finalizer computed, so a code resolved in there reaches the
 * terminal event and never the process. Reported `130` while exiting `1`.
 *
 * One observer, two readers, and the readers agree by construction rather
 * than by two handlers happening to decode the same signal the same way.
 */
export type SignalObserver = () => number | null

const SIGNAL_NUMBERS: Readonly<Partial<Record<NodeJS.Signals, number>>> = Object.freeze({
  SIGINT: 2,
  SIGTERM: 15,
})

/**
 * Installs the listeners and returns the reader.
 *
 * The listener records and returns: interrupting the run is the runtime's job,
 * and doing it from here would race the run's own finalizer for the stream.
 * `once` per signal, because a second delivery of the same signal cannot
 * change the answer.
 */
export function observeTerminatingSignal(): SignalObserver {
  let observed: number | null = null
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      observed = SIGNAL_NUMBERS[signal] ?? null
    })
  }
  return () => observed
}

/// <reference types="vitest/import-meta" />

// =============================================================================
// U11 — the `--llms` command manifest (R13)
//
// The v4 CLI has no manifest serializer, so the emitter is hand-built — but
// never from a list maintained alongside the CLI. Every field is read by
// walking the command's own compiled structures: the config tree
// (`Command.make`'s processed flag/argument records) and the public
// `name`/`description`/`subcommands` fields. A `Single` param node carries
// its name, aliases, primitive type (kind, and the alternatives of a choice)
// and description; an `Optional` wrapper marks the parameter optional. The
// framework keeps the compiled tree internal (`Command.Config` is opaque at
// the type level), so the walk narrows the runtime values with
// `_tag`-discriminated case switches — never casts.
//
// The consequence is the anti-drift property: a newly added option appears in
// the manifest with no change to any code here, because the manifest is
// derived from the compiled config, not from a parallel list. The drift guard
// test proves it by constructing a command carrying an extra option and
// asserting the emitter picks it up.
//
// The one value the compiled tree does not carry — the allowed reporter
// names — comes from the U9 reporter registry (pruned to the five
// survivors), never from a literal.
// =============================================================================

/** The manifest's schema version, matching the U4 envelope convention. */
export const LLMS_MANIFEST_SCHEMA_VERSION = '1.0'

export interface LLMSManifestOption {
  readonly name: string
  readonly aliases: readonly string[]
  readonly kind: string
  readonly required: boolean
  readonly default?: unknown
  readonly choices?: readonly string[]
  readonly description: string
}

export interface LLMSManifestArg {
  readonly name: string
  readonly kind: string
  readonly required: boolean
  readonly description: string
}

export interface LLMSManifestCommand {
  readonly name: string
  readonly description: string
  readonly options: readonly LLMSManifestOption[]
  readonly args: readonly LLMSManifestArg[]
  readonly subcommands: readonly LLMSManifestCommand[]
}

export interface LLMSManifest {
  readonly schemaVersion: '1.0'
  readonly tool: string
  readonly version: string
  readonly commands: readonly LLMSManifestCommand[]
  readonly entries: readonly string[]
}

// -----------------------------------------------------------------------------
// Runtime narrowing: the compiled config shapes are framework-internal, so the
// walk reads them through `_tag`-discriminated case switches.
// -----------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(node: Record<string, unknown>, key: string): string | undefined {
  const value = node[key]
  return (() => {
    if (typeof value === 'string') {
      return value
    }
    return undefined
  })()
}

function stringArrayField(node: Record<string, unknown>, key: string): readonly string[] {
  const value = node[key]
  if (!Array.isArray(value)) {
    return []
  }
  const strings: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      strings.push(item)
    }
  }
  return strings
}

/** The compiled shapes discriminate on `_tag`; read it once, off the record. */
function tagOf(node: Record<string, unknown>): unknown {
  return node['_tag']
}

function walkParam(
  param: unknown,
  isOptional: boolean,
  out: { readonly flags: LLMSManifestOption[]; readonly args: LLMSManifestArg[] },
): void {
  if (!isObject(param)) {
    return
  }
  switch (tagOf(param)) {
    case 'Single':
      describeSingle(param, isOptional, out)
      return
    case 'Map':
    case 'Transform':
      walkParam(param['param'], isOptional, out)
      return
    case 'Optional':
      walkParam(param['param'], true, out)
      return
    case 'Variadic':
      walkParam(param['param'], isOptional, out)
      return
    default:
      // A param tag this emitter does not know cannot describe a declared
      // option; the drift guard test fails the day one appears.
      return
  }
}

// -----------------------------------------------------------------------------
// Primitive kinds and choice alternatives. The compiled primitives carry
// canonical tag names; the map below is the manifest's stable, human-readable
// kind. The `required` flag must mirror the help renderer's Boolean
// carve-out (a bare boolean flag has an implicit `false` default, so it is
// never "required" whatever its wrapper says).
// -----------------------------------------------------------------------------

const PRIMITIVE_KIND: Readonly<Record<string, string>> = {
  Boolean: 'boolean',
  Choice: 'choice',
  Date: 'date',
  FileParse: 'file',
  FileSchema: 'file',
  FileText: 'file',
  Float: 'float',
  Integer: 'integer',
  KeyValuePair: 'key=value',
  None: 'none',
  Path: 'path',
  Redacted: 'redacted',
  String: 'text',
}

function kindOf(primitive: Record<string, unknown>): string {
  const tag = stringField(primitive, '_tag')
  return (() => {
    if (tag === undefined) {
      return 'unknown'
    }
    return PRIMITIVE_KIND[tag] ?? tag
  })()
}

function choiceValues(primitive: Record<string, unknown>): readonly string[] | undefined {
  const keys = primitive['choiceKeys']
  if (!Array.isArray(keys)) {
    return undefined
  }
  const values: string[] = []
  for (const key of keys) {
    if (typeof key === 'string') {
      values.push(key)
    }
  }
  return values
}

const REPORTER_NAMES: readonly string[] = ['clear-text', 'progress', 'html', 'json', 'progress-stream']

/**
 * v4 option descriptions are stored as `Option.some(string)` on the compiled
 * `Single`; the walker unwraps the option.
 */
function descriptionOf(single: Record<string, unknown>): string {
  const description = single['description']
  if (!isObject(description)) {
    return ''
  }
  switch (tagOf(description)) {
    case 'Some': {
      const value = description['value']
      return (() => {
        if (typeof value === 'string') {
          return value
        }
        return ''
      })()
    }
    default:
      return ''
  }
}

function describeSingle(
  single: Record<string, unknown>,
  isOptional: boolean,
  out: { readonly flags: LLMSManifestOption[]; readonly args: LLMSManifestArg[] },
): void {
  const name = stringField(single, 'name') ?? ''
  const primitive = (() => {
    if (isObject(single['primitiveType'])) {
      return single['primitiveType']
    }
    return {}
  })()
  const kind = kindOf(primitive)
  // `reporters` is a plain text option, so its allowed value set lives
  // nowhere in its compiled node — it is the registry, read at module load so
  // the manifest and the plugin loader cannot drift.
  const choices = (() => {
    if (name === 'reporters') {
      return REPORTER_NAMES
    }
    if (kind === 'choice') {
      return choiceValues(primitive)
    }
    return undefined
  })()
  const description = descriptionOf(single)
  const required = kind !== 'boolean' && !isOptional
  const described: LLMSManifestOption = {
    name,
    aliases: stringArrayField(single, 'aliases'),
    kind,
    required,
    ...((() => {
      if (choices !== undefined) {
        return { choices }
      }
      return {}
    })()),
    description,
  }
  const isArgument = single['kind'] === 'argument'
  if (isArgument) {
    out.args.push({
      name,
      kind,
      required,
      description,
    })
    return
  }
  out.flags.push(described)
}

// -----------------------------------------------------------------------------
// The config tree walk: one `Param` node per declared flag/argument. The tree
// preserves the command's declaration shape, so walking it in object-key order
// keeps the manifest's option/arg order aligned with the declaration.
// -----------------------------------------------------------------------------

function walkConfigNode(
  node: unknown,
  orderedParams: readonly unknown[],
  out: { readonly flags: LLMSManifestOption[]; readonly args: LLMSManifestArg[] },
): void {
  if (!isObject(node)) {
    return
  }
  switch (tagOf(node)) {
    case 'Param': {
      const index = node['index']
      const param = (() => {
        if (typeof index === 'number') {
          return orderedParams[index]
        }
        return undefined
      })()
      if (param !== undefined) {
        walkParam(param, false, out)
      }
      return
    }
    case 'Array':
      if (Array.isArray(node['children'])) {
        for (const child of node['children']) {
          walkConfigNode(child, orderedParams, out)
        }
      }
      return
    case 'Nested':
      if (isObject(node['tree'])) {
        walkConfigTree(node['tree'], orderedParams, out)
      }
      return
    default:
      return
  }
}

function walkConfigTree(
  tree: Record<string, unknown>,
  orderedParams: readonly unknown[],
  out: { readonly flags: LLMSManifestOption[]; readonly args: LLMSManifestArg[] },
): void {
  for (const key of Object.keys(tree)) {
    void key
    walkConfigNode(tree[key], orderedParams, out)
  }
}

// -----------------------------------------------------------------------------
// The command walk: name/description from the public fields, flags/args from
// the compiled config tree, and subcommands from the grouped `subcommands`
// list (each group entry is a declared child command).
// -----------------------------------------------------------------------------

function describeCommandNode(node: unknown): LLMSManifestCommand | undefined {
  if (!isObject(node)) {
    return undefined
  }
  const out: { readonly flags: LLMSManifestOption[]; readonly args: LLMSManifestArg[] } = {
    flags: [],
    args: [],
  }
  // The compiled config is not part of the public `Command` type, but it is
  // the object the parser itself reads (`config.tree` + `config.orderedParams`
  // are assigned by the command constructor).
  const config = node['config']
  if (isObject(config) && isObject(config['tree'])) {
    let orderedParams: readonly unknown[] = []
    const maybeOrdered = config['orderedParams']
    if (Array.isArray(maybeOrdered)) {
      orderedParams = maybeOrdered
    }
    walkConfigTree(config['tree'], orderedParams, out)
  }
  const subcommands: LLMSManifestCommand[] = []
  const grouped = node['subcommands']
  if (Array.isArray(grouped)) {
    for (const group of grouped) {
      if (!isObject(group) || !Array.isArray(group['commands'])) {
        continue
      }
      for (const child of group['commands']) {
        const described = describeCommandNode(child)
        if (described !== undefined) {
          subcommands.push(described)
        }
      }
    }
  }
  return {
    name: stringField(node, 'name') ?? '',
    description: (() => {
      if (typeof node['description'] === 'string') {
        return node['description']
      }
      return ''
    })(),
    options: out.flags,
    args: out.args,
    subcommands,
  }
}

function readCoreEntries(): readonly string[] {
  try {
    const requireFn = createRequire(import.meta.url)
    const manifestPath = requireFn.resolve('@systemfsoftware/stryker-js-platform-node/package.json')
    const raw = readFileSync(manifestPath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    const ExportsSchema = S.Struct({ exports: S.Record(S.String, S.Unknown) })
    const decoded = S.decodeUnknownResult(ExportsSchema)(parsed)
    if (Result.isSuccess(decoded)) {
      const keys = Object.keys(decoded.success.exports).filter((key) => key !== './package.json')
      return keys
    }
    return []
  } catch {
    return []
  }
}

export function buildLLMSManifest(command: Command.Command.Any, version: string): LLMSManifest {
  const root = describeCommandNode(command) ?? {
    name: '',
    description: '',
    options: [],
    args: [],
    subcommands: [],
  }
  return {
    schemaVersion: LLMS_MANIFEST_SCHEMA_VERSION,
    tool: root.name,
    version,
    commands: [root],
    entries: readCoreEntries(),
  }
}

/** The manifest as one JSON document, ready for stdout — the U4 convention. */
export function emitLLMSManifest(command: Command.Command.Any, version: string): string {
  return JSON.stringify(buildLLMSManifest(command, version))
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
  return (() => {
    if (v === 'always') {
      return v
    }
    return v !== 'false' && v !== '0'
  })()
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
const absentWhenFalse = (value: Option.Option<boolean>): boolean | undefined => {
  if (Option.isSome(value) && value.value) {
    return true
  }
  return undefined
}

function setLogLevel(
  target: PartialStrykerOptions,
  key: 'logLevel' | 'fileLogLevel',
  value: Option.Option<LogLevel> | LogLevel | undefined,
): void {
  const unwrapped = unwrap(value)
  if (unwrapped !== undefined) {
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
  progressStreamFile: Flag.string('progressStreamFile')
    .pipe(
      Flag.withDescription('Specify the file for the machine-mode progress stream.'),
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
  logLevel: Flag.choice('logLevel', ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'off'] as const)
    .pipe(
      Flag.withDescription(
        `Set the log level for the console. Possible values: fatal, error, warn, info, debug, trace and off. Default is "${RENDERED_OPTION_DEFAULTS.logLevel}"`,
      ),
      optional,
    ),
  fileLogLevel: Flag.choice('fileLogLevel', ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'off'] as const)
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
    setIfPresent(options, 'progressStreamFile', config.progressStreamFile)
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
          _tag: 'manifest',
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
export function strykerCliEffect(
  argv: string[],
  runMutationTest: StrykerRun | undefined,
  detectMode: DetectModeCapability,
  createRunEventStream: CreateRunEventStreamCapability,
  lastSignal: SignalObserver,
): Effect.Effect<number, never, never> {
  return Effect.gen(function*() {
    const mode = yield* detectMode
    const requestRef = yield* Ref.make<Option.Option<CliRequest>>(Option.none())
    const command = makeStrykerCommand(requestRef)
    const consoleLayer = (() => {
      if (mode.mode === 'machine') {
        return machineConsoleLayer
      }
      return Layer.empty
    })()
    const cliEffect = Command.runWith(command, { version: strykerVersion })(argv).pipe(
      Effect.provide(Layer.mergeAll(consoleLayer, cliLayer)),
    )
    const result = yield* Effect.result(
      runStrykerCli(
        { program: cliEffect, requestRef, mode, runMutationTest, argv, lastSignal },
        createRunEventStream,
      ),
    )
    if (Result.isFailure(result)) {
      return result.failure
    }
    return result.success
  }).pipe(Effect.orElseSucceed(() => 2))
}

const defaultRunMutationTest =
  (hostOptions: RunEnvironmentShape, queue: Queue.Queue<RunEvent, Cause.Done>): StrykerRun => (options) =>
    Effect.scoped(runMutationTest(options)).pipe(
      Effect.provideService(RunEvents, queue),
      Effect.provide(makeRunLayer(hostOptions)),
    )

function hostOptionsOf(mode: ResolvedMode, stream: RunEventStream): RunEnvironmentShape {
  return {
    runId: stream.runId,
    resolvedMode: mode,
    runStartedAt: stream.startedAt,
    basePath: resolvePath(process.cwd()),
    reporterPluginModules: [
      import.meta.resolve('@systemfsoftware/stryker-js-html-reporter'),
      import.meta.resolve('@systemfsoftware/stryker-js-platform-node/builtin-reporters'),
    ],
    allowConsoleColors: isColorEnabled(mode, process.env['NO_COLOR']),
  }
}

const progressStreamFileOf = (
  request: Option.Option<CliRequest>,
  basePath: string,
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Option.match(request, {
    onNone: () => Effect.succeed(DEFAULT_PROGRESS_STREAM_FILE),
    onSome: (cliRequest) =>
      Match.value(cliRequest).pipe(
        Match.tag(
          'run',
          (runRequest): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
            readConfig(runRequest.options, basePath).pipe(
              Effect.map((options) => {
                const fileName = options['progressStreamFile']
                if (typeof fileName === 'string' && fileName.length > 0) {
                  return fileName
                }
                return DEFAULT_PROGRESS_STREAM_FILE
              }),
              Effect.orElseSucceed(() => {
                const fileName = runRequest.options['progressStreamFile']
                if (typeof fileName === 'string' && fileName.length > 0) {
                  return fileName
                }
                return DEFAULT_PROGRESS_STREAM_FILE
              }),
            ),
        ),
        Match.orElse(() => Effect.succeed(DEFAULT_PROGRESS_STREAM_FILE)),
      ),
  })

export const runStrykerCli = (
  input: RunStrykerCliInput,
  createRunEventStream: CreateRunEventStreamCapability,
): Effect.Effect<number, never, never> =>
  Effect.gen(function*() {
    const stream = yield* createRunEventStream(input.mode)
    const hostOptions = hostOptionsOf(input.mode, stream)
    const runMutationTestImpl = input.runMutationTest ?? defaultRunMutationTest(hostOptions, stream.queue)
    const basePath = hostOptions.basePath
    const pathService = yield* Path.Path.pipe(Effect.provide(NodePath.layer))

    let currentFiber: Fiber.Fiber<unknown, unknown> | null = null

    const onSignal = (): void => {
      process.removeListener('SIGINT', onSignal)
      process.removeListener('SIGTERM', onSignal)
      if (currentFiber !== null) {
        currentFiber.interruptUnsafe(currentFiber.id)
      }
    }

    const dispatch = (
      request: CliRequest,
    ): Effect.Effect<
      unknown,
      SchemaError | SurvivorsRejection | ConfigFileNotFoundError | ConfigFileUnreadableError | ConfigFileInvalidError,
      never
    > =>
      Match.value(request).pipe(
        Match.tag('run', (runRequest) =>
          (() => {
            if (runRequest.survivors) {
              return runSurvivorsAdmission(runMutationTestImpl, stream, input.mode, runRequest.options, basePath).pipe(
                Effect.provide(makeRunLayer(hostOptions)),
              )
            }
            return runMutationTestImpl(runRequest.options).pipe(Effect.orDie)
          })()),
        Match.tag('llms', (llmsRequest) =>
          Effect.gen(function*() {
            stream.ensureOpen({ mode: 'machine', signal: 'flag', stdoutIsTTY: process.stdout.isTTY === true })
            yield* Queue.offer(
              stream.queue,
              ManifestRendered.make({
                schemaVersion: STREAM_SCHEMA_VERSION,
                code: 0,
                manifest: llmsRequest.document.manifest,
              }),
            )
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
          yield* input.program
          const request = yield* Ref.get(input.requestRef)
          const fileName = yield* progressStreamFileOf(request, basePath).pipe(
            Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
          )
          if (stream.setProgressStreamFile !== undefined) {
            yield* stream.setProgressStreamFile(fileName)
          }
          yield* stream.open
          return yield* Option.match(request, {
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

    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function*() {
        const exit = yield* Effect.exit(restore(program))
        const outcome = classifyRunOutcome(exit, input.lastSignal(), input.argv)
        const code = runOutcomeCode(outcome)
        if (input.mode.mode === 'machine') {
          yield* emitMachineModeOutput(stream, input.mode, outcome, basePath, pathService)
        }
        yield* stream.closeAndDrain
        return code
      })
    )
  })
