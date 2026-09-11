import * as S from 'effect/Schema'

export const MetricsSchema = S.Struct({
  pending: S.Finite,
  killed: S.Finite,
  timeout: S.Finite,
  survived: S.Finite,
  noCoverage: S.Finite,
  runtimeErrors: S.Finite,
  compileErrors: S.Finite,
  ignored: S.Finite,
  totalDetected: S.Finite,
  totalUndetected: S.Finite,
  totalInvalid: S.Finite,
  totalValid: S.Finite,
  totalMutants: S.Finite,
  totalCovered: S.Finite,
  mutationScore: S.Finite,
  mutationScoreBasedOnCoveredCode: S.Finite,
})
export type Metrics = typeof MetricsSchema.Type

export interface MetricsResult {
  readonly name: string
  readonly metrics: Metrics
  readonly childResults: readonly MetricsResult[]
}

export const MetricsResultSchema = S.Struct({
  name: S.String,
  metrics: MetricsSchema,
  childResults: S.Array(S.suspend((): S.Codec<MetricsResult> => MetricsResultSchema)),
}).annotate({ identifier: 'MetricsResult' })
