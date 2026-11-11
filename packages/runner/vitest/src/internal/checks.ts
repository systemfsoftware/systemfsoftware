/**
 * The checks a test receives as its callback parameter. There is no importable `expect`: the only one in reach is
 * the one the runner hands this test, so it is bound to this test by construction, not by a lookup.
 *
 * Every matcher returns a `Check`: an Effect that needs `Asserted`, a service only the runner provides.
 * - A check that is not yielded is a floating Effect: `@effect/language-service` `floatingEffect` fails the build.
 * - A body that yields no check has no `Asserted` in its requirements: the test signature refuses it.
 * - A check run outside a test has nothing providing `Asserted`: a type error.
 *
 * The vocabulary is data. {@link Tables} says which matchers are refused and with what text, {@link Subject}s add
 * check surfaces for values of their own. Every consumer admits one check per observed state, and `soft` and `poll`
 * stay refused whatever a table says. The fork passes its own tables; a library that consumes the kernel passes its own.
 *
 * @since 4.0.0
 */
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'
import * as V from 'vitest'
import { callFrame, withRaisingFrame } from './call-site.js'
import { authorize } from './guard.js'
import { type ForkTables, forkTables, refusalOf, refusedText, refusePiecewise, type Tables } from './refusals.js'

/** An opaque runtime value: the fork does not read it, only hands it back. */
type Opaque<A = unknown> = A

type Assertion<A> = V.Assertion<void, A>

/** @internal */
export type MakeAssertion = <A>(actual: A, message?: string) => Assertion<A>

/** @internal */
export type Judgement = (make: MakeAssertion) => Opaque

/**
 * The service a check needs. `judge` throws the piecewise refusal when the window already holds a check; `step` opens
 * a new observed state.
 *
 * @internal
 */
