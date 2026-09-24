/** @internal */
export const refuseHook =
  '✗ hooks share state between tests. Build what a test needs inside it; services come fresh per test from layer(Service.layer)((it) => { ... }).'

/** @internal */
export const refuseNoAssertion =
  '✗ this test ran no assertion, so it cannot fail. Assert on what the code returned: expect(actual).toEqual(expected).'

/** @internal */
export const refuseAsync =
  '✗ an async test runs Effects outside the test runtime: no virtual time, no fresh services, no leak check. Return the Effect instead: it.effect(name, () => Effect.gen(function* () { ... })).'

/** @internal */
export const refuseBareEffect =
  '✗ a bare test body that returns an Effect never runs it, so nothing in the test was checked. Register it on the Effect lane: it.effect(name, () => Effect.gen(function* () { ... })).'

/** @internal */
export const refuseUnprovided =
  '✗ the test needs a service that nothing provides. Pipe the body through Effect.provide(Service.layer), or write the tests inside layer(Service.layer)((it) => { ... }); every test gets its own fresh build.'

/** @internal */
export const refuseBoolean =
  "✗ expect(<boolean>) can only report 'expected false to be true'. Pass the two values instead: expect(Equal.equals(a, b)).toBe(true) becomes expect(a).toEqual(b). A predicate: expect(value).toSatisfy(predicate)."

/** @internal */
export const refusePositionalProp =
  '✗ it.prop(name, [arbitraries], predicate) is removed. Name the function under test and pass a budget: it.prop(name, { of, subject, runs }, holds).'

/** The narrowed matchers say one thing, with the matcher's own name: this text is both the refusal and the repair. */
/** @internal */
export type PresenceMessage<N extends string = string> =
  `✗ ${N} passes for almost any value the code returns. Assert the value: toEqual(expected); for a key that must exist: toHaveProperty(key).`

/**
 * The narrowed matcher as the type sees it: a call whose `this` is not the assertion cannot compile, and the
 * refused text is the compiler error (KTD9). The run time throws the same text.
 *
 * @internal
 */
export type PresenceRefusal<N extends string = string> = (this: PresenceMessage<N>, ...args: Array<never>) => void

/** @internal */
export const presenceMessage = <N extends string>(name: N): PresenceMessage<N> =>
  `✗ ${name} passes for almost any value the code returns. Assert the value: toEqual(expected); for a key that must exist: toHaveProperty(key).`

/** @internal */
export type HookRefusal = typeof refuseHook

/** @internal */
export type NoAssertionRefusal = typeof refuseNoAssertion

/** @internal */
export type AsyncRefusal = typeof refuseAsync

/** @internal */
export type BareEffectRefusal = typeof refuseBareEffect

/** @internal */
export type UnprovidedRefusal = typeof refuseUnprovided

/** @internal */
export type BooleanRefusal = typeof refuseBoolean

/** @internal */
export type PositionalPropRefusal = typeof refusePositionalProp

/** @internal */
export const narrowVacuous = ['toBeDefined', 'toBeTruthy', 'toBeFalsy'] as const

/** @internal */
export type NarrowVacuousName = (typeof narrowVacuous)[number]

/** @internal */
export const narrowNegated = [...narrowVacuous, 'toBeNull', 'toBeUndefined'] as const

/** @internal */
export type NarrowNegatedName = (typeof narrowNegated)[number]
