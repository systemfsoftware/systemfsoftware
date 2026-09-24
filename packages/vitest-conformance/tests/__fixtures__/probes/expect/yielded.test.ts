import { describe, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

const observed = (): number => 1

describe('yielded checks', () => {
  // @ts-expect-error ✗ this test yields no check, so it cannot fail. Yield one from the test's own expect: it(name, function* ({ expect }) { yield* expect(actual).toEqual(expected) }). An expect imported from vitest does not count.
  it('Should_RefuseTheUnyieldedCheck_When_CheckIsWrittenButNotYielded', function*({ expect }) {
    const written = expect(observed()).toEqual(2)
    yield* Effect.void
    return written
  })

  // @ts-expect-error ✗ this test yields no check, so it cannot fail. Yield one from the test's own expect: it(name, function* ({ expect }) { yield* expect(actual).toEqual(expected) }). An expect imported from vitest does not count.
  it('Should_RefuseTheBody_When_ItYieldsNoCheck', function*({ expect }) {
    yield* Effect.succeed(expect(1))
  })
})
