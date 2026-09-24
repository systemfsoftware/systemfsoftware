import * as Effect from 'effect/Effect'
import { describe, expect, it } from 'tstyche'
import * as Fork from '../src/mod'

/**
 * The refusal a value carries as its `this` type: the string the compiler prints at the call site (KTD3).
 */
type ThisOf<F> = F extends (this: infer Text, ...args: Array<never>) => infer _ ? Text : never

const refused = {
  toBeDefined:
    '✗ toBeDefined passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).',
  toBeTruthy:
    '✗ toBeTruthy passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).',
  toBeFalsy:
    '✗ toBeFalsy passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).',
  toHaveLength:
    '✗ toHaveLength checks how many, not which. Assert the contents: toEqual([...]); only some of them: toEqual(expect.arrayContaining([...])).',
  toHaveProperty:
    '✗ toHaveProperty checks one key at a time. Assert the shape once: toMatchObject({ key: value, ... }).',
  toBeInstanceOf:
    '✗ toBeInstanceOf checks the kind of value, not the value. Assert the value: toEqual(expected); only its shape: toEqual(expect.schemaMatching(Schema)).',
  toBeTypeOf:
    '✗ toBeTypeOf checks the kind of value, not the value. Assert the value: toEqual(expected); only its shape: toEqual(expect.schemaMatching(Schema)).',
  toHaveBeenCalled:
    '✗ toHaveBeenCalled passes for any call with any arguments. Assert what the call carried: toHaveBeenCalledExactlyOnceWith(...args).',
  toHaveBeenCalledTimes:
    '✗ toHaveBeenCalledTimes counts calls, not what they carried. Assert the calls: toHaveBeenNthCalledWith(n, ...args), or all of them: expect(spy.mock.calls).toEqual([[...], [...]]).',
  toMatchSnapshot:
    '✗ a snapshot records what the code does now, not what it should do, and cannot fail on the run that writes it. State the expected value: toEqual(expected).',
  toMatchInlineSnapshot:
    '✗ a snapshot records what the code does now, not what it should do, and cannot fail on the run that writes it. State the expected value: toEqual(expected).',
  toMatchFileSnapshot:
    '✗ a snapshot records what the code does now, not what it should do, and cannot fail on the run that writes it. State the expected value: toEqual(expected).',
  toThrowErrorMatchingSnapshot:
    '✗ a snapshot records what the code does now, not what it should do, and cannot fail on the run that writes it. Name the error: toThrow(MyError).',
  toThrowErrorMatchingInlineSnapshot:
    '✗ a snapshot records what the code does now, not what it should do, and cannot fail on the run that writes it. Name the error: toThrow(MyError).',
  notToBeNull:
    '✗ not.toBeNull passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).',
  notToBeUndefined:
    '✗ not.toBeUndefined passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).',
  promiseChain:
    '✗ .resolves/.rejects assert on a Promise outside the test runtime. Yield the Effect: const value = yield* program; its failure: const error = yield* Effect.flip(program); then yield* expect(error).toEqual(new MyError(...)).',
  anything:
    '✗ expect.anything() matches every value. Say what the value must be: expect.any(Money), expect.objectContaining({ ... }), expect.schemaMatching(Schema).',
} as const

const needed = {
  toThrow:
    '✗ toThrow() passes for any error. Name the one expected: toThrow(MyError) or toThrow("message"). An Effect failure is a value: const error = yield* Effect.flip(program); yield* expect(error).toEqual(new MyError(...)).',
  toThrowError:
    '✗ toThrowError() passes for any error. Name the one expected: toThrow(MyError) or toThrow("message"). An Effect failure is a value: const error = yield* Effect.flip(program); yield* expect(error).toEqual(new MyError(...)).',
  toSatisfy:
    '✗ toSatisfy(predicate) fails with \'expected x to satisfy [Function]\'. Say what must hold: toSatisfy(predicate, "every line has a positive quantity").',
} as const

const habit = {
  effectLane:
    '✗ it.effect is removed: the body is the generator itself, so the runner sees every step. it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).',
} as const

