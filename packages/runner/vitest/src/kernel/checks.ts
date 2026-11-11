/**
 * The checks a test receives as its callback parameter. There is no importable `expect`: the only one in reach is
 * the one the runner hands this test, so it is bound to this test by construction, not by a lookup.
 *
 * Every matcher returns a `Check`: an Effect that needs `Asserted`, a service only the runner provides.
 * - A check that is not yielded is a floating Effect: `@effect/language-service` `floatingEffect` fails the build.
 * - A body that yields no check has no `Asserted` in its requirements: the test signature refuses it.
 * - A check run outside a test has nothing providing `Asserted`: a type error.
 *
 * A check is only ever minted around a judgement, and the ledger runs every judgement through its tables: the
 * fork's refusals are a floor that a library can reword and add to, a judgement gets one matcher call, and a
 * judgement that calls none is refused. {@link Subject}s add check surfaces for values of a library's own, and
 * every consumer admits one check per observed state.
 *
 * @since 4.0.0
 */
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'
import * as V from 'vitest'
import { callFrame, withRaisingFrame } from '../internal/call-site.js'
import { authorize } from './guard.js'
import {
  type ForkTables,
  refusalOf,
  refusedText,
  refusePiecewise,
  refuseVacuous,
  type ResolvedTables,
  resolveTables,
  type RuntimeTables,
  type TableRows,
  type Tables,
} from './refusals.js'

type Opaque<A = unknown> = A

type Assertion<A> = V.Assertion<void, A>

export type MakeAssertion = <A>(actual: A, message?: string) => Assertion<A>

export type Judgement = (make: MakeAssertion) => Opaque

export interface AssertedShape {
  readonly judge: (judgement: Judgement) => Opaque
  readonly step: () => void
}

export class Asserted extends Context.Service<Asserted, AssertedShape>()('@systemfsoftware/vitest/Asserted') {}

export type Check = Effect.Effect<void, never, Asserted>

type Finish = (view: View, property: string, args: ReadonlyArray<Opaque>) => Opaque

type View = {
  readonly actual: Opaque
  readonly message: string | undefined
  readonly negated: boolean
  readonly tables: RuntimeTables
  readonly finish: Finish
}

type Refusal<T extends string> = (this: T, ...args: ReadonlyArray<Opaque>) => Check

type StaticRefusal<T extends string> = (this: T, ...args: ReadonlyArray<Opaque>) => never

interface Needs<Args extends ReadonlyArray<Opaque>, T extends string> {
  (...args: Args): Check
  (this: T, ...args: ReadonlyArray<Opaque>): Check
}

type MatcherName = Extract<keyof Assertion<Opaque>, `to${string}`>

type ArgsOf<A, K extends MatcherName> = Assertion<A>[K] extends (...args: infer P) => infer _ ? P : never

type ThrowExpected = string | RegExp | (abstract new(...args: ReadonlyArray<never>) => Opaque) | Error

interface NeededArgs<A> {
  readonly toThrow: [expected: ThrowExpected]
  readonly toThrowError: [expected: ThrowExpected]
  readonly toSatisfy: [predicate: (value: A) => boolean, holds: string]
  readonly toMatchObject: ArgsOf<A, 'toMatchObject'>
}

type NeededName = keyof NeededArgs<Opaque>

type ReadName = 'resolves' | 'rejects'

type RefusedStaticName = 'anything' | 'poll' | 'soft'

type TextAt<Row, K extends PropertyKey> = K extends keyof Row ? Extract<Row[K], string> : never
type Refused<T extends Tables> = Extract<keyof T['refused'], MatcherName>

type NegatedRefused<T extends Tables> = Extract<keyof T['negated'], MatcherName>

type Needed<T extends Tables> = Extract<keyof T['needed'], NeededName>

