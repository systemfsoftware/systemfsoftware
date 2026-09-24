import { it } from '@effect/vitest'
import { Ref } from 'effect'

const seen = Ref.makeUnsafe(0)

it('Should_FailTheSecondRun_When_VisibleCounterAdvances', function*({ expect }) {
  const at = yield* Ref.getAndUpdate(seen, (n) => n + 1)
  yield* expect(at).toEqual(0)
})
