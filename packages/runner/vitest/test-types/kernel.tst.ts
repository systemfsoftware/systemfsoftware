import * as Effect from 'effect/Effect'
import { describe, expect, it } from 'tstyche'
import type * as V from 'vitest'
import {
  type Asserted,
  type BodyRefusal,
  expectFor,
  type Gate,
  type GateTexts,
  type Handle,
  type Ledger,
  makeHandle,
  makeLedger,
  type RequirementOf,
  type Subject,
} from '../src/kernel'
import * as Fork from '../src/mod'

type Opaque<A = unknown> = A

type ThisOf<F> = F extends (this: infer Text, ...args: Array<never>) => infer _ ? Text : never

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
declare const check: Effect.Effect<void, never, Asserted>

const plainHandle = () => makeHandle({ effect: Effect.void })
const checkedHandle = () => makeHandle({ effect: check })

interface Locator {
  readonly text: string
}

declare const locator: Locator
declare const locatorSubject: Subject<Locator, { readonly toHaveText: (expected: string) => Handle<void, Asserted> }>
declare const ctx: V.TestContext
declare const forkLedger: Ledger

describe('a consumer gates its test name with its own texts', () => {
  it('prints the consumer text when a body yields no check', () => {
    expect<ConsumerGate<never>>().type.toBe<(typeof consumerTexts)['noCheck']>()
    expect<ConsumerGate<string>>().type.toBe<(typeof consumerTexts)['unprovided']>()
    expect<ConsumerGate<Asserted>>().type.toBe<string>()
  })

  it('leaves no name that compiles when the texts are not literal types', () => {
    expect<Gate<never, never, GateTexts>>().type.toBe<never>()
    expect<Gate<string, never, GateTexts>>().type.toBe<never>()
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

describe('a handle takes its requirement from the Effect it carries', () => {
  it('claims Asserted only when its Effect needs it', () => {
    expect<RequirementOf<ReturnType<typeof plainHandle>>>().type.toBe<never>()
    expect<RequirementOf<ReturnType<typeof checkedHandle>>>().type.toBe<Asserted>()
    expect(makeHandle).type.not.toBeCallableWith({ opensState: true })
  })
})

describe('the fork keeps reading Effects only', () => {
  it('refuses a body that yields only handles, as it did before the kernel', () => {
    expect<Fork.Vitest.RequirementOf<Handle<void, Asserted>>>().type.toBe<never>()
    expect<Fork.Vitest.RequirementOf<Effect.Effect<void, never, Asserted>>>().type.toBe<Asserted>()
  })
})

describe('a consumer passes its own vocabulary to its ledger', () => {
  it('types a reworded row with the consumer text, and keeps every other fork row refusing', () => {
    const consumer = expectFor({
      ledger: makeLedger({ ctx, tables: { refused: { toBeTruthy: 'consumer: assert the value' } } }),
    })
    const reworded = consumer(1).toBeTruthy

    expect(reworded).type.not.toBeCallableWith()
    expect<ThisOf<typeof reworded>>().type.toBe<'consumer: assert the value'>()
    expect(consumer(1).toBeFalsy).type.not.toBeCallableWith()
    expect(consumer(1).toBeCloseTo).type.toBeCallableWith(1)
  })

  it('refuses what the fork refuses whatever the table omits', () => {
    const consumer = expectFor({ ledger: makeLedger({ ctx, tables: { refused: {}, needed: {} } }) })

    expect(consumer(1).toBeTruthy).type.not.toBeCallableWith()
    expect(consumer.anything).type.not.toBeCallableWith()
    expect(consumer.soft).type.not.toBeCallableWith()
    expect(consumer.poll).type.not.toBeCallableWith()
    expect(consumer(() => 1).toThrow).type.not.toBeCallableWith()
  })

  it('adds a refusal the fork does not have', () => {
    const consumer = expectFor({ ledger: makeLedger({ ctx, tables: { refused: { toBeCloseTo: 'consumer: no' } } }) })

    expect(consumer(1).toBeCloseTo).type.not.toBeCallableWith(1)
  })

  it('accepts a reworded need and refuses a need the fork has no arity for', () => {
    expect(makeLedger).type.toBeCallableWith({ ctx, tables: { needed: { toThrow: 'consumer: name it' } } })
    expect(makeLedger).type.not.toBeCallableWith({ ctx, tables: { needed: { toBeNull: 'consumer: name it' } } })
  })

  it('merges a subject call with the value call, subject first', () => {
    const consumer = expectFor({ ledger: forkLedger, subjects: [locatorSubject] })

    expect(consumer(locator).toHaveText).type.toBeCallableWith('Ready')
    expect(consumer(1).toEqual).type.toBeCallableWith(1)
    expect(consumer).type.not.toBeCallableWith(true)
  })
})