export type Positive<A, T extends Tables = ForkTables> =
  & { readonly [K in Exclude<MatcherName, Refused<T> | Needed<T>>]: (...args: ArgsOf<A, K>) => Check }
  & { readonly [K in Refused<T>]: Refusal<TextAt<T['refused'], K>> }
  & { readonly [K in Needed<T>]: Needs<NeededArgs<A>[K], TextAt<T['needed'], K>> }
  & { readonly [K in Extract<keyof T['refused'], ReadName>]: TextAt<T['refused'], K> }

export type Negative<A, T extends Tables = ForkTables> =
  & { readonly [K in Exclude<MatcherName, NegatedRefused<T>>]: (...args: ArgsOf<A, K>) => Check }
  & { readonly [K in NegatedRefused<T>]: Refusal<TextAt<T['negated'], K>> }

export type Checked<A, T extends Tables = ForkTables> = Positive<A, T> & { readonly not: Negative<A, T> }

type Matcher = object

/** The asymmetric matchers vitest builds: each names what a value must be, and only vitest reads the result. */
export interface Matchers {
  readonly objectContaining: <T = Opaque>(expected: V.DeeplyAllowMatchers<T>) => Matcher
  readonly arrayContaining: <T = Opaque>(expected: Array<V.DeeplyAllowMatchers<T>>) => Matcher
  readonly stringContaining: (expected: string) => Matcher
  readonly stringMatching: (expected: string | RegExp) => Matcher
  readonly closeTo: (expected: number, precision?: number) => Matcher
  readonly schemaMatching: (schema: Opaque) => Matcher
}

export type NegatedMatchers = Pick<
  Matchers,
  'objectContaining' | 'arrayContaining' | 'stringContaining' | 'stringMatching'
>

type Statics = Matchers & { readonly any: (constructor: Opaque) => Matcher; readonly not: NegatedMatchers }

/**
 * The asymmetric matchers that name what a value must be, the same matchers negated, and the statics every
 * table refuses by name: `anything`, `poll` and `soft`.
 */
export type Shapes<T extends Tables = ForkTables> =
  & Statics
  & { readonly [K in RefusedStaticName]: StaticRefusal<TextAt<T['refused'], K>> }

/**
 * A check surface for values of a library's own. `matches` says whether `expect(actual)` is this subject's, and
 * `checks` builds what `expect(actual)` returns: its matchers mint checks with the `mint` they are handed, and
 * each judgement they give it runs through the ledger's tables and one-check rule.
 */
export interface Subject<A, C> {
  readonly matches: (actual: Opaque) => actual is A
  readonly checks: (actual: A, mint: Mint) => C
}

export interface AnySubject {
  readonly matches: (actual: Opaque) => boolean
  readonly checks: (actual: never, mint: Mint) => Opaque
}

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

export type Expect<T extends Tables = ForkTables, S extends ReadonlyArray<AnySubject> = readonly []> =
  & SubjectCalls<S>
  & ExpectCall<T>
  & Shapes<T>

export interface Checks<T extends Tables = ForkTables, S extends ReadonlyArray<AnySubject> = readonly []> {
  readonly expect: Expect<T, S>
}

export interface LedgerOptions<Rows extends TableRows = Record<never, never>> {
  readonly tables?: Rows
  readonly piecewise?: string
  readonly vacuous?: string
}

export interface LedgerInput<Rows extends TableRows = Record<never, never>> extends LedgerOptions<Rows> {
  readonly ctx: V.TestContext
}

/** One test's record of its checks. Only {@link makeLedger} returns one, and the driver refuses any other. */
export interface Ledger<T extends Tables = ForkTables> {
  readonly asserted: AssertedShape
  readonly written: (j: Judgement) => void
  readonly unyielded: () => number
  readonly judged: () => number
  readonly tables: T
}

const ledgers = new WeakSet<object>()

const isObject = (value: Opaque): value is object => typeof value === 'object' && value !== null

export const isLedger = (value: Opaque): value is Ledger<RuntimeTables> => isObject(value) && ledgers.has(value)

