import { Effect } from 'effect'
import * as S from 'effect/Schema'

const RENDERED_OPTION_DEFAULTS = {
  coverageAnalysis: 'perTest',
  fileLogLevel: 'off',
  logLevel: 'info',
  tempDirName: '.stryker-tmp',
} as const

/**
 * The Stryker option set, declared as ONE Effect Schema.
 *
 * Replaces the vendored `schema/stryker-core.json` codegen chain
 * (`tasks/generate-stryker-core.mjs` → `src-generated/stryker-core.ts`): every
 * option name, type, optionality and default is preserved, and
 * `strykerCoreSchema` is the JSON Schema document **derived** from
 * `StrykerOptionsSchema` (no file read).
 *
 * Layering mirrors the original document:
 * - objects without `additionalProperties: false` there (the option set
 *   itself, `commandRunner`, `clearTextReporter`, `warnings`) are open here —
 *   `S.StructWithRest` with a `Record<string, unknown>` index keeps arbitrary
 *   plugin-proposed keys and makes the decoded type carry
 *   `[k: string]: unknown`;
 * - objects with `additionalProperties: false` (`htmlReporter`, `jsonReporter`,
 *   `thresholds`, `mutator`) are closed here.
 *
 * `dashboard` and `eventReporter` are absent: the reporters they configured were
 * removed, and the removed-option check rejects both names. Declaring them here
 * with defaults meant the default option set carried two options the very next
 * validation step refused - invisible only while the defaults were filled by a
 * separate engine that happened not to inject them.
 */

/** Open object: fixed fields plus an index signature accepting arbitrary plugin keys. */
const openStruct = <const F extends S.Struct.Fields>(fields: F) =>
  S.StructWithRest(S.Struct(fields), [
    S.Record(S.String, S.Unknown),
  ])

/**
 * Field that decodes to a value but defaults when the key is absent.
 *
 * The default is typed by the schema's ENCODED side, which is what
 * `withDecodingDefaultKey` consumes: a whole-object option can therefore default
 * to `{}` exactly when every field inside it carries its own default, and
 * the compiler decides that rather than the author asserting it.
 *
 * The annotation is applied to the schema BEFORE the default transform wraps it.
 * Annotating the wrapper instead leaves `default` off the derived JSON Schema
 * document, so a consumer filling defaults from that document (ajv
 * `useDefaults`) silently injects nothing.
 */
