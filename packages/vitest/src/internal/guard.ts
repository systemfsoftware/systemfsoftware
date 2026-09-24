/**
 * The library brands both its checks and its tests, and this module closes the way around both brands.
 *
 * The `Asserted` brand only proves a test yielded a fork check. It cannot see a raw `vitest` `expect` beside
 * that check, and it cannot see a test the fork never registered. Both travel on the one shared
 * `chai.Assertion` prototype, measured on Vitest 5.0.1 and Chai 6.2.2:
 *
 * - raw `expect`, `expect.soft` and `expect.poll` all enter chai through `chai.expect`
 *   (`vitest/dist/chunks/index.m3L2HgmY.js:8005`, `:8035`, `:7514`);
 * - the task's own `ctx.expect` is `createExpect(context.task)` (`vitest/dist/chunks/index.m3L2HgmY.js:8513`)
 *   and enters through that same `chai.expect` (`:8005`);
 * - chai's `expect` is `new Assertion(val, message)` (`chai/index.js:3272`), and every `assert.*` method is
 *   `new Assertion(...)` on the same class (`chai/index.js:3367`, `:3394`).
 *
 * So this module wraps that prototype once, and every method, chainable method and property on it refuses
 * unless a check opened the window with {@link authorize} for the duration of its matcher call. Nothing
 * asynchronous may run inside that window, so a plain synchronous depth counter is enough; the counter is
 * nested-safe because chai's own matchers build further assertions inside the one call.
 *
 * The window, the install flag and the wrapper marks live on `globalThis` under `Symbol.for` keys rather than
 * in module scope. A worker can hold two copies of this file at once — the setup file resolves through Node's
 * conditions to `dist/guard.mjs` while the test graph resolves the fork's entry through the source condition
 * to `src/mod.ts` — and a window opened by one copy has to be the window the other copy reads. Module-scope
 * state made every legitimate check fail with the raw-expect refusal.
 *
 * The other half is {@link markTask}: the fork's `it` marks each task it registers, and the setup-file entry
 * (`@effect/vitest/guard`) refuses a task that carries no mark. This setup-file hook is internal plumbing; the
 * user-facing hook refusal is the fork's own `beforeEach`.
 *
 * @since 4.0.0
 */
import { chai } from 'vitest'
import type * as V from 'vitest'
import { refusalOf, refuseRawExpect } from './refusals.js'

declare module 'vitest' {
  interface TaskMeta {
    effectVitestMarked?: boolean
  }
}

type Opaque<A = unknown> = A

type AnyCall = (...args: Array<Opaque>) => Opaque

type Task = V.TestContext['task']

interface GuardState {
  depth: number
  installed: boolean
  extendPatched: boolean
}

const isCallable = (value: Opaque): value is AnyCall => typeof value === 'function'

const isObject = (value: Opaque): value is object => typeof value === 'object' && value !== null

const hasOwn = (value: object, key: string): boolean => Object.hasOwn(value, key)

const hasGuardFields = (value: object): boolean => hasOwn(value, 'depth') && hasOwn(value, 'installed')

const isGuardState = (value: Opaque): value is GuardState => isObject(value) && hasGuardFields(value)

const stateKey = Symbol.for('@systemfsoftware/vitest/guard')
const wrappedKey = Symbol.for('@systemfsoftware/vitest/guard/wrapped')

const createState = (): GuardState => {
  const created: GuardState = { depth: 0, installed: false, extendPatched: false }
  Reflect.set(globalThis, stateKey, created)
  return created
}

const stateOf = (): GuardState => {
  const existing: Opaque = Reflect.get(globalThis, stateKey)
  return isGuardState(existing) ? existing : createState()
}

const state = stateOf()

const isWrapped = (value: object): boolean => Reflect.get(value, wrappedKey) === true

const isUnwrapped = (value: Opaque): value is AnyCall => isCallable(value) && !isWrapped(value)

const authorized = (): boolean => state.depth > 0

const refuse = (): never => {
  throw refusalOf(refuseRawExpect)
}

/** @internal */
export const authorize = <A>(run: () => A): A => {
  state.depth += 1
  try {
    return run()
  } finally {
    state.depth -= 1
  }
}

/** @internal */
export const markTask = (task: Task): void => {
  task.meta.effectVitestMarked = true
}

/** @internal */
export const isMarked = (task: Task): boolean => task.meta.effectVitestMarked === true

const guardedCall = (run: AnyCall): AnyCall => {
  const guarded = function(this: Opaque, ...args: Array<Opaque>): Opaque {
    if (!authorized()) refuse()
    return Reflect.apply(run, this, args)
  }
  Reflect.defineProperty(guarded, wrappedKey, { value: true })
  return guarded
}

const fieldOf = (descriptor: PropertyDescriptor, field: string): Opaque => Reflect.get(descriptor, field)

const withValue = (descriptor: PropertyDescriptor): PropertyDescriptor => {
  const value = fieldOf(descriptor, 'value')
  return isUnwrapped(value) ? { ...descriptor, value: guardedCall(value) } : descriptor
}

const withRead = (descriptor: PropertyDescriptor): PropertyDescriptor => {
  const read = fieldOf(descriptor, 'get')
  return isUnwrapped(read) ? { ...descriptor, get: guardedCall(read) } : descriptor
}

const withWrite = (descriptor: PropertyDescriptor): PropertyDescriptor => {
  const write = fieldOf(descriptor, 'set')
  return isUnwrapped(write) ? { ...descriptor, set: guardedCall(write) } : descriptor
}

const guardedDescriptor = (descriptor: PropertyDescriptor): PropertyDescriptor =>
  withWrite(withRead(withValue(descriptor)))

const isWrappable = (descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor =>
  descriptor?.configurable === true

const guardMember = (proto: object, name: PropertyKey): void => {
  const descriptor = Object.getOwnPropertyDescriptor(proto, name)
  if (!isWrappable(descriptor)) return
  Object.defineProperty(proto, name, guardedDescriptor(descriptor))
}

const bookkeeping: ReadonlyArray<PropertyKey> = ['constructor', '__methods', '__flags', '_obj']

/**
 * Every own member of the prototype, string- and symbol-keyed, except chai's bookkeeping fields. `Reflect.ownKeys`
 * rather than `Object.getOwnPropertyNames`, so a member chai hangs off a symbol is guarded too: measured on chai
 * 6.2.2, `Assertion.prototype` carries 104 string-keyed own members and no symbol-keyed ones, so the enumeration
 * is unchanged today and stays closed if chai adds one.
 */
const assertionMembers = (proto: object): ReadonlyArray<PropertyKey> =>
  Reflect.ownKeys(proto).filter((name) => bookkeeping.includes(name) === false)

const guardPrototype = (): void => {
  const proto: object = chai.Assertion.prototype
  for (const name of assertionMembers(proto)) guardMember(proto, name)
}

const extendOf = (): Opaque => Reflect.get(chai.expect, 'extend')

const wrapExtend = (): void => {
  const extend = extendOf()
  if (!isCallable(extend)) return
  state.extendPatched = true
  chai.util.addMethod(chai.expect, 'extend', function(this: Opaque, ...args: Array<Opaque>): Opaque {
    const result = Reflect.apply(extend, this, args)
    guardPrototype()
    return result
  })
}

const patchExtend = (): void => {
  if (state.extendPatched) return
  wrapExtend()
}

/** @internal */
export const installGuard = (): void => {
  if (state.installed) return
  state.installed = true
  guardPrototype()
  patchExtend()
}
