import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { restartIndicesFor } from './restart-decision.kernel.js'
import type { DecideInput } from './restart-decision.schema.js'

const RestartDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon/RestartDecision')
type RestartDecisionTypeId = typeof RestartDecisionTypeId

export class RestartDecisionContinue extends S.TaggedClass<RestartDecisionContinue>()('Continue', {}) {
  readonly [RestartDecisionTypeId] = RestartDecisionTypeId
}
export class RestartDecisionRestart extends S.TaggedClass<RestartDecisionRestart>()('Restart', {
  indices: S.NonEmptyArray(S.Int),
}) {
  readonly [RestartDecisionTypeId] = RestartDecisionTypeId
}
export class RestartDecisionExhausted extends S.TaggedError<RestartDecisionExhausted>()('Exhausted', {}) {
  readonly [RestartDecisionTypeId] = RestartDecisionTypeId
}

export type RestartDecisionWorkflow = Workflow.Workflow<
  DecideInput,
  RestartDecisionContinue | RestartDecisionRestart,
  RestartDecisionExhausted
>

export const decideRestart = Workflow.make(
  (command: DecideInput): Result.Result<RestartDecisionContinue | RestartDecisionRestart, RestartDecisionExhausted> =>
    Match.value(command).pipe(
      Match.when({ exitSuccess: true }, () => Result.succeed(RestartDecisionContinue.make())),
      Match.when({ exitSuccess: false, intensityExceeded: true }, () => Result.fail(RestartDecisionExhausted.make())),
      Match.orElse(() =>
        Result.succeed(
          RestartDecisionRestart.make({
            indices: restartIndicesFor(command.strategy, command.failedIndex, command.totalChildren),
          }),
        )
      ),
    ),
)

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph.
  const { it } = await import('@effect/vitest')
  const { refutes } = await import('@systemfsoftware/effect-schema-law')
  const { expect } = await import('vitest')
  const { FastCheck: fc } = await import('effect/testing')

  /**
   * `indices: S.NonEmptyArray(S.Int)` puts both refinements on one array node under v4, so
   * only integrality is attributable to a per-node weakening — the refutation harness
   * cannot explain an empty array as the failure of a single check, and a generator that
   * emits one discriminates nothing. Integrality rides the refutation law; emptiness is
   * asserted directly against the decoder just below, which is the only honest split.
   */
  refutes(RestartDecisionRestart, {
    IndicesNonInteger: fc.constant({ _tag: 'Restart', indices: [1.5] }),
  })

  it('Should_RefuseTheDecision_When_TheRestartCarriesNoIndices', () => {
    const decoded = S.decodeUnknownExit(RestartDecisionRestart)({ _tag: 'Restart', indices: [] })
    expect(decoded._tag).toBe('Failure')
  })

  /**
   * The brand the interpreter dispatches on. It is a private symbol, so no consumer can
   * forge it and no structural value satisfies the decision types by accident; a refactor
   * that drops the field from the class leaves every `decideRestart` result undispatchable,
   * which is what this observes.
   */
  it('Should_CarryTheDecisionBrand_When_DecidingARestart', () => {
    const decided = decideRestart({
      strategy: 'one_for_one',
      totalChildren: 3,
      failedIndex: 1,
      exitSuccess: false,
      intensityExceeded: false,
    })
    expect(Result.isSuccess(decided)).toBe(true)
    if (Result.isSuccess(decided)) {
      expect(decided.success[RestartDecisionTypeId]).toBe(RestartDecisionTypeId)
    }
  })
}