export interface AssertedShape {
  readonly judge: (judgement: Judgement) => Opaque
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
  /** The site the body called `expect` from, captured there because the fork judges the check later (KTD6). */
  readonly site: string | undefined
  readonly tables: Tables
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

/** The values `toThrow(X)` names the error with: a message, a pattern, an error class, or an error instance. */
type ThrowExpected = string | RegExp | (abstract new(...args: ReadonlyArray<never>) => Opaque) | Error

interface NeededArgs<A> {
  readonly toThrow: [expected: ThrowExpected]
  readonly toThrowError: [expected: ThrowExpected]
  readonly toSatisfy: [predicate: (value: A) => boolean, holds: string]
  readonly toMatchObject: ArgsOf<A, 'toMatchObject'>
}

type NeededName = keyof NeededArgs<Opaque>

type ReadName = 'resolves' | 'rejects'

type RefusedStaticName = 'poll' | 'soft'

type RefusedStatics<T extends Tables> = RefusedStaticName | Extract<'anything', keyof T['refused']>

type StaticText<T extends Tables, K extends 'anything' | RefusedStaticName> = K extends keyof T['refused']
  ? T['refused'][K]
  : ForkTables['refused'][K]

type Refused<T extends Tables> = Extract<keyof T['refused'], MatcherName>

type NegatedRefused<T extends Tables> = Extract<keyof T['negated'], MatcherName>

type Needed<T extends Tables> = Extract<keyof T['needed'], NeededName>

/** @internal */
export type Positive<A, T extends Tables = ForkTables> =
  & { readonly [K in Exclude<MatcherName, Refused<T> | Needed<T>>]: (...args: ArgsOf<A, K>) => Check }
  & { readonly [K in Refused<T>]: Refusal<T['refused'][K]> }
  & { readonly [K in Needed<T>]: Needs<NeededArgs<A>[K], T['needed'][K]> }
  & { readonly [K in Extract<keyof T['refused'], ReadName>]: T['refused'][K] }

/** @internal */
export type Negative<A, T extends Tables = ForkTables> =
  & { readonly [K in Exclude<MatcherName, NegatedRefused<T>>]: (...args: ArgsOf<A, K>) => Check }
  & { readonly [K in NegatedRefused<T>]: Refusal<T['negated'][K]> }

/** @internal */
export type Checked<A, T extends Tables = ForkTables> = Positive<A, T> & { readonly not: Negative<A, T> }

/** An asymmetric matcher: an opaque value vitest reads when the check runs. */
type Matcher = object

/**
 * The asymmetric matchers vitest builds: each names what a value must be, and only vitest reads the result.
 *
 * @internal
 */
export interface Matchers {
  readonly objectContaining: <T = Opaque>(expected: V.DeeplyAllowMatchers<T>) => Matcher
  readonly arrayContaining: <T = Opaque>(expected: Array<V.DeeplyAllowMatchers<T>>) => Matcher
  readonly stringContaining: (expected: string) => Matcher
  readonly stringMatching: (expected: string | RegExp) => Matcher
  readonly closeTo: (expected: number, precision?: number) => Matcher
  /** Accepts an Effect Schema directly, or any Standard Schema. */
  readonly schemaMatching: (schema: Opaque) => Matcher
}

/**
 * `expect.not.<matcher>`: the four asymmetric matchers whose negation states an absence honestly.
 *
 * @internal
 */
export type NegatedMatchers = Pick<
  Matchers,
  'objectContaining' | 'arrayContaining' | 'stringContaining' | 'stringMatching'
>

type Statics = Matchers & { readonly any: (constructor: Opaque) => Matcher; readonly not: NegatedMatchers }

type AnythingOf<T extends Tables> = 'anything' extends keyof T['refused'] ? Opaque
  : { readonly anything: () => Matcher }

/**
 * The asymmetric matchers that name what a value must be, the same matchers negated, and the statics a table
 * refuses by name. `anything` is vitest's own when the table leaves it out, and `poll` and `soft` are refused
 * whatever a table says.
 *
 * @internal
 */
export type Shapes<T extends Tables = ForkTables> =
  & Statics
  & { readonly [K in RefusedStatics<T>]: StaticRefusal<StaticText<T, K>> }
  & AnythingOf<T>

/**
 * A check surface for values of a library's own. `matches` says whether `expect(actual)` is this subject's, and
 * `checks` builds what `expect(actual)` returns: its matchers mint checks with the `mint` they are handed.
 *
 * @internal
 */
export interface Subject<A, C> {
  readonly matches: (actual: Opaque) => actual is A
  readonly checks: (actual: A, mint: Mint) => C
}

/** @internal */
export interface AnySubject {
  readonly matches: (actual: Opaque) => boolean
  readonly checks: (actual: never, mint: Mint) => Opaque
}

/** @internal */
export type Mint = (judgement: Judgement) => Check

type SubjectCall<Subj> = Subj extends {
  readonly matches: (actual: Opaque) => actual is infer A
  readonly checks: (actual: never, mint: Mint) => infer C
} ? (actual: A) => C
  : never

type SubjectCalls<S extends ReadonlyArray<AnySubject>> = S extends
  readonly [infer Head, ...infer Tail extends ReadonlyArray<AnySubject>] ? SubjectCall<Head> & SubjectCalls<Tail>
  : Opaque

interface ExpectCall<T extends Tables> {
  <A>(actual: [A] extends [boolean] ? T['boolean'] : A, message?: string): Checked<A, T>
}

/** @internal */
export type Expect<T extends Tables = ForkTables, S extends ReadonlyArray<AnySubject> = readonly []> =
  & SubjectCalls<S>
  & ExpectCall<T>
  & Shapes<T>

/**
 * What a test body receives.
 *
 * @internal
 */
export interface Checks<T extends Tables = ForkTables, S extends ReadonlyArray<AnySubject> = readonly []> {
  readonly expect: Expect<T, S>
}

/** @internal */
export interface LedgerOptions {
  readonly piecewise?: string
}

/** @internal */
export interface LedgerInput extends LedgerOptions {
  readonly ctx: V.TestContext
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

const settled = (outcome: Opaque): Effect.Effect<void> =>
  Predicate.isPromiseLike(outcome) ? Effect.asVoid(Effect.promise(() => outcome)) : Effect.void

/** @internal */
export interface MintInput {
  readonly written: (j: Judgement) => void
  readonly judgement: Judgement
}

/** @internal */
export const mintCheck = ({ judgement, written }: MintInput): Check => {
  written(judgement)
  const check: Check = Effect.gen(function*() {
    const asserted = yield* Asserted
    yield* settled(asserted.judge(judgement))
  })
  branded.add(check)
  return check
}

const textIn = (table: Readonly<Record<string, string>>, key: string): string | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined

const isPlainObject = (value: Opaque): value is object =>
  isObject(value) && Object.getPrototypeOf(value) === Object.prototype

const isEmptyShape = (value: Opaque): boolean => isPlainObject(value) && Object.keys(value).length === 0

/** A thunk that refuses with `text`: thrown when a matcher is called, or when a static is read. */
const refusing = (text: string): () => never => () => {
  throw refusalOf(text)
}

const forView = (view: View, negated: boolean): View => ({ ...view, negated })

const notView = (view: View): View => forView(view, !view.negated)

const viewFor = (
  written: (j: Judgement) => void,
  tables: Tables,
  actual: Opaque,
  message: string | undefined,
  site: string | undefined,
): View => ({
  actual,
  message,
  negated: false,
  written,
  site,
  tables,
})

const messageOf = (argument: Opaque): string | undefined => typeof argument === 'string' ? argument : undefined

const refuseBooleanActual = (actual: Opaque): boolean => typeof actual === 'boolean'

const textRefusalOf = (view: View, property: string): string | undefined =>
  textIn(view.negated ? view.tables.negated : view.tables.refused, property)

const isReadName = (property: string): property is ReadName => property === 'resolves' || property === 'rejects'

const readRefusal = (tables: Tables, property: string): string | undefined =>
  isReadName(property) ? textIn(tables.refused, property) : undefined

const neededArity: Readonly<Record<string, number>> = { toThrow: 1, toThrowError: 1, toSatisfy: 2, toMatchObject: 1 }

const arityOf = (property: string): number => neededArity[property] ?? 0

const tooFewArguments = (property: string, args: ReadonlyArray<Opaque>): boolean => args.length < arityOf(property)

const vacuousMatchObject = (property: string, args: ReadonlyArray<Opaque>): boolean =>
  property === 'toMatchObject' && isEmptyShape(args[0])

const missingArgument = (property: string, args: ReadonlyArray<Opaque>): boolean =>
  tooFewArguments(property, args) || vacuousMatchObject(property, args)

const memberAt = <A extends object>(target: A, property: string | symbol): A[keyof A] | undefined =>
  Reflect.get(target, property, target)

const isCallable = (value: Opaque): value is (...args: ReadonlyArray<Opaque>) => Opaque => typeof value === 'function'

const invokeMember = (target: Assertion<Opaque>, property: string, args: ReadonlyArray<Opaque>): Opaque => {
  const member = memberAt(target, property)
  return isCallable(member) ? Reflect.apply(member, target, args) : undefined
}

const judgedBy = (view: View, property: string, args: ReadonlyArray<Opaque>, make: MakeAssertion): Opaque => {
  const assertion = make(view.actual, view.message)
  const target = view.negated ? assertion.not : assertion
  return invokeMember(target, property, args)
}

const raisedFailure = (thrown: Opaque, site: string | undefined): Opaque =>
  thrown instanceof Error ? withRaisingFrame(thrown, site) : thrown

const framedOutcome = (outcome: Opaque, site: string | undefined): Opaque =>
  Predicate.isPromiseLike(outcome)
    ? outcome.then(undefined, (thrown: Opaque) => Promise.reject(raisedFailure(thrown, site)))
    : outcome

/**
 * A failed judgement is a failure the fork raised: by now the stack holds only the fork's frames, so the site the
 * body called `expect` from is prepended to the error's stack (R2, KTD6).
 */
const framedJudgement = (judgement: Judgement, site: string | undefined): Judgement => (make) => {
  try {
    return framedOutcome(judgement(make), site)
  } catch (thrown) {
    throw raisedFailure(thrown, site)
  }
}

const judgementOf = (view: View, property: string, args: ReadonlyArray<Opaque>): Judgement =>
  framedJudgement((make) => judgedBy(view, property, args, make), view.site)

const judgedCheck = (view: View, property: string, args: ReadonlyArray<Opaque>): Check =>
  mintCheck({ written: view.written, judgement: judgementOf(view, property, args) })

const genericMember = (view: View, property: string): (...args: ReadonlyArray<Opaque>) => Check => (...args) =>
  judgedCheck(view, property, args)

const neededMember =
  (view: View, property: string, text: string): (...args: ReadonlyArray<Opaque>) => Check => (...args) => {
    if (missingArgument(property, args)) throw refusalOf(text)
    return judgedCheck(view, property, args)
  }

/** A resolved member: the proxy answers with `value`, or `found` says the property names nothing. */
type Member = { readonly found: true; readonly value: Opaque } | { readonly found: false }

const absent: Member = { found: false }

const present = (value: Opaque): Member => ({ found: true, value })

const valueOf = (member: Member): Opaque => member.found ? member.value : undefined

const neededOrGeneric = (view: View, property: string, text: string | undefined): Member =>
  text === undefined ? present(genericMember(view, property)) : present(neededMember(view, property, text))

const fallbackMember = (view: View, property: string): Member =>
  neededOrGeneric(view, property, textIn(view.tables.needed, property))

const refusedMember = (view: View, property: string): Member => {
  const text = textRefusalOf(view, property)
  return text === undefined ? absent : present(refusing(text))
}

const afterRefusal = (view: View, property: string): Member => {
  const refused = refusedMember(view, property)
  return refused.found ? refused : fallbackMember(view, property)
}

const negationMember = (view: View, property: string): Member =>
  property === 'not' ? present(matcherView(notView(view))) : absent

const viewMember = (view: View, property: string): Member => {
  const negation = negationMember(view, property)
  return negation.found ? negation : afterRefusal(view, property)
}

const memberOf = (view: View, property: string): Opaque => {
  const read = readRefusal(view.tables, property)
  if (read !== undefined) throw refusalOf(read)
  return valueOf(viewMember(view, property))
}

const memberFor = (view: View, property: string | symbol): Opaque =>
  typeof property === 'string' ? memberOf(view, property) : undefined

const viewHandler = (view: View): ProxyHandler<object> => ({
  get: (_target, property) => memberFor(view, property),
})

const matcherView = (view: View): object => new Proxy({}, viewHandler(view))

const subjectOf = (subjects: ReadonlyArray<AnySubject>, actual: Opaque): AnySubject | undefined =>
  subjects.find((subject) => subject.matches(actual))

const mintFor = (written: (j: Judgement) => void, site: string | undefined): Mint => (judgement) =>
  mintCheck({ written, judgement: framedJudgement(judgement, site) })

const refuseBoolean = (tables: Tables, actual: Opaque): void => {
  if (refuseBooleanActual(actual)) throw refusalOf(tables.boolean)
}

const valueView = (written: (j: Judgement) => void, tables: Tables, args: ReadonlyArray<Opaque>): object => {
  refuseBoolean(tables, args[0])
  return matcherView(viewFor(written, tables, args[0], messageOf(args[1]), callFrame()))
}

const checksOf = (subject: AnySubject, actual: Opaque, mint: Mint): Opaque =>
  Reflect.apply(subject.checks, subject, [actual, mint])

const assertionView = (
  written: (j: Judgement) => void,
  tables: Tables,
  subjects: ReadonlyArray<AnySubject>,
  args: ReadonlyArray<Opaque>,
): Opaque => {
  const subject = subjectOf(subjects, args[0])
  return subject === undefined
    ? valueView(written, tables, args)
    : checksOf(subject, args[0], mintFor(written, callFrame()))
}

const isDecodingSchema = (value: Opaque): value is Schema.ConstraintDecoder<Opaque> => Schema.isSchema(value)

const asMatcher = (value: Opaque): Matcher => {
  if (isObject(value) === false) throw new Error('vitest returned no asymmetric matcher')
  return value
}

const toStandardSchema = (schema: Opaque): Opaque =>
  isDecodingSchema(schema) ? Schema.toStandardSchemaV1(schema) : schema

const standardSchemaOf = (schema: Opaque): Matcher => asMatcher(V.expect.schemaMatching(toStandardSchema(schema)))

const notShapes: NegatedMatchers = {
  stringContaining: V.expect.not.stringContaining,
  objectContaining: V.expect.not.objectContaining,
  arrayContaining: V.expect.not.arrayContaining,
  stringMatching: V.expect.not.stringMatching,
}

const shapes: Statics = {
  objectContaining: V.expect.objectContaining,
  arrayContaining: V.expect.arrayContaining,
  stringContaining: V.expect.stringContaining,
  stringMatching: V.expect.stringMatching,
  closeTo: V.expect.closeTo,
  any: V.expect.any,
  schemaMatching: standardSchemaOf,
  not: notShapes,
}

const refusedStatics: ReadonlyArray<RefusedStaticName> = ['poll', 'soft']

const defineRefused = (target: object, tables: Tables, name: RefusedStaticName): void => {
  const text = textIn(tables.refused, name) ?? refusedText[name]
  Object.defineProperty(target, name, { get: refusing(text) })
}

const defineAnything = (target: object, tables: Tables): void => {
  const text = textIn(tables.refused, 'anything')
  const descriptor = text === undefined ? { value: V.expect.anything, enumerable: true } : { get: refusing(text) }
  Object.defineProperty(target, 'anything', descriptor)
}

const unreachableTarget = (): ExpectCall<Tables> => () => {
  throw new Error('the expect proxy answers every call')
}

/** @internal */
export interface ExpectOptions<T extends Tables, S extends ReadonlyArray<AnySubject>> {
  readonly written: (j: Judgement) => void
  readonly tables?: T
  readonly subjects?: S
}

const tablesOf = (options: { readonly tables?: Tables }): Tables => options.tables ?? forkTables

const subjectsOfOptions = (options: { readonly subjects?: ReadonlyArray<AnySubject> }): ReadonlyArray<AnySubject> =>
  options.subjects ?? []

const baseFor = (tables: Tables): object => {
  const base = Object.assign(unreachableTarget(), shapes)
  defineAnything(base, tables)
  for (const name of refusedStatics) defineRefused(base, tables, name)
  return base
}

const proxyFor = (
  options: {
    readonly written: (j: Judgement) => void
    readonly tables?: Tables
    readonly subjects?: ReadonlyArray<AnySubject>
  },
): object => {
  const tables = tablesOf(options)
  const subjects = subjectsOfOptions(options)
  return new Proxy(baseFor(tables), {
    apply: (_target, _thisArgument, argumentList) => assertionView(options.written, tables, subjects, argumentList),
  })
}

const claims = <X extends object>(_value: object): _value is X => true

const expectOf = <X extends object>(proxy: object): X => {
  if (!claims<X>(proxy)) throw new Error('the expect proxy is the expect')
  return proxy
}

/** @internal */
export const expectFor = <
  T extends Tables = ForkTables,
  const S extends ReadonlyArray<AnySubject> = readonly [],
>(
  options: ExpectOptions<T, S>,
): Expect<T, S> => expectOf(proxyFor(options))

const piecewiseOf = (options: LedgerOptions): string => options.piecewise ?? refusePiecewise

interface Window {
  readonly count: () => number
  readonly clear: () => void
}

const makeWindow = (): Window => {
  const state = { since: 0 }
  return {
    count: () => {
      state.since += 1
      return state.since
    },
    clear: () => {
      state.since = 0
    },
  }
}

interface LedgerState {
  readonly pending: Set<Judgement>
  readonly counter: { judged: number }
  readonly window: Window
  readonly piecewise: string
}

const stateOf = (options: LedgerOptions): LedgerState => ({
  pending: new Set(),
  counter: { judged: 0 },
  window: makeWindow(),
  piecewise: piecewiseOf(options),
})

const refuseOver = (count: number, text: string): void => {
  if (count > 1) throw refusalOf(text)
}

const judging = (state: LedgerState, hard: MakeAssertion): AssertedShape['judge'] => (judgement) => {
  state.pending.delete(judgement)
  state.counter.judged += 1
  refuseOver(state.window.count(), state.piecewise)
  return authorize(() => judgement(hard))
}

/** @internal */
export const makeLedger = ({ ctx, ...options }: LedgerInput): Ledger => {
  const state = stateOf(options)
  const hard: MakeAssertion = (actual, message) => ctx.expect(actual, message)
  return {
    asserted: { judge: judging(state, hard), step: state.window.clear },
    written: (judgement) => {
      state.pending.add(judgement)
    },
    unyielded: () => state.pending.size,
    judged: () => state.counter.judged,
  }
}

/** @internal */
export const checksFor = (ledger: Ledger): Checks => ({ expect: expectFor({ written: ledger.written }) })
