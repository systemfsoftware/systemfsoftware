/**
 * fromObservable — RxJS-to-Effect bridge behaviour.
 *
 * Drives the kernel through the package barrel so the assertion exercises the
 * exported API as production reaches it. Three invariants, each stated as a
 * scenario with a representative input and the boundary cases the original
 * property search was hunting for:
 *
 *   - emitted values equal the values the observable produced, including the
 *     empty stream and a long sequence;
 *   - an observable that errors surfaces a channel-failure whose cause is the
 *     string produced by the supplied mapper;
 *   - the consumer side stops the underlying subscription once it has taken
 *     enough values, including the boundary where the consumer takes a single
 *     element out of a long stream.
 */
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Either, Stream } from 'effect'
import { UnknownException } from 'effect/Cause'
import { expect } from 'vitest'

import { Observable, ReplaySubject } from 'rxjs'

import { fromObservable } from '../src/mod.js'

const Feature = makeFeature({ it, layer })

const collectValues = <A, E>(stream: Stream.Stream<A, E>): Effect.Effect<readonly A[], E, never> =>
  Stream.runCollect(stream).pipe(Effect.map((chunk) => Array.from(chunk)))

Feature('fromObservable — RxJS-to-Effect stream bridge').body(({ scenario }) => {
  scenario(
    'An observable that emits three values then completes yields those three values to the stream',
    Gherkin.Do.pipe(
      Given('a ReplaySubject seeded with 10, 20, 30 and then completed')('subject', () =>
        Effect.sync(() => {
          const subject = new ReplaySubject<number>(3)
          subject.next(10)
          subject.next(20)
          subject.next(30)
          subject.complete()
          return subject
        })),
      When('the stream is collected')('values', (s) =>
        collectValues(
          fromObservable(() => new UnknownException(new Error('unexpected')))(s.subject),
        )),
      Then('the stream yields exactly the emitted values in order')((s) => {
        expect(s.values).toEqual([10, 20, 30])
      }),
    ),
  )

  scenario(
    'An observable that emits no values and completes yields the empty stream',
    Gherkin.Do.pipe(
      Given('an observable that completes without emitting')(
        'observable',
        () =>
          Effect.sync(() =>
            new Observable<number>((subscriber) => {
              subscriber.complete()
            })
          ),
      ),
      When('the stream is collected')('values', (s) =>
        collectValues(
          fromObservable(() => new UnknownException(new Error('unexpected')))(s.observable),
        )),
      Then('the stream is empty')((s) => {
        expect(s.values).toEqual([])
      }),
    ),
  )

  scenario(
    'An observable that emits a long sequence yields every value in order',
    Gherkin.Do.pipe(
      Given('an observable emitting the integers 0..99 in order')(
        'observable',
        () =>
          Effect.sync(() =>
            new Observable<number>((subscriber) => {
              for (let i = 0; i < 100; i++) {
                subscriber.next(i)
              }
              subscriber.complete()
            })
          ),
      ),
      When('the stream is collected')('values', (s) =>
        collectValues(
          fromObservable(() => new UnknownException(new Error('unexpected')))(s.observable),
        )),
      Then('the stream yields exactly 0..99 in order')((s) => {
        expect(s.values).toEqual(Array.from({ length: 100 }, (_, i) => i))
      }),
    ),
  )

  scenario(
    "An observable that errors surfaces the mapper's string as a channel failure",
    Gherkin.Do.pipe(
      Given('an observable that immediately errors with a known message')(
        'observable',
        () =>
          Effect.sync(() =>
            new Observable<number>((subscriber) => {
              subscriber.error(new Error('boom'))
            })
          ),
      ),
      When('the stream is collected with a string mapper')('outcome', (s) =>
        collectValues(
          fromObservable((e) => String(e instanceof Error ? e.message : e))(s.observable),
        ).pipe(Effect.either)),
      Then('the call fails with the mapped message')((s) => {
        expect(s.outcome).toEqual(Either.left('boom'))
      }),
    ),
  )

  scenario(
    'An observable that errors with a multi-line message surfaces the full string verbatim',
    Gherkin.Do.pipe(
      Given('an observable that errors with a message containing a newline')(
        'observable',
        () =>
          Effect.sync(() =>
            new Observable<number>((subscriber) => {
              subscriber.error(new Error('line one\nline two'))
            })
          ),
      ),
      When('the stream is collected with a string mapper')('outcome', (s) =>
        collectValues(
          fromObservable((e) => String(e instanceof Error ? e.message : e))(s.observable),
        ).pipe(Effect.either)),
      Then('the call fails with the full multi-line string')((s) => {
        expect(s.outcome).toEqual(Either.left('line one\nline two'))
      }),
    ),
  )

  scenario(
    'A consumer that takes one element from a long stream unsubscribes after the first element',
    Gherkin.Do.pipe(
      Given('an observable emitting the integers 0..9 and an unsubscribe spy')('subject', () =>
        Effect.sync(() => {
          const calls: unknown[] = []
          const spy = () => {
            calls.push(undefined)
          }
          const observable = new Observable<number>((subscriber) => {
            for (let i = 0; i < 10; i++) {
              subscriber.next(i)
            }
            subscriber.complete()
            return spy
          })
          return { observable, calls }
        })),
      When('the consumer takes one element and the stream is collected')('values', (s) =>
        collectValues(
          fromObservable(() => new UnknownException(new Error('unexpected')))(s.subject.observable).pipe(
            Stream.take(1),
          ),
        )),
      Then('the stream yields exactly one element and the underlying subscription is unsubscribed once')((s) => {
        expect(s.values).toEqual([0])
        expect(s.subject.calls).toEqual([undefined])
      }),
    ),
  )

  scenario(
    'A consumer that takes three elements from a long stream unsubscribes after the third',
    Gherkin.Do.pipe(
      Given('an observable emitting the integers 0..9 and an unsubscribe spy')('subject', () =>
        Effect.sync(() => {
          const calls: unknown[] = []
          const spy = () => {
            calls.push(undefined)
          }
          const observable = new Observable<number>((subscriber) => {
            for (let i = 0; i < 10; i++) {
              subscriber.next(i)
            }
            subscriber.complete()
            return spy
          })
          return { observable, calls }
        })),
      When('the consumer takes three elements and the stream is collected')('values', (s) =>
        collectValues(
          fromObservable(() => new UnknownException(new Error('unexpected')))(s.subject.observable).pipe(
            Stream.take(3),
          ),
        )),
      Then('the stream yields the first three elements and unsubscribes once')((s) => {
        expect(s.values).toEqual([0, 1, 2])
        expect(s.subject.calls).toEqual([undefined])
      }),
    ),
  )
})