const claims = <X extends object>(_value: object): _value is X => true

const asserting = <X extends object>(value: object): X => {
  if (!claims<X>(value)) throw new Error('the value is the type it was built as')
  return value
}

const settled = (outcome: Opaque): Effect.Effect<void> =>
  Predicate.isPromiseLike(outcome) ? Effect.asVoid(Effect.promise(() => outcome)) : Effect.void

const mintCheck = (ledger: Ledger<RuntimeTables>, judgement: Judgement): Check => {
  ledger.written(judgement)
  return Effect.gen(function*() {
    const asserted = yield* Asserted
    yield* settled(asserted.judge(judgement))
  })
}

const textIn = (table: Readonly<Record<string, string>>, key: string): string | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined

const isPlainObject = (value: Opaque): value is object =>
  isObject(value) && Object.getPrototypeOf(value) === Object.prototype

const isEmptyShape = (value: Opaque): boolean => isPlainObject(value) && Object.keys(value).length === 0

const refusing = (text: string): () => never => () => {
  throw refusalOf(text)
}

const forView = (view: View, negated: boolean): View => ({ ...view, negated })

const notView = (view: View): View => forView(view, !view.negated)

const messageOf = (argument: Opaque): string | undefined => typeof argument === 'string' ? argument : undefined

const refuseBooleanActual = (actual: Opaque): boolean => typeof actual === 'boolean'

const textRefusalOf = (view: View, property: string): string | undefined =>
  textIn(view.negated ? view.tables.negated : view.tables.refused, property)

const isReadName = (property: string): property is ReadName => property === 'resolves' || property === 'rejects'

const readRefusal = (tables: RuntimeTables, property: string): string | undefined =>
  isReadName(property) ? textIn(tables.refused, property) : undefined

const neededArity: Readonly<Record<string, number>> = { toThrow: 1, toThrowError: 1, toSatisfy: 2, toMatchObject: 1 }

const arityOf = (property: string): number => neededArity[property] ?? 0

const tooFewArguments = (property: string, args: ReadonlyArray<Opaque>): boolean => args.length < arityOf(property)

const vacuousMatchObject = (property: string, args: ReadonlyArray<Opaque>): boolean =>
  property === 'toMatchObject' && isEmptyShape(args[0])

const missingArgument = (property: string, args: ReadonlyArray<Opaque>): boolean =>
  tooFewArguments(property, args) || vacuousMatchObject(property, args)

const matcherShaped = /^to[A-Z]/

const notInherited = (property: string): boolean =>
  property in V.chai.Assertion.prototype && !(property in Object.prototype)

const isMatcherName = (property: string): boolean => matcherShaped.test(property) && notInherited(property)

const memberAt = <A extends object>(target: A, property: string | symbol): A[keyof A] | undefined =>
  Reflect.get(target, property, target)

const isCallable = (value: Opaque): value is (...args: ReadonlyArray<Opaque>) => Opaque => typeof value === 'function'

const invokeMember = (target: object, property: string, args: ReadonlyArray<Opaque>): Opaque => {
  const member = memberAt(target, property)
  return isCallable(member) ? Reflect.apply(member, target, args) : undefined
}

const raisedFailure = (thrown: Opaque, site: string | undefined): Opaque =>
  thrown instanceof Error ? withRaisingFrame(thrown, site) : thrown

const framedOutcome = (outcome: Opaque, site: string | undefined): Opaque =>
  Predicate.isPromiseLike(outcome)
    ? outcome.then(undefined, (thrown: Opaque) => Promise.reject(raisedFailure(thrown, site)))
    : outcome

const framedJudgement = (judgement: Judgement, site: string | undefined): Judgement => (make) => {
  try {
    return framedOutcome(judgement(make), site)
  } catch (thrown) {
    throw raisedFailure(thrown, site)
  }
}

