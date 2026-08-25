/**
 * Owned restatement of `mutation-testing-metrics`'s `MutationTestMetricsResult`.
 *
 * The third-party package is being removed from the subsystem (audit R8): a
 * metric is pure arithmetic over the report this contract already carries, so
 * it does not earn a dependency. This file restates only the members the
 * reporter contract actually reads — the counts and scores that drive
 * threshold checks and score tables — omitting the class methods, private
 * fields, and model helpers (`FileUnderTestModel`, `TestFileModel`,
 * `MutantModel`, `SourceFile`) that the original `*.d.ts` exposes.
 *
 * Source shapes read from:
 * - `node_modules/mutation-testing-metrics/dist/src/model/metrics.d.ts` — `Metrics`
 * - `node_modules/mutation-testing-metrics/dist/src/model/test-metrics.d.ts` — `TestMetrics`
 * - `node_modules/mutation-testing-metrics/dist/src/model/metrics-result.d.ts` — `MetricsResult`
 * - `node_modules/mutation-testing-metrics/dist/src/model/mutation-test-metrics-result.d.ts` — `MutationTestMetricsResult`
 */

/** Container for the metrics of mutation testing. */
export interface Metrics {
  readonly pending: number
  readonly killed: number
  readonly timeout: number
  readonly survived: number
  readonly noCoverage: number
  readonly runtimeErrors: number
  readonly compileErrors: number
  readonly ignored: number
  readonly totalDetected: number
  readonly totalUndetected: number
  readonly totalInvalid: number
  readonly totalValid: number
  readonly totalMutants: number
  readonly totalCovered: number
  readonly mutationScore: number
  readonly mutationScoreBasedOnCoveredCode: number
}

/** Container for test-file metrics. */
export interface TestMetrics {
  readonly total: number
  readonly killing: number
  readonly covering: number
  readonly notCovering: number
}

/**
 * A metrics result for a directory or file.
 *
 * The original `MetricsResult` is a class with tree-navigation helpers
 * (`updateParent`, `updateMetrics`), private fields, and a `file` link.
 * The contract needs only the tree shape and the aggregated numbers, so
 * this restatement keeps `name`, `metrics`, and `childResults`.
 */
export interface MetricsResult<TMetrics> {
  readonly name: string
  readonly metrics: TMetrics
  readonly childResults: readonly MetricsResult<TMetrics>[]
}

/** Top-level metrics for a mutation run. */
export interface MutationTestMetricsResult {
  readonly systemUnderTestMetrics: MetricsResult<Metrics>
  readonly testMetrics: MetricsResult<TestMetrics> | undefined
}