const defaulted = <S2 extends S.Top>(schema: S2, defaultValue: S2['Encoded']) => {
  const annotated = schema.annotate({ default: defaultValue })
  const withDefault = S.withDecodingDefaultKey<typeof annotated>(Effect.succeed(defaultValue))(annotated)
  return withDefault
}

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const LogLevel = S.Literals(['off', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'])
export const CoverageAnalysisMode = S.Literals(['off', 'all', 'perTest'])
export const ReportType = S.Literals(['full', 'mutationScore'])
export const PackageManager = S.Literals(['npm', 'yarn', 'pnpm'])

/** The generated module exported these as TypeScript types; consumers still name them that way. */
export type LogLevel = typeof LogLevel.Type
export type CoverageAnalysisMode = typeof CoverageAnalysisMode.Type
export type ReportType = typeof ReportType.Type
export type PackageManager = typeof PackageManager.Type

/** 0–100 percentage used by the mutation-score thresholds. */
const Percentage = S.Finite.pipe(S.check(S.isBetween({ minimum: 0, maximum: 100 })))

// ---------------------------------------------------------------------------
// Nested option objects
// ---------------------------------------------------------------------------

const CommandRunnerOptionsSchema = openStruct({
  command: defaulted(S.String, 'npm test'),
})
export type CommandRunnerOptions = S.Schema.Type<typeof CommandRunnerOptionsSchema>

const ClearTextReporterOptions = openStruct({
  allowColor: defaulted(S.Boolean, true),
  allowEmojis: defaulted(S.Boolean, false),
  logTests: defaulted(S.Boolean, true),
  maxTestsToLog: defaulted(S.Finite.pipe(S.check(S.isGreaterThanOrEqualTo(0))), 3),
  reportTests: defaulted(S.Boolean, true),
  reportMutants: defaulted(S.Boolean, true),
  reportScoreTable: defaulted(S.Boolean, true),
  skipFull: defaulted(S.Boolean, false),
})

const HtmlReporterOptions = S.Struct({
  fileName: defaulted(S.String, 'reports/mutation/mutation.html'),
})

const JsonReporterOptions = S.Struct({
  fileName: defaulted(S.String, 'reports/mutation/mutation.json'),
})

export const MutationScoreThresholdsSchema = S.Struct({
  high: defaulted(Percentage, 80),
  low: defaulted(Percentage, 60),
  break: defaulted(S.NullOr(Percentage), null),
})
export type MutationScoreThresholds = typeof MutationScoreThresholdsSchema.Type

const MutatorDescriptor = S.Struct({
  excludedMutations: defaulted(S.Array(S.String), []),
})

const WarningOptions = openStruct({
  unknownOptions: defaulted(S.Boolean, true),
  preprocessorErrors: defaulted(S.Boolean, true),
  unserializableOptions: defaulted(S.Boolean, true),
  slow: defaulted(S.Boolean, true),
})
const ConcurrencyCount = S.Finite.pipe(S.check(S.isGreaterThanOrEqualTo(1)))
const ConcurrencyPercent = S.String.pipe(S.check(S.isPattern(/^(100|[1-9]?[0-9])%$/)))

// ---------------------------------------------------------------------------
// The option set
// ---------------------------------------------------------------------------

export const StrykerOptionsSchema = S.StructWithRest(
  S.Struct({
    allowConsoleColors: defaulted(S.Boolean, true),
    buildCommand: S.optional(S.String),
    checkers: defaulted(S.Array(S.String), []),
    checkerNodeArgs: defaulted(S.Array(S.String), []),
    concurrency: S.optional(S.Union([ConcurrencyCount, ConcurrencyPercent])),
    commandRunner: defaulted(CommandRunnerOptionsSchema, { command: 'npm test' }),
    coverageAnalysis: defaulted(CoverageAnalysisMode, RENDERED_OPTION_DEFAULTS.coverageAnalysis),
    clearTextReporter: defaulted(ClearTextReporterOptions, {
      allowColor: true,
      allowEmojis: false,
      logTests: true,
      maxTestsToLog: 3,
      reportTests: true,
      reportMutants: true,
      reportScoreTable: true,
      skipFull: false,
    }),
    dryRunOnly: defaulted(S.Boolean, false),
    ignorePatterns: defaulted(S.Array(S.String), []),
    ignoreStatic: defaulted(S.Boolean, false),
    incremental: defaulted(S.Boolean, false),
    incrementalFile: defaulted(S.String, 'reports/stryker-incremental.json'),
    progressStreamFile: defaulted(S.String, 'reports/mutation-stream.jsonl'),
    force: defaulted(S.Boolean, false),
    fileLogLevel: defaulted(LogLevel, RENDERED_OPTION_DEFAULTS.fileLogLevel),
    inPlace: defaulted(S.Boolean, false),
    logLevel: defaulted(LogLevel, RENDERED_OPTION_DEFAULTS.logLevel),
    maxConcurrentTestRunners: defaulted(S.Finite, 9007199254740991),
    maxTestRunnerReuse: defaulted(S.Finite, 0),
    mutate: defaulted(S.Array(S.String), [
      '{src,lib}/**/!(*.+(s|S)pec|*.+(t|T)est).+(cjs|mjs|js|ts|mts|cts|jsx|tsx|html|vue|svelte)',
      '!{src,lib}/**/__tests__/**/*.+(cjs|mjs|js|ts|mts|cts|jsx|tsx|html|vue|svelte)',
    ]),
    mutator: defaulted(MutatorDescriptor, { excludedMutations: [] }),
    packageManager: S.optional(PackageManager),
    plugins: defaulted(S.Array(S.String), ['@systemfsoftware/stryker-js-*']),
    appendPlugins: defaulted(S.Array(S.String), []),
    reporters: defaulted(S.Array(S.String), ['clear-text', 'progress', 'html']),
    htmlReporter: defaulted(HtmlReporterOptions, { fileName: 'reports/mutation/mutation.html' }),
    jsonReporter: defaulted(JsonReporterOptions, { fileName: 'reports/mutation/mutation.json' }),
    disableTypeChecks: defaulted(S.Union([S.Boolean, S.String]), true),
    symlinkNodeModules: defaulted(S.Boolean, true),
    tempDirName: defaulted(S.String, RENDERED_OPTION_DEFAULTS.tempDirName),
    cleanTempDir: defaulted(S.Literals(['always', false, true]), true),
    testRunner: defaulted(S.String, 'command'),
    testRunnerNodeArgs: defaulted(S.Array(S.String), []),
    thresholds: defaulted(MutationScoreThresholdsSchema, { high: 80, low: 60, break: null }),
    timeoutFactor: defaulted(S.Finite, 1.5),
    timeoutMS: defaulted(S.Finite, 5000),
    dryRunTimeoutMinutes: defaulted(S.Finite.pipe(S.check(S.isGreaterThanOrEqualTo(0))), 5),
    tsconfigFile: defaulted(S.String, 'tsconfig.json'),
    warnings: defaulted(S.Union([S.Boolean, WarningOptions]), true),
    disableBail: defaulted(S.Boolean, false),
    allowEmpty: defaulted(S.Boolean, false),
    ignorers: defaulted(S.Array(S.String), []),
    testFiles: defaulted(S.Array(S.String), []),
  }),
  [S.Record(S.String, S.Unknown)],
)

/** The decoded type: every defaulted option is present. */
export type StrykerOptions = S.Schema.Type<typeof StrykerOptionsSchema>

/**
 * The deep-partial input type: when configuring Stryker, every option is
 * optional, including deep properties like `dashboard.project`.
 */
export type PartialStrykerOptions = DeepOptional<StrykerOptions>

/**
 * Every option optional, all the way down, and mutable: this is the type a
 * caller CONSTRUCTS by assignment, so `readonly` is stripped. The decoded
 * `StrykerOptions` keeps it - that side is read, never built.
 */
export type DeepOptional<T> = {
  -readonly [P in keyof T]?: T[P] extends Record<string, unknown> ? DeepOptional<T[P]> | undefined
    : T[P]
}
