import * as Effect from 'effect/Effect'
import { describe, expect, it } from 'tstyche'
import {
  type Asserted,
  type BodyRefusal,
  expectFor,
  forkTables,
  type Gate,
  type Handle,
  refusedText,
  type RequirementOf,
  type Subject,
} from '../src/kernel'

type Opaque<A = unknown> = A

const consumerTexts = {
  noCheck: 'consumer: yield a check from the callback',
  unprovided: 'consumer: a service is not provided',
  syncBody: 'consumer: pass a generator',
  asyncBody: 'consumer: an async body is refused',
  effectBody: 'consumer: an Effect body is refused',
} as const

type ConsumerGate<R> = Gate<R, never, typeof consumerTexts>

declare const consumerTest: <Y extends Handle<Opaque, Opaque>>(
  name: NoInfer<ConsumerGate<RequirementOf<Y>>>,
  body: (() => Generator<Y, void, never>) | BodyRefusal<typeof consumerTexts>,
) => void

declare const checkHandle: Handle<void, Asserted>
declare const stepHandle: Handle<void>

interface Locator {
  readonly text: string
}

declare const locator: Locator
declare const locatorSubject: Subject<Locator, { readonly toHaveText: (expected: string) => Handle<void, Asserted> }>
declare const written: () => void

describe('a consumer gates its test name with its own texts', () => {
  it('prints the consumer text when a body yields no check', () => {
    expect<ConsumerGate<never>>().type.toBe<(typeof consumerTexts)['noCheck']>()
    expect<ConsumerGate<string>>().type.toBe<(typeof consumerTexts)['unprovided']>()
    expect<ConsumerGate<Asserted>>().type.toBe<string>()
  })

  it('reads the requirement of a handle as it reads an Effect', () => {
    expect<RequirementOf<Handle<void, Asserted>>>().type.toBe<Asserted>()
    expect<RequirementOf<Handle<void>>>().type.toBe<never>()
    expect<RequirementOf<Effect.Effect<void, never, Asserted>>>().type.toBe<Asserted>()
  })

  it('accepts a body that yields a check handle and refuses one that does not', () => {
    expect(consumerTest).type.toBeCallableWith('a test', function*() {
      yield* checkHandle
    })
    expect(consumerTest).type.not.toBeCallableWith('a test', function*() {
      yield* stepHandle
    })
  })

  it('refuses an Effect yielded where only handles are steps', () => {
    expect(consumerTest).type.not.toBeCallableWith('a test', function*() {
      yield* checkHandle
      yield* Effect.sleep('1 second')
    })
  })
})

describe('a consumer passes its own vocabulary to expectFor', () => {
  it('types a matcher a consumer table omits as callable, and keeps the fork table refusing it', () => {
    const { toBeTruthy: _omitted, ...refused } = refusedText
    const loose = expectFor({ written, tables: { ...forkTables, refused } })
    const strict = expectFor({ written })

    expect(loose(1).toBeTruthy).type.toBeCallableWith()
    expect(strict(1).toBeTruthy).type.not.toBeCallableWith()
  })

  it('merges a subject call with the value call, subject first', () => {
    const consumer = expectFor({ written, subjects: [locatorSubject] })

    expect(consumer(locator).toHaveText).type.toBeCallableWith('Ready')
    expect(consumer(1).toEqual).type.toBeCallableWith(1)
    expect(consumer).type.not.toBeCallableWith(true)
  })

  it('exposes `anything` when the table does not refuse it, and refuses what it names', () => {
    const { anything: _omitted, ...refused } = refusedText
    const consumer = expectFor({ written, tables: { ...forkTables, refused } })
    const strict = expectFor({ written })

    expect(consumer.anything).type.toBeCallableWith()
    expect(strict.anything).type.not.toBeCallableWith()
  })
})
