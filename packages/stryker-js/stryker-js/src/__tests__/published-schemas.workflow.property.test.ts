import { describe, it } from '@effect/vitest'
import { FastCheck as fc } from 'effect/testing'

import { CheckerFailedSchema, CheckResultSchema, CheckStatusSchema } from '../Checker.schema.js'
import { EvaluatorFailedSchema, EvaluatorVerdictSchema } from '../Evaluator.schema.js'
import { ClassifyExitCommandSchema, ClassifyExitDecisionSchema, ExitClassSchema } from '../ExitClass.schema.js'
import { IgnoreDecisionSchema } from '../Ignorer.schema.js'
import { LocationSchema, MutantSchema, MutantStatusSchema, PositionSchema } from '../Mutant.schema.js'
import {
  CoverageAnalysisModeSchema,
  LogLevelSchema,
  MutationScoreThresholdsSchema,
  OutputFileSchema,
  PackageManagerSchema,
  ReportTypeSchema,
  StrykerOptionsSchema,
} from '../Options.schema.js'
import { ParserPayloadSchema } from '../Parser.schema.js'
import {
  PluginDeclarationSchema,
  PluginKindSchema,
  PluginModuleSchema,
  ShadowingSchema,
  type StandardSchemaV1,
} from '../Plugin.schema.js'
import {
  FileResultSchema,
  MetricsResultSchema,
  MetricsSchema,
  MutantResultSchema,
  MutationTestResultSchema,
} from '../Report.schema.js'
import {
  DryRunCompletedSchema,
  MutantTestedSchema,
  MutationTestingPlanReadySchema,
  MutationTestReportReadySchema,
  ReporterEventKindSchema,
  ReporterEventSchema,
  ReporterFailedSchema,
} from '../Reporter.schema.js'
import {
  CoverageAnalysisSchema,
  DryRunOptionsSchema,
  DryRunResultSchema,
  DryRunStatusSchema,
  MutantActivationSchema,
  MutantCoverageSchema,
  MutantRunOptionsSchema,
  MutantRunResultSchema,
  MutantRunStatusSchema,
  RunOptionsSchema,
  TestResultSchema,
  TestRunnerCapabilitiesSchema,
  TestRunnerFailedSchema,
  TestStatusSchema,
} from '../TestRunner.schema.js'

