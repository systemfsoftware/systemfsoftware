import { expect, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import { Ref } from 'effect'

const seen = Ref.makeUnsafe(0)

it.effect('Should_FailTheSecondRun_When_VisibleCounterAdvances', () =>
  Effect.gen(function*() {
    const at = yield* Ref.getAndUpdate(seen, (n) => n + 1)
    expect(at).toEqual(0)
  }))
