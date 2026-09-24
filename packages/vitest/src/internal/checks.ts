/**
 * The checks a test receives as its callback parameter. There is no importable `expect`: the only one in reach is
 * the one the runner hands this test, so it is bound to this test by construction, not by a lookup.
 *
 * Every matcher returns a `Check`: an Effect that needs `Asserted`, a service only the runner provides.
 * - A check that is not yielded is a floating Effect: `@effect/language-service` `floatingEffect` fails the build.
 * - A body that yields no check has no `Asserted` in its requirements: the test signature refuses it.
 * - A check run outside a test has nothing providing `Asserted`: a type error.
 *
 * @since 4.0.0
 */
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as V from 'vitest'
import { authorize } from './guard.js'
import { booleanRefusal, neededText, negatedText, refusedText, refusePiecewise } from './refusals.js'

/** An opaque runtime value: the fork does not read it, only hands it back. */
type Opaque<A = unknown> = A

type Assertion<A> = V.Assertion<void, A>

/** @internal */
export type MakeAssertion = <A>(actual: A, message?: string) => Assertion<A>

/** @internal */
export type Judgement = (make: MakeAssertion) => void

/**
 * The service a check needs. `judge` counts the check and throws {@link refusePiecewise} when a check already ran
 * since the last {@link AssertedShape.step}; `step` opens a new observed state.
 *
 * @internal
 */
export interface AssertedShape {
  readonly judge: (judgement: Judgement) => void
  readonly step: () => void
}

/** @internal */
export class Asserted extends Context.Service<Asserted, AssertedShape>()('@systemfsoftware/vitest/Asserted') {}

/**
 * An Effect that performs one check. Only the runner can provide what it needs.
 *
 * @internal
 */
export type Check = Effect.Effect<void, never, Asserted>

type View = {
  readonly actual: Opaque
  readonly message: string | undefined
  readonly negated: boolean
  readonly written: (j: Judgement) => void
}

type Refusal<T extends string> = (this: T, ...args: ReadonlyArray<Opaque>) => Check

type StaticRefusal<T extends string> = (this: T, ...args: ReadonlyArray<Opaque>) => never

/** Callable only with the arguments that make it specific; the empty call's `this` type is the rewrite. */
interface Needs<Args extends ReadonlyArray<Opaque>, T extends string> {
  (...args: Args): Check
  (this: T, ...args: ReadonlyArray<Opaque>): Check
}

type MatcherName = Extract<keyof Assertion<Opaque>, `to${string}`>

type ArgsOf<A, K extends MatcherName> = Assertion<A>[K] extends (...args: infer P) => infer _ ? P : never

type Refused = Extract<keyof typeof refusedText, MatcherName>

type Needed = keyof typeof neededText

type NegatedRefused = Extract<keyof typeof negatedText, MatcherName>

/** The values `toThrow(X)` names the error with: a message, a pattern, an error class, or an error instance. */
type ThrowExpected = string | RegExp | (abstract new(...args: ReadonlyArray<never>) => Opaque) | Error

/** The `expect` call itself, as the proxy target's type: the runtime answers through the `apply` trap. */
interface ExpectCall {
  <A>(actual: [A] extends [boolean] ? (typeof booleanRefusal) : A, message?: string): Checked<A>
}

type ExpectBase = ExpectCall & Shapes

/** @internal */
export type Positive<A> =
  & { readonly [K in Exclude<MatcherName, Refused | Needed>]: (...args: ArgsOf<A, K>) => Check }
  & { readonly [K in Refused]: Refusal<(typeof refusedText)[K]> }
  & {
    readonly toThrow: Needs<[expected: ThrowExpected], (typeof neededText)['toThrow']>
    readonly toThrowError: Needs<[expected: ThrowExpected], (typeof neededText)['toThrowError']>
    readonly toSatisfy: Needs<[predicate: (value: A) => boolean, holds: string], (typeof neededText)['toSatisfy']>
    readonly toMatchObject: Needs<ArgsOf<A, 'toMatchObject'>, (typeof neededText)['toMatchObject']>
    readonly resolves: (typeof refusedText)['resolves']
    readonly rejects: (typeof refusedText)['rejects']
  }

/** @internal */
export type Negative<A> =
  & { readonly [K in Exclude<MatcherName, NegatedRefused>]: (...args: ArgsOf<A, K>) => Check }
  & { readonly [K in NegatedRefused]: Refusal<(typeof negatedText)[K]> }

/** @internal */
export type Checked<A> = Positive<A> & { readonly not: Negative<A> }

/** An asymmetric matcher: an opaque value vitest reads when the check runs. */
type Matcher = object

/**
 * The asymmetric matchers that name what a value must be, and the statics the fork refuses by name.
 *
 * @internal
 */
