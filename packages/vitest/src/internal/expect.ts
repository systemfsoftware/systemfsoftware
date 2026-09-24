import * as Function from 'effect/Function'
import * as V from 'vitest'
import { lookupRun } from './binding.js'
import type { Running } from './binding.js'
import { registerEqualTester } from './equal.js'
import { Slop } from './errors.schema.js'
import { isOwned, recordAssertion } from './owned.js'
import { narrowNegated, narrowVacuous, presenceMessage, refuseHook } from './refusals.js'
import type { NarrowNegatedName, NarrowVacuousName, PresenceRefusal } from './refusals.js'

type Assertion<A> = V.Assertion<void, A>

type NarrowName = NarrowVacuousName | NarrowNegatedName

type Refusing = () => never

/** The values a check received; the fork never reads them, so the checks are typed over the opaque form. */
type CheckArguments<A = unknown> = ReadonlyArray<A>

/**
 * Vitest's matchers for a value of type `A`, with the narrowed ones answering the refusal instead. `toBe` on
 * an object, `toBeTypeOf` and `toBeInstanceOf` stay legal (R9).
 *
 * @internal
 */
export type Lawful<A> =
  & Omit<Assertion<A>, 'not' | NarrowVacuousName>
  & { readonly [Name in NarrowVacuousName]: PresenceRefusal<Name> }
  & { readonly not: LawfulNot<A> }

/**
 * @internal
 */
export type LawfulNot<A> =
  & Omit<Assertion<A>, 'not' | NarrowNegatedName>
  & { readonly [Name in NarrowNegatedName]: PresenceRefusal<Name> }

/**
 * @internal
 */
export interface LawfulCheck {
  <A>(actual: A, message?: string): Lawful<A>
  <A>(message?: string): (actual: A) => Lawful<A>
}

/**
 * Vitest's `expect` statics with the narrowed call signature and the fork's soft `soft`.
 *
 * @internal
 */
export type LawfulExpectStatic =
  & LawfulCheck
  & { readonly soft: LawfulCheck }
  & { readonly [K in Exclude<keyof V.ExpectStatic, 'soft'>]: V.ExpectStatic[K] }

registerEqualTester()

const refuse = (detail: string): never => {
  throw new Slop({ detail })
}

const narrowedNames = (negated: boolean): ReadonlyArray<NarrowName> => negated ? narrowNegated : narrowVacuous

const narrowedName = (property: string | symbol, negated: boolean): NarrowName | undefined =>
  namedMatch(property, narrowedNames(negated))

const namedMatch = (property: string | symbol, names: ReadonlyArray<NarrowName>): NarrowName | undefined =>
  typeof property === 'string' ? foundMatch(property, names) : undefined

const foundMatch = (property: string, names: ReadonlyArray<NarrowName>): NarrowName | undefined =>
  names.find((name) => name === property)

const refuseNarrowed = (name: NarrowName): Refusing => () => refuse(presenceMessage(name))

const refusedMember = (property: string | symbol, negated: boolean): Refusing | undefined => {
  const name = narrowedName(property, negated)
  return name === undefined ? undefined : refuseNarrowed(name)
}

/** Vitest's own member. `Reflect.get` cannot be typed, and the fork hands the member over unchanged. */
const memberAt = <A extends object>(target: A, property: string | symbol): A[keyof A] | undefined =>
  Reflect.get(target, property, target)

/**
 * The narrowed names answer with the refusal, `not` re-enters the guard with the negation flipped, and every
 * other member is Vitest's own, handed over unbound so Chai's property accessors keep working.
 */
const guardOf = <A>(assertion: Assertion<A>, negated: boolean): Lawful<A> =>
  new Proxy<Assertion<A>>(assertion, guardHandler(negated))

const guardHandler = <A>(negated: boolean): ProxyHandler<Assertion<A>> => ({
  get: (target, property) => guardedMember(target, negated, property),
})

const guardedMember = <A>(
  target: Assertion<A>,
  negated: boolean,
  property: string | symbol,
): Refusing | Lawful<A> | Assertion<A>[keyof Assertion<A>] | undefined =>
  property === 'not' ? guardOf(target.not, !negated) : forwardedMember(target, negated, property)