const LOCATION = { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
const MUTANT = {
  _tag: 'Mutant',
  id: 'm1',
  fileName: 'a.ts',
  mutatorName: 'ArithmeticOperator',
  replacement: '+',
  location: LOCATION,
}
const METRICS = {
  pending: 0,
  killed: 1,
  timeout: 0,
  survived: 0,
  noCoverage: 0,
  runtimeErrors: 0,
  compileErrors: 0,
  ignored: 0,
  totalDetected: 1,
  totalUndetected: 0,
  totalInvalid: 0,
  totalValid: 1,
  totalMutants: 1,
  totalCovered: 1,
  mutationScore: 100,
  mutationScoreBasedOnCoveredCode: 100,
}
const REPORT = { schemaVersion: '1.0', files: {}, thresholds: { high: 80, low: 60 } }
const METRICS_RESULT = { name: 'All files', metrics: METRICS, childResults: [] }

interface SchemaCase {
  readonly name: string
  readonly schema: StandardSchemaV1<unknown, unknown>
  readonly accepted: unknown
  readonly refused: unknown
}

const CASES: readonly SchemaCase[] = [
  { name: 'PluginKindSchema', schema: PluginKindSchema, accepted: 'Checker', refused: 'Ignore' },
  {
    name: 'PluginDeclarationSchema',
    schema: PluginDeclarationSchema,
    accepted: { kind: 'Parser', name: 'html' },
    refused: { kind: 'Ignore', name: 'html' },
  },
  {
    name: 'ShadowingSchema',
    schema: ShadowingSchema,
    accepted: { kind: 'Reporter', name: 'x', shadowedIndex: 0, winnerIndex: 1 },
    refused: { kind: 'Reporter', name: 'x', shadowedIndex: 0 },
  },
  {
    name: 'PluginModuleSchema',
    schema: PluginModuleSchema,
    accepted: { strykerPlugins: [{ kind: 'Parser', name: 'html' }] },
    refused: { strykerPlugins: [{ kind: 'Ignore', name: 'html' }] },
  },
  { name: 'ExitClassSchema', schema: ExitClassSchema, accepted: 'VerdictFail', refused: 'Fail' },
  {
    name: 'ClassifyExitCommandSchema',
    schema: ClassifyExitCommandSchema,
    accepted: { pending: ['VerdictFail'], signal: null, score: 1, breakingThreshold: 2 },
    refused: { pending: ['VerdictFail'], signal: null, score: 1 },
  },
  {
    name: 'ClassifyExitDecisionSchema',
    schema: ClassifyExitDecisionSchema,
    accepted: { highestClass: null, verdictClass: null },
    refused: { highestClass: 'Nope', verdictClass: null },
  },
  {
    name: 'PositionSchema',
    schema: PositionSchema,
    accepted: { line: 1, column: 2 },
    refused: { line: '1', column: 2 },
  },
  { name: 'LocationSchema', schema: LocationSchema, accepted: LOCATION, refused: { start: { line: 1, column: 1 } } },
  { name: 'MutantStatusSchema', schema: MutantStatusSchema, accepted: 'Killed', refused: 'killed' },
  { name: 'MutantSchema', schema: MutantSchema, accepted: MUTANT, refused: { ...MUTANT, id: '' } },
  {
    name: 'MutantResultSchema',
    schema: MutantResultSchema,
    accepted: { id: 'm1', mutatorName: 'x', status: 'Killed', location: LOCATION },
    refused: { id: 'm1', mutatorName: 'x', status: 'killed', location: LOCATION },
  },
  {
    name: 'FileResultSchema',
    schema: FileResultSchema,
    accepted: { language: 'ts', source: 'x', mutants: [] },
    refused: { language: 'ts', source: 'x' },
  },
  {
    name: 'MutationTestResultSchema',
    schema: MutationTestResultSchema,
    accepted: REPORT,
    refused: { schemaVersion: '1.0', files: {} },
  },
  { name: 'MetricsSchema', schema: MetricsSchema, accepted: METRICS, refused: { ...METRICS, killed: 'one' } },
  {
    name: 'MetricsResultSchema',
    schema: MetricsResultSchema,
    accepted: METRICS_RESULT,
    refused: { ...METRICS_RESULT, childResults: 'none' },
  },
  { name: 'CheckStatusSchema', schema: CheckStatusSchema, accepted: 'passed', refused: 'pass' },
  {
    name: 'CheckResultSchema',
    schema: CheckResultSchema,
    accepted: { status: 'compileError', reason: 'x' },
    refused: { status: 'compileError' },
  },
  {
    name: 'CheckerFailedSchema',
    schema: CheckerFailedSchema,
    accepted: { _tag: 'CheckerFailed', cause: 'x', checkerName: 'ts', mutantIds: ['m1'] },
    refused: { _tag: 'CheckerFailed', cause: 'x', checkerName: 'ts' },
  },
  { name: 'TestStatusSchema', schema: TestStatusSchema, accepted: 'failed', refused: 'fail' },
  {
    name: 'TestResultSchema',
    schema: TestResultSchema,
    accepted: { id: 't1', name: 't', timeSpentMs: 1, status: 'success' },
    refused: { id: 't1', name: 't', timeSpentMs: 1, status: 'fail' },
  },
  { name: 'DryRunStatusSchema', schema: DryRunStatusSchema, accepted: 'complete', refused: 'done' },
  { name: 'MutantRunStatusSchema', schema: MutantRunStatusSchema, accepted: 'killed', refused: 'Killed' },
  {
    name: 'MutantCoverageSchema',
    schema: MutantCoverageSchema,
    accepted: { perTest: {}, static: {} },
    refused: { perTest: {} },
  },
  {
    name: 'DryRunResultSchema',
    schema: DryRunResultSchema,
    accepted: { status: 'complete', tests: [] },
    refused: { status: 'complete' },
  },
  {
    name: 'MutantRunResultSchema',
    schema: MutantRunResultSchema,
    accepted: { status: 'survived', nrOfTests: 1 },
    refused: { status: 'survived' },
  },
  { name: 'CoverageAnalysisSchema', schema: CoverageAnalysisSchema, accepted: 'perTest', refused: 'every' },
  { name: 'MutantActivationSchema', schema: MutantActivationSchema, accepted: 'static', refused: 'dynamic' },
  {
    name: 'RunOptionsSchema',
    schema: RunOptionsSchema,
    accepted: { timeout: 5000, disableBail: false },
    refused: { timeout: 5000 },
  },
  {
    name: 'DryRunOptionsSchema',
    schema: DryRunOptionsSchema,
    accepted: { timeout: 100, disableBail: false, coverageAnalysis: 'perTest' },
    refused: { timeout: 100, disableBail: false, coverageAnalysis: 'none' },
  },
  {
    name: 'MutantRunOptionsSchema',
    schema: MutantRunOptionsSchema,
    accepted: {
      timeout: 100,
      disableBail: false,
      activeMutant: MUTANT,
      sandboxFileName: 'a.ts',
      mutantActivation: 'runtime',
      reloadEnvironment: false,
    },
    refused: {
      timeout: 100,
      disableBail: false,
      sandboxFileName: 'a.ts',
      mutantActivation: 'runtime',
      reloadEnvironment: false,
    },
  },
  {
    name: 'TestRunnerCapabilitiesSchema',
    schema: TestRunnerCapabilitiesSchema,
    accepted: { reloadEnvironment: true },
    refused: { reload: true },
  },
  {
    name: 'TestRunnerFailedSchema',
    schema: TestRunnerFailedSchema,
    accepted: { _tag: 'TestRunnerFailed', cause: 'x', phase: 'init', runnerName: 'vitest' },
    refused: { _tag: 'TestRunnerFailed', cause: 'x', phase: 'boot', runnerName: 'vitest' },
  },
  { name: 'ReporterEventKindSchema', schema: ReporterEventKindSchema, accepted: 'mutantTested', refused: 'mutant' },
  {
    name: 'DryRunCompletedSchema',
    schema: DryRunCompletedSchema,
    accepted: {
      _tag: 'dryRunCompleted',
      timing: { net: 1, overhead: 0 },
      capabilities: { reloadEnvironment: false },
      testCount: 0,
      tests: [],
    },
    refused: { _tag: 'dryRunCompleted', capabilities: { reloadEnvironment: false }, testCount: 0, tests: [] },
  },
  {
    name: 'MutationTestingPlanReadySchema',
    schema: MutationTestingPlanReadySchema,
    accepted: { _tag: 'mutationTestingPlanReady', total: 0, plans: [] },
    refused: { _tag: 'mutationTestingPlanReady', total: 0 },
  },
  {
    name: 'MutantTestedSchema',
    schema: MutantTestedSchema,
    accepted: {
      _tag: 'mutantTested',
      id: 'm1',
      status: 'Killed',
      file: 'a.ts',
      location: LOCATION,
      mutator: 'x',
      replacement: null,
      completed: 1,
      total: 2,
    },
    refused: {
      _tag: 'mutantTested',
      id: 'm1',
      status: 'killed',
      file: 'a.ts',
      location: LOCATION,
      mutator: 'x',
      replacement: null,
      completed: 1,
      total: 2,
    },
  },
  {
    name: 'MutationTestReportReadySchema',
    schema: MutationTestReportReadySchema,
    accepted: { _tag: 'mutationTestReportReady', report: REPORT, metrics: METRICS_RESULT },
    refused: { _tag: 'mutationTestReportReady', report: REPORT },
  },
  {
    name: 'ReporterEventSchema',
    schema: ReporterEventSchema,
    accepted: { _tag: 'mutationTestingPlanReady', total: 0, plans: [] },
    refused: { _tag: 'unknown' },
  },
  {
    name: 'ReporterFailedSchema',
    schema: ReporterFailedSchema,
    accepted: { _tag: 'ReporterFailed', cause: 'x', event: 'mutantTested', reporterName: 'r' },
    refused: { _tag: 'ReporterFailed', cause: 'x', event: 'mutant', reporterName: 'r' },
  },
  { name: 'IgnoreDecisionSchema', schema: IgnoreDecisionSchema, accepted: 'because', refused: 42 },
  {
    name: 'EvaluatorVerdictSchema',
    schema: EvaluatorVerdictSchema,
    accepted: { exitClass: 'RuntimeError', message: 'the report could not be read' },
    refused: 'RuntimeError',
  },
  {
    name: 'EvaluatorFailedSchema',
    schema: EvaluatorFailedSchema,
    accepted: { _tag: 'EvaluatorFailed', cause: 'x', evaluatorName: 'gate' },
    refused: { _tag: 'EvaluatorFailed', cause: 'x' },
  },
  { name: 'LogLevelSchema', schema: LogLevelSchema, accepted: 'info', refused: 'verbose' },
  { name: 'CoverageAnalysisModeSchema', schema: CoverageAnalysisModeSchema, accepted: 'all', refused: 'some' },
  { name: 'ReportTypeSchema', schema: ReportTypeSchema, accepted: 'full', refused: 'partial' },
  { name: 'PackageManagerSchema', schema: PackageManagerSchema, accepted: 'pnpm', refused: 'bun' },
  {
    name: 'MutationScoreThresholdsSchema',
    schema: MutationScoreThresholdsSchema,
    accepted: { high: 80, low: 60, break: null },
    refused: { high: 120, low: 60, break: null },
  },
  {
    name: 'StrykerOptionsSchema',
    schema: StrykerOptionsSchema,
    accepted: { logLevel: 'debug' },
    refused: { logLevel: 'verbose' },
  },
  {
    name: 'OutputFileSchema',
    schema: OutputFileSchema,
    accepted: { fileName: 'report.html', content: '<p/>' },
    refused: { fileName: '', content: '<p/>' },
  },
  {
    name: 'ParserPayloadSchema',
    schema: ParserPayloadSchema,
    accepted: { extensions: ['.html'] },
    refused: { extensions: [] },
  },
]

const KIND_NAMES: readonly string[] = ['Checker', 'Evaluator', 'Ignorer', 'Parser', 'Reporter', 'TestRunner']

const acceptsInput = (schema: StandardSchemaV1<unknown, unknown>, input: unknown): boolean => {
  const result = schema['~standard'].validate(input)
  if (result instanceof Promise) return false
  return 'value' in result
}

const refusesInput = (schema: StandardSchemaV1<unknown, unknown>, input: unknown): boolean => {
  const result = schema['~standard'].validate(input)
  if (result instanceof Promise) return false
  return !('value' in result) && result.issues.length > 0
}

describe('published schemas', () => {
  it.prop(
    '∀s_Published_∈AcceptedSamples',
    [fc.constantFrom(...CASES)],
    ([testCase]) => acceptsInput(testCase.schema, testCase.accepted),
  )

  it.prop(
    '∀s_Published_∈RefusedSamples',
    [fc.constantFrom(...CASES)],
    ([testCase]) => refusesInput(testCase.schema, testCase.refused),
  )

  it.prop(
    '∀t_KindAlphabet_⊥Decoded',
    [fc.stringMatching(/^[a-z]+$/)],
    ([literal]) => refusesInput(PluginKindSchema, literal),
  )

  it.prop(
    '∀k_KindAlphabet_∈Alphabet',
    [fc.constantFrom(...KIND_NAMES)],
    ([literal]) => acceptsInput(PluginKindSchema, literal),
  )
})