const gate = {
  noCheck:
    "✗ this test yields no check, so it cannot fail. Yield one from the test's own expect: it(name, function* ({ expect }) { yield* expect(actual).toEqual(expected) }). An expect imported from vitest does not count.",
  unprovided:
    '✗ the test needs a service that nothing provides. Write the test inside layer(Service.layer)((it) => { it(name, ...) }); every test gets its own fresh build.',
} as const

declare const throws: () => void
declare const swept: () => void

describe('the curated vocabulary refuses a weak claim by name (R6)', () => {
  it('carries the rewrite as the `this` type of every refused name', () => {
    Fork.it('a test that reads the vocabulary', function*({ expect: check }) {
      const toBeDefined = check(1).toBeDefined
      const toBeTruthy = check('value').toBeTruthy
      const toBeFalsy = check('').toBeFalsy
      const toHaveLength = check([1, 2]).toHaveLength
      const toHaveProperty = check({ key: 1 }).toHaveProperty
      const toBeInstanceOf = check([]).toBeInstanceOf
      const toBeTypeOf = check('value').toBeTypeOf
      const toHaveBeenCalled = check(swept).toHaveBeenCalled
      const toHaveBeenCalledTimes = check(swept).toHaveBeenCalledTimes
      const toMatchSnapshot = check({ key: 1 }).toMatchSnapshot
      const toMatchInlineSnapshot = check({ key: 1 }).toMatchInlineSnapshot
      const toMatchFileSnapshot = check({ key: 1 }).toMatchFileSnapshot
      const toThrowErrorMatchingSnapshot = check(throws).toThrowErrorMatchingSnapshot
      const toThrowErrorMatchingInlineSnapshot = check(throws).toThrowErrorMatchingInlineSnapshot
      const toBeNull = check(1).not.toBeNull
      const toBeUndefined = check(1).not.toBeUndefined
      const resolves = check(Promise.resolve(1)).resolves
      const rejects = check(Promise.reject(new Error('x'))).rejects
      const anything = check.anything

      expect<ThisOf<typeof toBeDefined>>().type.toBe<(typeof refused)['toBeDefined']>()
      expect<ThisOf<typeof toBeTruthy>>().type.toBe<(typeof refused)['toBeTruthy']>()
      expect<ThisOf<typeof toBeFalsy>>().type.toBe<(typeof refused)['toBeFalsy']>()
      expect<ThisOf<typeof toHaveLength>>().type.toBe<(typeof refused)['toHaveLength']>()
      expect<ThisOf<typeof toHaveProperty>>().type.toBe<(typeof refused)['toHaveProperty']>()
      expect<ThisOf<typeof toBeInstanceOf>>().type.toBe<(typeof refused)['toBeInstanceOf']>()
      expect<ThisOf<typeof toBeTypeOf>>().type.toBe<(typeof refused)['toBeTypeOf']>()
      expect<ThisOf<typeof toHaveBeenCalled>>().type.toBe<(typeof refused)['toHaveBeenCalled']>()
      expect<ThisOf<typeof toHaveBeenCalledTimes>>().type.toBe<(typeof refused)['toHaveBeenCalledTimes']>()
      expect<ThisOf<typeof toMatchSnapshot>>().type.toBe<(typeof refused)['toMatchSnapshot']>()
      expect<ThisOf<typeof toMatchInlineSnapshot>>().type.toBe<(typeof refused)['toMatchInlineSnapshot']>()
      expect<ThisOf<typeof toMatchFileSnapshot>>().type.toBe<(typeof refused)['toMatchFileSnapshot']>()
      expect<ThisOf<typeof toThrowErrorMatchingSnapshot>>().type.toBe<
        (typeof refused)['toThrowErrorMatchingSnapshot']
      >()
      expect<ThisOf<typeof toThrowErrorMatchingInlineSnapshot>>().type.toBe<
        (typeof refused)['toThrowErrorMatchingInlineSnapshot']
      >()
      expect<ThisOf<typeof toBeNull>>().type.toBe<(typeof refused)['notToBeNull']>()
      expect<ThisOf<typeof toBeUndefined>>().type.toBe<(typeof refused)['notToBeUndefined']>()
      expect<typeof resolves>().type.toBe<(typeof refused)['promiseChain']>()
      expect<typeof rejects>().type.toBe<(typeof refused)['promiseChain']>()
      expect<ThisOf<typeof anything>>().type.toBe<(typeof refused)['anything']>()

      expect(toBeDefined).type.not.toBeCallableWith()
      expect(toHaveLength).type.not.toBeCallableWith(2)
      expect(check(1).toEqual).type.toBeCallableWith(1)
      yield* check(1).toEqual(1)
    })
  })

  it('refuses the claims that need their specific argument', () => {
    Fork.it('a test that reads the argument-bearing claims', function*({ expect: check }) {
      const toThrow = check(throws).toThrow
      const toThrowError = check(throws).toThrowError
      const toSatisfy = check([1]).toSatisfy

      expect<ThisOf<typeof toThrow>>().type.toBe<(typeof needed)['toThrow']>()
      expect<ThisOf<typeof toThrowError>>().type.toBe<(typeof needed)['toThrowError']>()
      expect<ThisOf<typeof toSatisfy>>().type.toBe<(typeof needed)['toSatisfy']>()

      expect(toThrow).type.toBeCallableWith(Error)
      expect(toThrow).type.not.toBeCallableWith()
      expect(toThrowError).type.toBeCallableWith('apple is out of stock')
      expect(toThrowError).type.not.toBeCallableWith()
      expect(toSatisfy).type.toBeCallableWith((quantities: Array<number>) => quantities.length > 0, 'not empty')
      expect(toSatisfy).type.not.toBeCallableWith((quantities: Array<number>) => quantities.length > 0)
      expect(check({ key: 1 }).toMatchObject).type.toBeCallableWith({ key: 1 })
      yield* check(1).toEqual(1)
    })
  })

  it('refuses a boolean actual', () => {
    Fork.it('a test that reads the boolean claim', function*({ expect: check }) {
      expect(check).type.toBeCallableWith(1)
      expect(check).type.not.toBeCallableWith(true)
      expect(check).type.not.toBeCallableWith(false)
      yield* check(1).toEqual(1)
    })
  })
})

