import { describe, expect, it, vi } from '@effect/vitest'
import { Effect, Either, FastCheck as fc, Stream } from 'effect'
import { Observable } from 'rxjs'
import { fromObservable } from '../from-observable.js'

describe('fromObservable (PBT)', () => {
  it.effect.prop(
    '∀x_ObservableEmit_=Values',
    [fc.array(fc.integer(), { maxLength: 100 })],
    ([values]) =>
      Effect.gen(function*() {
        const observable = new Observable<number>((subscriber) => {
          for (const value of values) {
            subscriber.next(value)
          }
          subscriber.complete()
        })

        const streamResult = yield* Stream.runCollect(
          fromObservable(() => new Error('unexpected'))(observable),
        ).pipe(Effect.map((chunk) => Array.from(chunk)))

        expect(streamResult).toEqual(values)
      }),
  )

  it.effect.prop(
    '→Fails_Observable_→Error',
    [fc.string({ minLength: 1, maxLength: 200 })],
    ([message]) =>
      Effect.gen(function*() {
        const observable = new Observable<number>((subscriber) => {
          subscriber.error(new Error(message))
        })

        const result = yield* Stream.runCollect(
          fromObservable((e) => String(e instanceof Error ? e.message : e))(observable),
        ).pipe(Effect.map((chunk) => Array.from(chunk)), Effect.either)

        expect(result).toEqual(Either.left(message))
      }),
  )

  it.effect.prop(
    '∀n_TakeN_⊇Unsub',
    [fc.array(fc.integer(), { minLength: 3, maxLength: 50 }), fc.integer({ min: 1, max: 49 })],
    ([values, takeN]) =>
      Effect.gen(function*() {
        const unsubscribe = vi.fn<() => void>()

        const observable = new Observable<number>((subscriber) => {
          for (const value of values) {
            subscriber.next(value)
          }
          subscriber.complete()
          return unsubscribe
        })

        const streamResult = yield* Stream.runCollect(
          fromObservable(() => new Error('unexpected'))(observable).pipe(Stream.take(takeN)),
        ).pipe(Effect.map((chunk) => Array.from(chunk)))

        expect(streamResult).toEqual(values.slice(0, takeN))
        expect(unsubscribe).toHaveBeenCalledOnce()
      }),
  )
})