const forwardedMember = <A>(
  target: Assertion<A>,
  negated: boolean,
  property: string | symbol,
): Refusing | Assertion<A>[keyof Assertion<A>] | undefined =>
  refusedMember(property, negated) ?? memberAt(target, property)

const plainAssertion = <A>(actual: A, message: string | undefined): Lawful<A> =>
  counted(guardOf(V.expect(actual, message), false))

const countsInThisRun = (): boolean => lookupRun()?.shadow !== true

/**
 * A check outside a soft run counts on the run it happens in: an `owned` region's checks throw, and a
 * check outside every run has no gate to satisfy.
 */
const counted = <A>(assertion: Lawful<A>): Lawful<A> => {
  if (countsInThisRun()) recordAssertion()
  return assertion
}

const softAssertion = <A>(running: Running, actual: A, message: string | undefined): Lawful<A> =>
  guardOf(running.ctx.expect.soft(actual, message), false)

const isSoftRun = (running: Running): boolean => running.shadow === false && isOwned() === false

const liveAssertion = <A>(running: Running, actual: A, message: string | undefined): Lawful<A> =>
  isSoftRun(running) ? softAssertion(running, actual, message) : plainAssertion(actual, message)

/**
 * A check inside a run is soft: it records the failure and the test stops at the next step. The second run
 * and an `owned` region throw, so their own handler sees the failure.
 */
const assertionFor = <A>(actual: A, message: string | undefined): Lawful<A> => {
  const running = lookupRun()
  return running === undefined ? plainAssertion(actual, message) : liveAssertion(running, actual, message)
}

/**
 * The pipeable form of a check: `check(actual, message)` and `check(message)(actual)`.
 *
 * @internal
 */
export const check: {
  <A>(actual: A, message?: string): Lawful<A>
  <A>(message?: string): (actual: A) => Lawful<A>
} = Function.dual(2, assertionFor)

const messageOf = <A>(value: A): string | undefined => typeof value === 'string' ? value : undefined

const applyCheck = (args: CheckArguments): object => assertionFor(args[0], messageOf(args[1]))

/** The statics are Vitest's; only `soft` is the fork's, and soft is what a check already is inside a run. */
const makeExpect = (): LawfulExpectStatic =>
  new Proxy(V.expect, {
    get: (target, property) => property === 'soft' ? assertionFor : memberAt(target, property),
    apply: (_target, _thisArg, args) => applyCheck(args),
  })

/**
 * The fork's `expect`: soft within one Effect step, refusing the slop forms.
 *
 * @internal
 */
export const expect: LawfulExpectStatic = makeExpect()

const refuseHookNow = (): never => refuse(refuseHook)

type EachFirst = Parameters<typeof V.beforeEach>[0]

type AfterEachFirst = Parameters<typeof V.afterEach>[0]

type BeforeAllFirst = Parameters<typeof V.beforeAll>[0]

type AfterAllFirst = Parameters<typeof V.afterAll>[0]

/**
 * @internal
 */
export const beforeEach: {
  (fn: EachFirst, timeout?: number): void
  (timeout?: number): (fn: EachFirst) => void
} = Function.dual(
  (args: IArguments) => typeof args[0] === 'function',
  (fn: EachFirst, timeout?: number): void => {
    void fn
    void timeout
    refuseHookNow()
  },
)

/**
 * @internal
 */
export const afterEach: {
  (fn: AfterEachFirst, timeout?: number): void
  (timeout?: number): (fn: AfterEachFirst) => void
} = Function.dual(
  (args: IArguments) => typeof args[0] === 'function',
  (fn: AfterEachFirst, timeout?: number): void => {
    void fn
    void timeout
    refuseHookNow()
  },
)

/**
 * @internal
 */
export const beforeAll: {
  (fn: BeforeAllFirst, timeout?: number): void
  (timeout?: number): (fn: BeforeAllFirst) => void
} = Function.dual(
  (args: IArguments) => typeof args[0] === 'function',
  (fn: BeforeAllFirst, timeout?: number): void => {
    V.beforeAll(fn, timeout)
  },
)

/**
 * @internal
 */
export const afterAll: {
  (fn: AfterAllFirst, timeout?: number): void
  (timeout?: number): (fn: AfterAllFirst) => void
} = Function.dual(
  (args: IArguments) => typeof args[0] === 'function',
  (fn: AfterAllFirst, timeout?: number): void => {
    V.afterAll(fn, timeout)
  },
)
