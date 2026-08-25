/// <reference types="vitest/import-meta" />
import { Wire } from '@systemfsoftware/effect-cell-types'
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
const openStruct = <const F extends Wire.Fields>(fields: F) =>
  Wire.mint(
    S.StructWithRest(Wire.wire(fields), [
      Wire.record(Wire.string, Wire.mint(S.Unknown)), // plugin's own option section this workspace does not declare
    ]),
  )

/**
 * Field that decodes to a value but defaults when the key is absent.
 *
 * The default is typed by the schema's ENCODED side, which is what
 * `withDecodingDefaultKey` consumes: a whole-object option can therefore default
 * to `{}` exactly when every field inside it carries its own default, and the
 * compiler decides that rather than the author asserting it.
 *
 * The annotation is applied to the schema BEFORE the default transform wraps it.
 * Annotating the wrapper instead leaves `default` off the derived JSON Schema
 * document, so a consumer filling defaults from that document (ajv
 * `useDefaults`) silently injects nothing.
 */
const defaulted = <S2 extends S.Top>(schema: S2, defaultValue: S2['Encoded']) => {
  const annotated = schema.annotate({ default: defaultValue })
  const withDefault = S.withDecodingDefaultKey<typeof annotated>(Effect.succeed(defaultValue))(annotated)
  return Wire.mint(withDefault)
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
const Percentage = Wire.mint(Wire.number.pipe(S.check(S.isBetween({ minimum: 0, maximum: 100 }))))

// ---------------------------------------------------------------------------
// Nested option objects
// ---------------------------------------------------------------------------

const CommandRunnerOptionsSchema = openStruct({
  command: defaulted(Wire.string, 'npm test'),
})
export type CommandRunnerOptions = S.Schema.Type<typeof CommandRunnerOptionsSchema>

const ClearTextReporterOptions = openStruct({
  allowColor: defaulted(Wire.boolean, true),
  allowEmojis: defaulted(Wire.boolean, false),
  logTests: defaulted(Wire.boolean, true),
  maxTestsToLog: defaulted(Wire.mint(Wire.number.pipe(S.check(S.isGreaterThanOrEqualTo(0)))), 3),
  reportTests: defaulted(Wire.boolean, true),
  reportMutants: defaulted(Wire.boolean, true),
  reportScoreTable: defaulted(Wire.boolean, true),
  skipFull: defaulted(Wire.boolean, false),
})

const HtmlReporterOptions = Wire.wire({
  fileName: defaulted(Wire.string, 'reports/mutation/mutation.html'),
})

const JsonReporterOptions = Wire.wire({
  fileName: defaulted(Wire.string, 'reports/mutation/mutation.json'),
})

export const MutationScoreThresholdsSchema = S.Struct({
  high: defaulted(Percentage, 80),
  low: defaulted(Percentage, 60),
  break: defaulted(S.NullOr(Percentage), null),
})
export type MutationScoreThresholds = typeof MutationScoreThresholdsSchema.Type

const MutatorDescriptor = Wire.wire({
  plugins: defaulted(
    Wire.nullOr(
      Wire.array(
        Wire.union(
          Wire.string,
          Wire.array(Wire.mint(S.Unknown)), // mutator plugin options this workspace does not declare
        ),
      ),
    ),
    null,
  ),
  excludedMutations: defaulted(Wire.array(Wire.string), []),
})

const WarningOptions = openStruct({
  unknownOptions: defaulted(Wire.boolean, true),
  preprocessorErrors: defaulted(Wire.boolean, true),
  unserializableOptions: defaulted(Wire.boolean, true),
  slow: defaulted(Wire.boolean, true),
})

// ---------------------------------------------------------------------------
// The option set
// ---------------------------------------------------------------------------

export const StrykerOptionsSchema = S.StructWithRest(
  S.Struct({
    allowConsoleColors: defaulted(Wire.boolean, true),
    buildCommand: S.optional(Wire.string),
    checkers: defaulted(Wire.array(Wire.string), []),
    checkerNodeArgs: defaulted(Wire.array(Wire.string), []),
    concurrency: S.optional(
      Wire.union(
        Wire.mint(Wire.number.pipe(S.check(S.isGreaterThanOrEqualTo(1)))),
        Wire.mint(Wire.string.pipe(S.check(S.isPattern(/^(100|[1-9]?[0-9])%$/)))),
      ),
    ),
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
    dryRunOnly: defaulted(Wire.boolean, false),
    ignorePatterns: defaulted(Wire.array(Wire.string), []),
    ignoreStatic: defaulted(Wire.boolean, false),
    incremental: defaulted(Wire.boolean, false),
    incrementalFile: defaulted(Wire.string, 'reports/stryker-incremental.json'),
    force: defaulted(Wire.boolean, false),
    fileLogLevel: defaulted(LogLevel, RENDERED_OPTION_DEFAULTS.fileLogLevel),
    inPlace: defaulted(Wire.boolean, false),
    logLevel: defaulted(LogLevel, RENDERED_OPTION_DEFAULTS.logLevel),
    maxConcurrentTestRunners: defaulted(Wire.number, 9007199254740991),
    maxTestRunnerReuse: defaulted(Wire.number, 0),
    mutate: defaulted(Wire.array(Wire.string), [
      '{src,lib}/**/!(*.+(s|S)pec|*.+(t|T)est).+(cjs|mjs|js|ts|mts|cts|jsx|tsx|html|vue|svelte)',
      '!{src,lib}/**/__tests__/**/*.+(cjs|mjs|js|ts|mts|cts|jsx|tsx|html|vue|svelte)',
    ]),
    mutator: defaulted(MutatorDescriptor, { plugins: null, excludedMutations: [] }),
    packageManager: S.optional(PackageManager),
    plugins: defaulted(Wire.array(Wire.string), ['@systemfsoftware/stryker-js-*']),
    appendPlugins: defaulted(Wire.array(Wire.string), []),
    reporters: defaulted(Wire.array(Wire.string), ['clear-text', 'progress', 'html']),
    htmlReporter: defaulted(HtmlReporterOptions, { fileName: 'reports/mutation/mutation.html' }),
    jsonReporter: defaulted(JsonReporterOptions, { fileName: 'reports/mutation/mutation.json' }),
    disableTypeChecks: defaulted(Wire.union(Wire.boolean, Wire.string), true),
    symlinkNodeModules: defaulted(Wire.boolean, true),
    tempDirName: defaulted(Wire.string, RENDERED_OPTION_DEFAULTS.tempDirName),
    cleanTempDir: defaulted(S.Literals(['always', false, true]), true),
    testRunner: defaulted(Wire.string, 'command'),
    testRunnerNodeArgs: defaulted(Wire.array(Wire.string), []),
    thresholds: defaulted(MutationScoreThresholdsSchema, { high: 80, low: 60, break: null }),
    timeoutFactor: defaulted(Wire.number, 1.5),
    timeoutMS: defaulted(Wire.number, 5000),
    dryRunTimeoutMinutes: defaulted(Wire.mint(Wire.number.pipe(S.check(S.isGreaterThanOrEqualTo(0)))), 5),
    tsconfigFile: defaulted(Wire.string, 'tsconfig.json'),
    warnings: defaulted(Wire.union(Wire.boolean, WarningOptions), true),
    disableBail: defaulted(Wire.boolean, false),
    allowEmpty: defaulted(Wire.boolean, false),
    ignorers: defaulted(Wire.array(Wire.string), []),
    testFiles: defaulted(Wire.array(Wire.string), []),
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
type DeepOptional<T> = {
  -readonly [P in keyof T]?: T[P] extends Record<string, unknown> ? DeepOptional<T[P]> | undefined
    : T[P]
}

if (import.meta.vitest !== void 0) {
  const { refutes } = await import('@systemfsoftware/effect-schema-law/refutation')
  const { FastCheck: fc } = await import('effect/testing')

  refutes(StrykerOptionsSchema, {
    StrykerOptionsConcurrencyGteOne: fc.constant({ concurrency: 0 }),
    StrykerOptionsConcurrencyPattern: fc.constant({ concurrency: '101%' }),
  })
}
