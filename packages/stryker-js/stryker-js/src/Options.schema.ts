import { Effect } from 'effect'
import * as S from 'effect/Schema'

import type { StandardSchemaV1 } from './Plugin.schema.js'

const RENDERED_OPTION_DEFAULTS = {
  coverageAnalysis: 'perTest',
  fileLogLevel: 'off',
  logLevel: 'info',
  tempDirName: '.stryker-tmp',
} as const

const openStruct = <const F extends S.Struct.Fields>(fields: F) =>
  S.StructWithRest(S.Struct(fields), [
    S.Record(S.String, S.Unknown),
  ])

const defaulted = <S2 extends S.Top>(schema: S2, defaultValue: S2['Encoded']) => {
  const annotated = schema.annotate({ default: defaultValue })
  const withDefault = S.withDecodingDefaultKey<typeof annotated>(Effect.succeed(defaultValue))(annotated)
  return withDefault
}

export const LogLevelCodec = S.Literals(['off', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'])
export type LogLevel = S.Schema.Type<typeof LogLevelCodec>

export const CoverageAnalysisModeCodec = S.Literals(['off', 'all', 'perTest'])
export type CoverageAnalysisMode = S.Schema.Type<typeof CoverageAnalysisModeCodec>

export const ReportTypeCodec = S.Literals(['full', 'mutationScore'])
export type ReportType = S.Schema.Type<typeof ReportTypeCodec>

export const PackageManagerCodec = S.Literals(['npm', 'yarn', 'pnpm'])
export type PackageManager = S.Schema.Type<typeof PackageManagerCodec>

export const LogLevelSchema: StandardSchemaV1<unknown, LogLevel> = S.toStandardSchemaV1(LogLevelCodec)

export const CoverageAnalysisModeSchema: StandardSchemaV1<unknown, CoverageAnalysisMode> = S.toStandardSchemaV1(
  CoverageAnalysisModeCodec,
)

export const ReportTypeSchema: StandardSchemaV1<unknown, ReportType> = S.toStandardSchemaV1(ReportTypeCodec)

export const PackageManagerSchema: StandardSchemaV1<unknown, PackageManager> = S.toStandardSchemaV1(
  PackageManagerCodec,
)

const Percentage = S.Finite.pipe(S.check(S.isBetween({ minimum: 0, maximum: 100 })))

const CommandRunnerOptionsCodec = openStruct({
  command: defaulted(S.String, 'npm test'),
})
export type CommandRunnerOptions = S.Schema.Type<typeof CommandRunnerOptionsCodec>

const ClearTextReporterOptionsCodec = openStruct({
  allowColor: defaulted(S.Boolean, true),
  allowEmojis: defaulted(S.Boolean, false),
  logTests: defaulted(S.Boolean, true),
  maxTestsToLog: defaulted(S.Finite.pipe(S.check(S.isGreaterThanOrEqualTo(0))), 3),
  reportTests: defaulted(S.Boolean, true),
  reportMutants: defaulted(S.Boolean, true),
  reportScoreTable: defaulted(S.Boolean, true),
  skipFull: defaulted(S.Boolean, false),
})
export type ClearTextReporterOptions = S.Schema.Type<typeof ClearTextReporterOptionsCodec>

const HtmlReporterOptionsCodec = S.Struct({
  fileName: defaulted(S.String, 'reports/mutation/mutation.html'),
})
export type HtmlReporterOptions = S.Schema.Type<typeof HtmlReporterOptionsCodec>

const JsonReporterOptionsCodec = S.Struct({
  fileName: defaulted(S.String, 'reports/mutation/mutation.json'),
})
export type JsonReporterOptions = S.Schema.Type<typeof JsonReporterOptionsCodec>

const MutationScoreThresholdsCodec = S.Struct({
  high: defaulted(Percentage, 80),
  low: defaulted(Percentage, 60),
  break: defaulted(S.NullOr(Percentage), null),
})
export type MutationScoreThresholds = S.Schema.Type<typeof MutationScoreThresholdsCodec>

export const MutationScoreThresholdsSchema: StandardSchemaV1<unknown, MutationScoreThresholds> = S.toStandardSchemaV1(
  MutationScoreThresholdsCodec,
)

const MutatorDescriptorCodec = S.Struct({
  excludedMutations: defaulted(S.Array(S.String), []),
})

const WarningOptionsCodec = openStruct({
  unknownOptions: defaulted(S.Boolean, true),
  preprocessorErrors: defaulted(S.Boolean, true),
  unserializableOptions: defaulted(S.Boolean, true),
  slow: defaulted(S.Boolean, true),
})
export type WarningOptions = S.Schema.Type<typeof WarningOptionsCodec>

const ConcurrencyCount = S.Finite.pipe(S.check(S.isGreaterThanOrEqualTo(1)))
const ConcurrencyPercent = S.String.pipe(S.check(S.isPattern(/^(100|[1-9]?[0-9])%$/)))

export const StrykerOptionsCodec = S.StructWithRest(
  S.Struct({
    allowConsoleColors: defaulted(S.Boolean, true),
    buildCommand: S.optional(S.String),
    checkers: defaulted(S.Array(S.String), []),
    checkerNodeArgs: defaulted(S.Array(S.String), []),
    concurrency: S.optional(S.Union([ConcurrencyCount, ConcurrencyPercent])),
    commandRunner: defaulted(CommandRunnerOptionsCodec, { command: 'npm test' }),
    coverageAnalysis: defaulted(CoverageAnalysisModeCodec, RENDERED_OPTION_DEFAULTS.coverageAnalysis),
    clearTextReporter: defaulted(ClearTextReporterOptionsCodec, {
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
    fileLogLevel: defaulted(LogLevelCodec, RENDERED_OPTION_DEFAULTS.fileLogLevel),
    inPlace: defaulted(S.Boolean, false),
    logLevel: defaulted(LogLevelCodec, RENDERED_OPTION_DEFAULTS.logLevel),
    maxConcurrentTestRunners: defaulted(S.Finite, 9007199254740991),
    maxTestRunnerReuse: defaulted(S.Finite, 0),
    mutate: defaulted(S.Array(S.String), [
      '{src,lib}/**/!(*.+(s|S)pec|*.+(t|T)est).+(cjs|mjs|js|ts|mts|cts|jsx|tsx|html|vue|svelte)',
      '!{src,lib}/**/__tests__/**/*.+(cjs|mjs|js|ts|mts|cts|jsx|tsx|html|vue|svelte)',
    ]),
    mutator: defaulted(MutatorDescriptorCodec, { excludedMutations: [] }),
    packageManager: S.optional(PackageManagerCodec),
    plugins: defaulted(S.Array(S.String), []),
    appendPlugins: defaulted(S.Array(S.String), []),
    reporters: defaulted(S.Array(S.String), ['clear-text', 'progress', 'html']),
    htmlReporter: defaulted(HtmlReporterOptionsCodec, { fileName: 'reports/mutation/mutation.html' }),
    jsonReporter: defaulted(JsonReporterOptionsCodec, { fileName: 'reports/mutation/mutation.json' }),
    disableTypeChecks: defaulted(S.Union([S.Boolean, S.String]), true),
    symlinkNodeModules: defaulted(S.Boolean, true),
    tempDirName: defaulted(S.String, RENDERED_OPTION_DEFAULTS.tempDirName),
    cleanTempDir: defaulted(S.Literals(['always', false, true]), true),
    testRunner: defaulted(S.String, 'command'),
    testRunnerNodeArgs: defaulted(S.Array(S.String), []),
    thresholds: defaulted(MutationScoreThresholdsCodec, { high: 80, low: 60, break: null }),
    timeoutFactor: defaulted(S.Finite, 1.5),
    timeoutMS: defaulted(S.Finite, 5000),
    dryRunTimeoutMinutes: defaulted(S.Finite.pipe(S.check(S.isGreaterThanOrEqualTo(0))), 5),
    tsconfigFile: defaulted(S.String, 'tsconfig.json'),
    warnings: defaulted(S.Union([S.Boolean, WarningOptionsCodec]), true),
    disableBail: defaulted(S.Boolean, false),
    allowEmpty: defaulted(S.Boolean, false),
    ignorers: defaulted(S.Array(S.String), []),
    testFiles: defaulted(S.Array(S.String), []),
  }),
  [S.Record(S.String, S.Unknown)],
)

export type StrykerOptions = S.Schema.Type<typeof StrykerOptionsCodec>

export type PartialStrykerOptions = DeepOptional<StrykerOptions>

type DeepOptional<T> = {
  -readonly [P in keyof T]?: T[P] extends Record<string, unknown> ? DeepOptional<T[P]> | undefined
    : T[P]
}

export const StrykerOptionsSchema: StandardSchemaV1<unknown, StrykerOptions> = S.toStandardSchemaV1(StrykerOptionsCodec)

const OutputFileCodec = S.Struct({
  fileName: S.NonEmptyString,
  content: S.String,
})

export type OutputFile = S.Schema.Type<typeof OutputFileCodec>

export const OutputFileSchema: StandardSchemaV1<unknown, OutputFile> = S.toStandardSchemaV1(OutputFileCodec)