const judgementOf = (view: View, property: string, args: ReadonlyArray<Opaque>): Judgement => (make) => {
  const assertion = make(view.actual, view.message)
  const target = view.negated ? assertion.not : assertion
  return invokeMember(target, property, args)
}

const minting = (ledger: Ledger<RuntimeTables>, site: string | undefined): Finish => (view, property, args) =>
  mintCheck(ledger, framedJudgement(judgementOf(view, property, args), site))

const genericMember = (view: View, property: string): (...args: ReadonlyArray<Opaque>) => Opaque => (...args) =>
  view.finish(view, property, args)

const neededMember =
  (view: View, property: string, text: string): (...args: ReadonlyArray<Opaque>) => Opaque => (...args) => {
    if (missingArgument(property, args)) throw refusalOf(text)
    return view.finish(view, property, args)
  }

type Member = { readonly found: true; readonly value: Opaque } | { readonly found: false }

const absent: Member = { found: false }

const present = (value: Opaque): Member => ({ found: true, value })

const valueOf = (member: Member): Opaque => member.found ? member.value : undefined

const genericOrAbsent = (view: View, property: string): Member =>
  isMatcherName(property) ? present(genericMember(view, property)) : absent

const neededOrGeneric = (view: View, property: string, text: string | undefined): Member =>
  text === undefined ? genericOrAbsent(view, property) : present(neededMember(view, property, text))

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

const refuseBoolean = (tables: RuntimeTables, actual: Opaque): void => {
  if (refuseBooleanActual(actual)) throw refusalOf(tables.boolean)
}

const subjectOf = (subjects: ReadonlyArray<AnySubject>, actual: Opaque): AnySubject | undefined =>
  subjects.find((subject) => subject.matches(actual))

const mintFor = (ledger: Ledger<RuntimeTables>, site: string | undefined): Mint => (judgement) =>
  mintCheck(ledger, framedJudgement(judgement, site))

const valueView = (ledger: Ledger<RuntimeTables>, args: ReadonlyArray<Opaque>, site: string | undefined): object =>
  matcherView({
    actual: args[0],
    message: messageOf(args[1]),
    negated: false,
    tables: ledger.tables,
    finish: minting(ledger, site),
  })

const checksOf = (subject: AnySubject, actual: Opaque, mint: Mint): Opaque =>
  Reflect.apply(subject.checks, subject, [actual, mint])

const assertionView = (
  ledger: Ledger<RuntimeTables>,
  subjects: ReadonlyArray<AnySubject>,
  args: ReadonlyArray<Opaque>,
): Opaque => {
  refuseBoolean(ledger.tables, args[0])
  const site = callFrame()
  const subject = subjectOf(subjects, args[0])
  return subject === undefined ? valueView(ledger, args, site) : checksOf(subject, args[0], mintFor(ledger, site))
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

const refusedStatics: ReadonlyArray<RefusedStaticName> = ['anything', 'poll', 'soft']

const defineRefused = (target: object, tables: RuntimeTables, name: RefusedStaticName): void => {
  const text = textIn(tables.refused, name) ?? refusedText[name]
  Object.defineProperty(target, name, { get: refusing(text), enumerable: true })
}

const unreachableTarget = (): ExpectCall<Tables> => () => {
  throw new Error('the expect proxy answers every call')
}

export interface ExpectOptions<T extends Tables, S extends ReadonlyArray<AnySubject>> {
  readonly ledger: Ledger<T>
  readonly subjects?: S
}

const subjectsOfOptions = (options: { readonly subjects?: ReadonlyArray<AnySubject> }): ReadonlyArray<AnySubject> =>
  options.subjects ?? []

const baseFor = (tables: RuntimeTables): object => {
  const base = Object.assign(unreachableTarget(), shapes)
  for (const name of refusedStatics) defineRefused(base, tables, name)
  return base
}

const proxyFor = (
  options: { readonly ledger: Ledger<Tables>; readonly subjects?: ReadonlyArray<AnySubject> },
): object => {
  const { ledger } = options
  if (!isLedger(ledger)) throw new Error('expectFor needs a ledger from makeLedger')
  const subjects = subjectsOfOptions(options)
  return new Proxy(baseFor(ledger.tables), {
    apply: (_target, _thisArgument, argumentList) => assertionView(ledger, subjects, argumentList),
  })
}

export const expectFor = <
  T extends Tables,
  const S extends ReadonlyArray<AnySubject> = readonly [],
>(
  options: ExpectOptions<T, S>,
): Expect<T, S> => asserting(proxyFor(options))

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
  readonly vacuous: string
  readonly tables: RuntimeTables
  readonly hard: MakeAssertion
}

