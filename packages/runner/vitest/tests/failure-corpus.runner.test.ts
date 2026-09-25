import { it } from '@systemfsoftware/vitest'
import { recordOfProperty, recordOfRun } from '@systemfsoftware/vitest/failure'
import { Effect, Option } from 'effect'
import { assertionFields } from './__fixtures__/failure-corpus/assertion-fields.js'
import { replayVerdictOf, verdictOf } from './__fixtures__/failure-corpus/record.js'
import { refutedProperty } from './__fixtures__/failure-corpus/refuted-property.js'
import { userCodeFailure } from './__fixtures__/failure-corpus/user-code-failure.js'

const verdictOrNull = <A, B>(
  value: A | undefined,
  verdict: (present: A) => B,
): B | null => Option.getOrNull(Option.map(Option.fromNullishOr(value), verdict))

it('Should_NameTheRaisingFileFirst_When_TheLanedProgramFailsInUserCode', function*({ expect }) {
  const record = yield* Effect.promise(() => recordOfRun(userCodeFailure.program))
  yield* expect(verdictOrNull(record, (present) => verdictOf({ record: present, fixture: userCodeFailure })))
    .toMatchObject({
      name: 'CorpusDefect',
      defectFile: userCodeFailure.defectFile,
      namesDefectFile: true,
      firstLocationFile: userCodeFailure.raisingFile,
      hasSeed: false,
      hasPath: false,
      hasRerun: true,
    })
})

it('Should_CarryTheDiffFields_When_AnAssertionIsRendered', function*({ expect }) {
  yield* expect(assertionFields()).toEqual({ actual: 1, expected: 2, showDiff: true, operator: 'strictEqual' })
})

const flagOf = (
  verdict: { readonly hasSeed: boolean; readonly hasPath: boolean; readonly hasRerun: boolean } | null,
  key: 'hasSeed' | 'hasPath' | 'hasRerun',
): boolean | undefined => verdict?.[key]

it('Should_CarryItsSeedAndPath_When_ThePropertyCounterexampleIsRendered', function*({ expect }) {
  const record = yield* Effect.promise(() => recordOfProperty(refutedProperty))
  const verdict = verdictOrNull(record, replayVerdictOf)
  yield* expect({
    seed: flagOf(verdict, 'hasSeed'),
    path: flagOf(verdict, 'hasPath'),
    rerun: flagOf(verdict, 'hasRerun'),
  }).toEqual({ seed: true, path: true, rerun: true })
})
