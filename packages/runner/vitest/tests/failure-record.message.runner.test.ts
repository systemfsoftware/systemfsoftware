import { it } from '@systemfsoftware/vitest'
import type { FailureRecord, TestIdentity } from '@systemfsoftware/vitest/failure'
import { renderFailureRecord } from '@systemfsoftware/vitest/failure'

const IDENTITY: TestIdentity = {
  package: '@systemfsoftware/vitest',
  file: 'tests/failure-record.message.test.ts',
  name: 'a scenario whose refusal is rewritten',
}

const twoLineFailure = (): Error => {
  const error = new Error('first line of the rewrite\nsecond line of the rewrite\nthird line of the rewrite')
  error.name = 'Slop'
  return error
}

const recordOf = (): FailureRecord =>
  renderFailureRecord({ failure: twoLineFailure(), spans: [], identity: IDENTITY, replay: undefined })

it('Should_KeepTheHeadlineOneLine_When_TheHeadlineMessageHasThreeLines', function*({ expect }) {
  yield* expect(recordOf().record.split('\n')[0]).toEqual('Slop: first line of the rewrite')
})

it('Should_RenderTheRestUnderTheFailingStep_When_TheHeadlineMessageHasThreeLines', function*({ expect }) {
  yield* expect(recordOf().record.split('\n').slice(2, 5)).toEqual([
    'Failing step: no step ran',
    '  second line of the rewrite',
    '  third line of the rewrite',
  ])
})
