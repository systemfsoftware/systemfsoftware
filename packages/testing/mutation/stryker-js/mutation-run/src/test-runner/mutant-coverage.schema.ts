import * as S from 'effect/Schema'

declare global {
  /**
   * Coverage collected by the instrumented test bundle. The bundle writes
   * it to the worker global when coverage analysis is active and the test
   * runner did not report coverage itself. Declared `unknown` here — the
   * producer is out-of-tree instrumentation, so reads go through
   * `MutantCoverageSchema` in the worker.
   */
  var __mutantCoverage__: unknown
}

/**
 * The coverage document the instrumented test bundle accumulates:
 * hit counts per mutant id, both statically (once per test file) and per
 * test id.
 */
export const MutantCoverageSchema = S.Struct({
  static: S.Record(S.String, S.Finite),
  perTest: S.Record(S.String, S.Record(S.String, S.Finite)),
})

export type MutantCoverage = S.Schema.Type<typeof MutantCoverageSchema>
