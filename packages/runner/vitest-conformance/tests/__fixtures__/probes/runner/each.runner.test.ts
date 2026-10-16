import { it } from '@systemfsoftware/vitest'
import { Ref } from 'effect'

const rows = [
  { row: 1, counter: Ref.makeUnsafe(0) },
  { row: 2, counter: Ref.makeUnsafe(0) },
]

it.each(rows)(
  'Should_FailTheSecondRun_When_ARowAdvancesACounter $row',
  function*({ counter }, { expect }) {
    const at = yield* Ref.getAndUpdate(counter, (n) => n + 1)
    yield* expect(at).toEqual(0)
  },
)
