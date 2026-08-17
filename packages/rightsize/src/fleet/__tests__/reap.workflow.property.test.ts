/**
 * Reap-decision properties: the kill-set law against an independently
 * written liveness table, and the two contradiction classes — over generated
 * run facts. The inner selection lives in the GENERATOR (no-nested-
 * quantification): each case draws the judged facts together with the
 * table's expected kill set, and the predicate only compares the decision
 * against that expectation.
 *
 * Predicates are pure booleans — no `expect` inside a property.
 */
import { it } from '@effect/vitest'
import { Result } from 'effect'
import { FastCheck as fc } from 'effect/testing'

import type { RunRecord } from '../../lifecycle/hygiene/ledger.js'
import type { BackendName } from '../../runtime/runtime.js'
import { decideReap } from '../reap.js'

type RunFacts = {
  readonly runId: string
  readonly record: RunRecord | undefined
  readonly unparseableFresh: boolean
  readonly alive: boolean
}

const recordArb: fc.Arbitrary<RunRecord> = fc.record({
  pid: fc.integer({ min: 1, max: 99999 }),
  startedIso: fc.string({ minLength: 20, maxLength: 24 }),
  backend: fc.constantFrom<BackendName>('docker', 'msb'),
})

const runArb: fc.Arbitrary<RunFacts> = fc.record({
  runId: fc.string({ minLength: 1, maxLength: 12 }),
  record: fc.option(recordArb, { nil: undefined }),
  unparseableFresh: fc.boolean(),
  alive: fc.boolean(),
})

/** Facts that cannot contradict themselves: no parsed record carries the fresh mark. */
const consistentRunsArb = fc
  .array(runArb, { maxLength: 8 })
  .map((runs) => runs.map((run) => (run.record === undefined ? run : { ...run, unparseableFresh: false })))

/**
 * The kill-set table, written here independently of the kernel. Lives in
 * the generator chain, so the predicate's cost is one comparison fold.
 */
const scenarioArb = fc.record({
  runs: consistentRunsArb,
  thisRunId: fc.string({ minLength: 1, maxLength: 12 }),
  backend: fc.constantFrom<BackendName>('docker', 'msb'),
}).chain((drawn) => {
  const judged = drawn.runs.filter((run) => run.runId !== drawn.thisRunId)
  const expected = judged
    .filter((run) =>
      run.record === undefined
        ? !run.unparseableFresh
        : run.record.backend === drawn.backend && !run.alive
    )
    .map((run) => run.runId)
  return fc.constant({ ...drawn, judged, expected })
})

it.prop('∀case_KillSet_=TableExpectation', [scenarioArb], ([{ backend, thisRunId, judged, expected }]) => {
  const outcome = decideReap({ _tag: 'Reap', thisRunId, backend, runs: judged })
  if (!Result.isSuccess(outcome)) {
    return false
  }
  const decision = outcome.success
  if (expected.length === 0) {
    return decision._tag === 'ReapSkipped'
  }
  if (decision._tag !== 'ReapRuns') {
    return false
  }
  const got = decision.runs.map((run) => run.runId)
  return got.length === expected.length && got.every((id, index) => id === expected[index])
})

it.prop('∀case_SelfJudged_→Contradiction', [scenarioArb], ([{ backend, thisRunId, judged }]) => {
  const withSelf: ReadonlyArray<RunFacts> = [
    { runId: thisRunId, record: undefined, unparseableFresh: false, alive: false },
    ...judged,
  ]
  const outcome = decideReap({ _tag: 'Reap', thisRunId, backend, runs: withSelf })
  return Result.isFailure(outcome) && outcome.failure._tag === 'ReapFactContradictionError'
})

it.prop('∀case_FreshMarkOnParsedRecord_→Contradiction', [scenarioArb], ([{ backend, thisRunId, judged }]) => {
  const record: RunRecord = { pid: 42, startedIso: '2026-08-16T00:00:00.000Z', backend }
  const contradictory: RunFacts = {
    runId: judged[0]?.runId ?? 'other-run',
    record,
    unparseableFresh: true,
    alive: false,
  }
  const runs: ReadonlyArray<RunFacts> = judged.length === 0 ? [contradictory] : [contradictory, ...judged]
  const outcome = decideReap({ _tag: 'Reap', thisRunId, backend, runs })
  return Result.isFailure(outcome) && outcome.failure._tag === 'ReapFactContradictionError'
})
