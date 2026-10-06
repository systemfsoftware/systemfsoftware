/**
 * `@xstate/test` — model-based and property-based testing for XState, built on
 * fast-check.
 *
 * `import { ... } from '@xstate/test'` is the only import a test file needs.
 *
 * `propertyTest()`, `generateTestSuite()` and `testPaths()` are the
 * fast-check-backed entry points: they build the adapter themselves and take
 * fast-check's options at the top level. Pass `adapter` to use another
 * generator.
 */
export {
  type AnyTestEventDescriptor,
  assertTestCoverage,
  checkLinearizable,
  describeTestSuite,
  type DescribeTestSuiteOptions,
  formatTestCoverage,
  formatTestCoverageHTML,
  type FormatTestCoverageHTMLOptions,
  formatTestCoverageJUnit,
  type FormatTestCoverageJUnitOptions,
  type FormatTestCoverageOptions,
  formatTestStatistics,
  type LinearizabilityEntry,
  type LinearizabilityModel,
  type LinearizabilityOptions,
  type LinearizabilityResult,
  ModelTestFailure,
  type ParallelPropertyCommandsOptions,
  type ParallelPropertyCommandsResult,
  parseTestSuite,
  type PropertyExecutionConfig,
  PropertyScenarioRunner,
  type PropertyTargetObservation,
  ReplayNotReproducedError,
  replayTest,
  replayTestSuite,
  replayTestSuiteFixture,
  type ReplayTestSuiteOptions,
  runParallelPropertyCommands,
  serializeTestSuite,
  serializeTestTrace,
  type TestActorOutcome,
  type TestAdapter,
  TestCampaignError,
  type TestCommand,
  type TestCoverage,
  type TestCoverageDimension,
  type TestCoverageJSON,
  type TestCoverageThresholds,
  testCoverageToJSON,
  type TestEventDescriptor,
  type TestEventGenerators,
  type TestExplorationBounds,
  type TestFailureExtras,
  type TestFailureFormatOptions,
  type TestFailureStore,
  type TestFixture,
  type TestInvariant,
  type TestInvariantContext,
  type TestMode,
  type TestPathRunResult,
  type TestPathsResult,
  type TestPickDescriptor,
  type TestReference,
  type TestReferenceSession,
  type TestReplayMetadata,
  type TestStateAssertion,
  type TestStateAssertions,
  type TestStep,
  type TestStopCondition,
  type TestSuite,
  type TestSuiteReplayResult,
  type TestSut,
  type TestSutContext,
  type TestSutSendContext,
  type TestSutSession,
  type TestTemporal,
  type TestTrace,
} from './engine/index.ts'

export {
  extractReplayPath,
  fastCheckAdapter,
  type FastCheckAdapterOptions,
  type FastCheckGeneratorKind,
  type FastCheckSchedulerOptions,
  type FastCheckSchedulerReport,
} from './adapter.ts'
export { createFailureDatabase, type FailureDatabaseOptions, type FailuresOption } from './failures.ts'
export { pick } from './pick.ts'
export {
  type FastCheckGenerateTestSuiteOptions,
  type FastCheckPropertyTestOptions,
  type FastCheckTestPathsOptions,
  generateTestSuite,
  propertyTest,
  testPaths,
} from './propertyTest.ts'
export { getCurrentScheduler, withScheduledReference, withScheduledSut } from './scheduler.ts'
export { arbitraryFromSchema, eventsFromSchemas, mergeEventGenerators } from './schema.ts'
export type { EventsFromSchemasOptions, SchemaConverter } from './schema.ts'