const piecewiseOf = (options: LedgerOptions<TableRows>): string => options.piecewise ?? refusePiecewise

const vacuousOf = (options: LedgerOptions<TableRows>): string => options.vacuous ?? refuseVacuous

const stateOf = (options: LedgerOptions<TableRows>, hard: MakeAssertion): LedgerState => ({
  pending: new Set(),
  counter: { judged: 0 },
  window: makeWindow(),
  piecewise: piecewiseOf(options),
  vacuous: vacuousOf(options),
  tables: resolveTables(options.tables),
  hard,
})

const refuseOver = (count: number, text: string): void => {
  if (count > 1) throw refusalOf(text)
}

interface JudgementRun {
  matchers: number
}

const claimMatcher = (state: LedgerState, run: JudgementRun): void => {
  run.matchers += 1
  if (run.matchers > 1) throw refusalOf(state.piecewise)
}

const chaiTarget = (state: LedgerState, view: View): object => {
  const assertion = state.hard(view.actual, view.message)
  return view.negated ? assertion.not : assertion
}

const executing = (state: LedgerState, run: JudgementRun): Finish => (view, property, args) => {
  claimMatcher(state, run)
  return authorize(() => invokeMember(chaiTarget(state, view), property, args))
}

const sealedMake = (state: LedgerState, run: JudgementRun): MakeAssertion => (actual, message) => {
  refuseBoolean(state.tables, actual)
  return asserting(
    matcherView({ actual, message, negated: false, tables: state.tables, finish: executing(state, run) }),
  )
}

const refuseWhenVacuous = (state: LedgerState, run: JudgementRun, outcome: Opaque): Opaque => {
  if (run.matchers === 0) throw refusalOf(state.vacuous)
  return outcome
}

const afterJudgement = (state: LedgerState, run: JudgementRun, outcome: Opaque): Opaque =>
  Predicate.isPromiseLike(outcome)
    ? outcome.then((value: Opaque) => refuseWhenVacuous(state, run, value))
    : refuseWhenVacuous(state, run, outcome)

const judging = (state: LedgerState): AssertedShape['judge'] => (judgement) => {
  state.pending.delete(judgement)
  state.counter.judged += 1
  refuseOver(state.window.count(), state.piecewise)
  const run: JudgementRun = { matchers: 0 }
  return afterJudgement(state, run, judgement(sealedMake(state, run)))
}

export const makeLedger = <const Rows extends TableRows = Record<never, never>>(
  { ctx, ...options }: LedgerInput<Rows>,
): Ledger<ResolvedTables<Rows>> => {
  const state = stateOf(options, (actual, message) => ctx.expect(actual, message))
  const ledger = Object.freeze({
    asserted: Object.freeze({ judge: judging(state), step: state.window.clear }),
    written: (judgement: Judgement): void => {
      state.pending.add(judgement)
    },
    unyielded: (): number => state.pending.size,
    judged: (): number => state.counter.judged,
    tables: state.tables,
  })
  ledgers.add(ledger)
  return asserting(ledger)
}

export const checksFor = (ledger: Ledger): Checks => ({ expect: expectFor({ ledger }) })