describe('the test name carries the gate refusal (KTD4)', () => {
  it('refuses a name whose body yields no check, and one whose body needs what nothing provides', () => {
    expect<Fork.Gate<never, never>>().type.toBe<(typeof gate)['noCheck']>()
    expect<Fork.Gate<string, never>>().type.toBe<(typeof gate)['unprovided']>()
  })
})

describe('the habit names a test author reaches for are refusals (R9)', () => {
  it('carries the rewrite as the `this` type of every removed lane', () => {
    expect<ThisOf<typeof Fork.it.effect>>().type.toBe<(typeof habit)['effectLane']>()
    expect<ThisOf<typeof Fork.it.scoped>>().type.toBe<(typeof habit)['effectLane']>()
    expect<ThisOf<typeof Fork.it.scopedLive>>().type.toBe<(typeof habit)['effectLane']>()
  })

  it('refuses the removed lanes and keeps the real-clock lane', () => {
    expect(Fork.it.effect).type.not.toBeCallableWith('a test', () => Effect.void)
    expect(Fork.it.scoped).type.not.toBeCallableWith('a test', () => Effect.void)
    expect(Fork.it.scopedLive).type.not.toBeCallableWith('a test', () => Effect.void)

    Fork.it.live('a test that yields its check on the real clock', function*({ expect: check }) {
      yield* check(1).toEqual(1)
    })
  })
})

const body = {
  sync:
    '✗ the body must be a generator that yields its checks: it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).',
  async:
    '✗ an async body runs outside the test runtime. Pass a generator: it(name, function* ({ expect }) { yield* expect(actual).toEqual(expected) }).',
  effect:
    '✗ the body returned an Effect, so the runner cannot see its steps. Pass the generator itself: it(name, function* ({ expect }) { ... }).',
} as const

describe('a body that is not the generator carries its own rewrite (R2)', () => {
  it('pins every body refusal the call accepts, text by text', () => {
    expect<Extract<Fork.Vitest.BodyRefusal, `✗ the body must be a generator${string}`>>().type.toBe<
      (typeof body)['sync']
    >()
    expect<Extract<Fork.Vitest.BodyRefusal, `✗ an async body${string}`>>().type.toBe<(typeof body)['async']>()
    expect<Extract<Fork.Vitest.BodyRefusal, `✗ the body returned an Effect${string}`>>().type.toBe<
      (typeof body)['effect']
    >()
  })
})