export interface Shapes {
  readonly objectContaining: <T = Opaque>(expected: V.DeeplyAllowMatchers<T>) => Matcher
  readonly arrayContaining: <T = Opaque>(expected: Array<V.DeeplyAllowMatchers<T>>) => Matcher
  readonly stringContaining: (expected: string) => Matcher
  readonly stringMatching: (expected: string | RegExp) => Matcher
  readonly closeTo: (expected: number, precision?: number) => Matcher
  readonly any: (constructor: Opaque) => Matcher
  /** Accepts an Effect Schema directly, or any Standard Schema. */
  readonly schemaMatching: (schema: Opaque) => Matcher
  readonly anything: StaticRefusal<(typeof refusedText)['anything']>
  readonly poll: StaticRefusal<(typeof refusedText)['poll']>
  readonly soft: StaticRefusal<(typeof refusedText)['soft']>
}

/** @internal */
export interface Expect extends Shapes {
  <A>(actual: [A] extends [boolean] ? (typeof booleanRefusal) : A, message?: string): Checked<A>
}

/**
 * What a test body receives.
 *
 * @internal
 */
export interface Checks {
  readonly expect: Expect
}

/** @internal */
export interface Ledger {
  readonly asserted: AssertedShape
  readonly written: (j: Judgement) => void
  readonly unyielded: () => number
  readonly judged: () => number
}

const branded = new WeakSet<object>()

const isObject = (value: Opaque): value is object => typeof value === 'object' && value !== null

/** @internal */
export const isCheck = (value: Opaque): value is Check => isObject(value) && branded.has(value)

const makeCheck = (judgement: Judgement, written: (j: Judgement) => void): Check => {
  written(judgement)
  const check: Check = Effect.gen(function*() {
    const asserted = yield* Asserted
    asserted.judge(judgement)
  })
  branded.add(check)
  return check
}

const has = <T extends object>(table: T, key: string): key is Extract<keyof T, string> => Object.hasOwn(table, key)

const isPlainObject = (value: Opaque): value is object =>
  isObject(value) && Object.getPrototypeOf(value) === Object.prototype

const isEmptyShape = (value: Opaque): boolean => isPlainObject(value) && Object.keys(value).length === 0

/** A thunk that refuses with `text`: thrown when a matcher is called, or when a static is read. */
const refusing = (text: string): () => never => () => {
  throw new Error(text)
}

const forView = (view: View, negated: boolean): View => ({ ...view, negated })

const notView = (view: View): View => forView(view, !view.negated)

const viewFor = (written: (j: Judgement) => void, actual: Opaque, message: string | undefined): View => ({
  actual,
  message,
  negated: false,
  written,
})

const messageOf = (argument: Opaque): string | undefined => typeof argument === 'string' ? argument : undefined

const refuseBooleanActual = (actual: Opaque): boolean => typeof actual === 'boolean'

const refusedTextOf = (property: string): string | undefined =>
  has(refusedText, property) ? refusedText[property] : undefined

const negatedTextOf = (property: string): string | undefined =>
  has(negatedText, property) ? negatedText[property] : undefined

const textRefusalOf = (view: View, property: string): string | undefined =>
  view.negated ? negatedTextOf(property) : refusedTextOf(property)

const readRefusals: Partial<Record<string, string>> = {
  resolves: refusedText.resolves,
  rejects: refusedText.rejects,
}

const readRefusal = (property: string): string | undefined => readRefusals[property]

const neededArity: Record<Needed, number> = { toThrow: 1, toThrowError: 1, toSatisfy: 2, toMatchObject: 1 }

const tooFewArguments = (property: Needed, args: ReadonlyArray<Opaque>): boolean => args.length < neededArity[property]

const vacuousMatchObject = (property: Needed, args: ReadonlyArray<Opaque>): boolean =>
  property === 'toMatchObject' && isEmptyShape(args[0])

const missingArgument = (property: Needed, args: ReadonlyArray<Opaque>): boolean =>
  tooFewArguments(property, args) || vacuousMatchObject(property, args)

const memberAt = <A extends object>(target: A, property: string | symbol): A[keyof A] | undefined =>
  Reflect.get(target, property, target)

const isCallable = (value: Opaque): value is (...args: ReadonlyArray<Opaque>) => Opaque => typeof value === 'function'

const invokeMember = (target: Assertion<Opaque>, property: string, args: ReadonlyArray<Opaque>): void => {
  const member = memberAt(target, property)
  if (isCallable(member)) Reflect.apply(member, target, args)
}

const judgementOf = (view: View, property: string, args: ReadonlyArray<Opaque>): Judgement => (make) => {
  const assertion = make(view.actual, view.message)
  const target = view.negated ? assertion.not : assertion
  invokeMember(target, property, args)
}

const judgedCheck = (view: View, property: string, args: ReadonlyArray<Opaque>): Check =>
  makeCheck(judgementOf(view, property, args), view.written)

const genericMember = (view: View, property: string): (...args: ReadonlyArray<Opaque>) => Check => (...args) =>
  judgedCheck(view, property, args)

