import { describe, expect, it } from '@effect/vitest'
import { Effect, Stream } from 'effect'
import { ReplaySubject } from 'rxjs'
import { fromObservable } from '../from-observable.js'

describe('fromObservable (scenario)', () => {
  it.effect('Should_EmitSameValues_When_SubjectCompletes', () =>
    Effect.gen(function*() {
      const subject = new ReplaySubject<number>(3)

      const fiber = yield* Stream.runCollect(
        fromObservable(() => new Error('unexpected'))(subject),
      ).pipe(Effect.map((chunk) => Array.from(chunk)), Effect.fork)

      subject.next(10)
      subject.next(20)
      subject.next(30)
      subject.complete()

      const result = yield* fiber
      expect(result).toEqual([10, 20, 30])
    }))
})