const neededMember = (view: View, property: Needed): (...args: ReadonlyArray<Opaque>) => Check => (...args) => {
  if (missingArgument(property, args)) throw new Error(neededText[property])
  return judgedCheck(view, property, args)
}

/** A resolved member: the proxy answers with `value`, or `found` says the property names nothing. */
type Member = { readonly found: true; readonly value: Opaque } | { readonly found: false }

const absent: Member = { found: false }

const present = (value: Opaque): Member => ({ found: true, value })

const valueOf = (member: Member): Opaque => member.found ? member.value : undefined

const fallbackMember = (view: View, property: string): Member =>
  has(neededText, property)
    ? present(neededMember(view, property))
    : present(genericMember(view, property))

const refusedMember = (view: View, property: string): Member => {
  const text = textRefusalOf(view, property)
  if (text === undefined) return absent
  return present(refusing(text))
}

const afterRefusal = (view: View, property: string): Member => {
  const refused = refusedMember(view, property)
  if (refused.found) return refused
  return fallbackMember(view, property)
}

const negationMember = (view: View, property: string): Member =>
  property === 'not' ? present(matcherView(notView(view))) : absent

const viewMember = (view: View, property: string): Member => {
  const negation = negationMember(view, property)
  if (negation.found) return negation
  return afterRefusal(view, property)
}

const memberOf = (view: View, property: string): Opaque => {
  const read = readRefusal(property)
  if (read !== undefined) throw new Error(read)
  return valueOf(viewMember(view, property))
}

const memberFor = (view: View, property: string | symbol): Opaque =>
  typeof property === 'string' ? memberOf(view, property) : undefined

const viewHandler = (view: View): ProxyHandler<object> => ({
  get: (_target, property) => memberFor(view, property),
})

const matcherView = (view: View): object => new Proxy({}, viewHandler(view))

const assertionView = (written: (j: Judgement) => void, args: ReadonlyArray<Opaque>): object => {
  if (refuseBooleanActual(args[0])) throw new Error(booleanRefusal)
  return matcherView(viewFor(written, args[0], messageOf(args[1])))
}

const isDecodingSchema = (value: Opaque): value is Schema.ConstraintDecoder<Opaque> => Schema.isSchema(value)

const asMatcher = (value: Opaque): Matcher => {
  if (isObject(value) === false) throw new Error('vitest returned no asymmetric matcher')
  return value
}

const toStandardSchema = (schema: Opaque): Opaque =>
  isDecodingSchema(schema) ? Schema.toStandardSchemaV1(schema) : schema

const standardSchemaOf = (schema: Opaque): Matcher => asMatcher(V.expect.schemaMatching(toStandardSchema(schema)))

const shapes: Shapes = {
  objectContaining: V.expect.objectContaining,
  arrayContaining: V.expect.arrayContaining,
  stringContaining: V.expect.stringContaining,
  stringMatching: V.expect.stringMatching,
  closeTo: V.expect.closeTo,
  any: V.expect.any,
  schemaMatching: standardSchemaOf,
  anything: refusing(refusedText.anything),
  poll: refusing(refusedText.poll),
  soft: refusing(refusedText.soft),
}

const refusalGetters: ReadonlyArray<readonly [string, string]> = [
  ['anything', refusedText.anything],
  ['poll', refusedText.poll],
  ['soft', refusedText.soft],
]

const defineRefusalGetters = (target: object): void => {
  for (const [name, text] of refusalGetters) {
    Object.defineProperty(target, name, { get: refusing(text) })
  }
}

const unreachableTarget = (): ExpectCall => () => {
  throw new Error('the expect proxy answers every call')
}

const expectHandler = (written: (j: Judgement) => void): ProxyHandler<ExpectBase> => ({
  apply: (_target, _thisArgument, argumentList) => assertionView(written, argumentList),
})

const expectFor = (written: (j: Judgement) => void): Expect => {
  const base: ExpectBase = Object.assign(unreachableTarget(), shapes)
  defineRefusalGetters(base)
  return new Proxy(base, expectHandler(written))
}

/** @internal */
export const makeLedger = (ctx: V.TestContext): Ledger => {
  const pending = new Set<Judgement>()
  const counter = { judged: 0, since: 0 }
  const hard: MakeAssertion = (actual, message) => ctx.expect(actual, message)
  return {
    asserted: {
      judge: (judgement) => {
        pending.delete(judgement)
        counter.judged += 1
        counter.since += 1
        if (counter.since > 1) throw new Error(refusePiecewise)
        authorize(() => judgement(hard))
      },
      step: () => {
        counter.since = 0
      },
    },
    written: (judgement) => {
      pending.add(judgement)
    },
    unyielded: () => pending.size,
    judged: () => counter.judged,
  }
}

/** @internal */
export const checksFor = (ledger: Ledger): Checks => ({ expect: expectFor(ledger.written) })
