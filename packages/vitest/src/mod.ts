/// <reference types="./compat.d.ts" />
/**
 * The root entry point of the fork: it re-exports every Vitest binding, pins the Effect-aware test
 * methods to the exact types upstream `@effect/vitest` publishes, and pulls in the v3
 * `effect/TestClock` ambient (R18) through the reference above.
 */
import type * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import type * as Layer from 'effect/Layer'
import type * as Scope from 'effect/Scope'
import * as V from 'vitest'
import * as expectInternal from './internal/expect.js'
import * as ownedInternal from './internal/owned.js'
import { checkDefaultsKey, type ProvidedCheckDefaults } from './internal/property/defaults.js'
import type * as Engine from './internal/property/engine.js'
import type * as Property from './internal/property/kinds.js'
import * as internal from './internal/runner.js'
import * as testContextInternal from './internal/test-context.js'

declare module 'vitest' {
  interface ProvidedContext {
    [checkDefaultsKey]?: ProvidedCheckDefaults
  }
}

/**
 * @since 4.0.0
 */
export * from 'vitest'

/**
 * Vitest's test API, with its call signatures paired: each data-first form has its data-last twin, so
 * `it(name, body)`, `it(body)(name)`, `it(name, options, body)` and `it(options, body)(name)` all work.
 *
 * @since 4.0.0
 */
export type API =
  & Omit<V.TestAPI<{}>, never>
  & {
    /**
     * Data-last: `it(body, timeout?)(name)`. Declared before the data-first forms so that a bare
     * `it(body)` resolves here, which is where the runtime routes a first argument that is not a name.
     *
     * @since 4.0.0
     */
    <ExtraContext extends {}>(fn?: V.TestFunction<ExtraContext>, options?: number): (name: string | Function) => void

    /**
     * @since 4.0.0
     */
    <ExtraContext extends {}>(
      name: string | Function,
      fn: V.TestFunction<ExtraContext> | undefined,
      options?: number,
    ): void

    /**
     * Data-last: `it(options, body)(name)`.
     *
     * @since 4.0.0
     */
    <ExtraContext extends {}>(
      options: V.TestOptions,
      fn?: V.TestFunction<ExtraContext>,
    ): (name: string | Function) => void

    /**
     * @since 4.0.0
     */
    <ExtraContext extends {}>(
      name: string | Function,
      options: V.TestOptions,
      fn?: V.TestFunction<ExtraContext>,
    ): void
  }

/**
 * @since 4.0.0
 */
export namespace Vitest {
  /**
   * @since 4.0.0
   */
  export interface TestFunction<A, E, R, TestArgs extends TestContextWithValues> {
    (...args: TestArgs): Effect.Effect<A, E, R>
  }
  /**
   * @since 4.0.0
   */
  export type TestContextOnly = [V.TestContext]
  /**
   * @since 4.0.0
   */
  export type TestContextWithValues =
    | [V.TestContext]
    | [V.TestContext | object]
    | [V.TestContext | object, V.TestContext]
    | [V.TestContext | object, V.TestContext & object]

  /**
   * @since 4.0.0
   */
  export interface Test<R> {
    <A, E>(
      name: string,
      self: TestFunction<A, E, R, [V.TestContext]>,
      timeout?: number | V.TestOptions,
    ): void

    /**
     * Data-last: `it.effect(self, timeout?)(name)`.
     *
     * @since 4.0.0
     */
    <A, E>(self: TestFunction<A, E, R, [V.TestContext]>, timeout?: number | V.TestOptions): (name: string) => void
  }

  /**
   * A generated input: a Schema, or an Arbitrary of an already-generated type.
   *
   * @since 4.0.0
   */
  export type ArbitraryInput = Engine.ArbitraryInput

  /**
   * The inputs a property generates: a tuple or record of Schemas or Arbitraries.
   *
   * @since 4.0.0
   */
  export type Gens = Engine.Gens

  /**
   * The types a `Gens` generates: a tuple when `of` is a tuple, a record when it is a record.
   *
   * @since 4.0.0
   */
  export type Values<G extends Gens> = Engine.Values<G>

  /**
   * The function under test, handed to the property rather than imported into it.
   *
   * @since 4.0.0
   */
  export type PropertySubject = Engine.PropertySubject

  /**
   * A property's subject, its optional budget and its coverage classes. `runs`, when given, must be a
   * positive integer; omitted, the effective check options merge the property's fields over the configured
   * default (`test.provide`) over the built-in `runs: 100`. `cover` declares the coverage classes of R14.
   *
   * @since 4.0.0
   */
  export type PropertySpec<G extends Gens, S extends PropertySubject, N extends number> = Engine.PropertySpec<G, S, N>

  /**
   * The block a layer opens: `layer(L)(body)` or `layer(L)("name", body)`.
   *
   * @since 4.0.0
   */
  export type LayerBlock<R> = internal.BlockRegistrar<R>

  /**
   * The nested layer a block's own `it.layer` opens.
   *
   * @since 4.0.0
   */
  export type NestedLayerOptions = internal.NestedLayer

  /**
   * Options for the top-level `layer` and for `it.layer` inside a `Methods` block.
   *
   * @since 4.0.0
   */
  export type LayerOptions = internal.LayerOptions

  /**
   * A layer's block, data-first or data-last.
   *
   * @since 4.0.0
   */
  export interface LayerOf<R, Options> {
    <R2, E>(layer: Layer.Layer<R2, E, R>, options?: Options): LayerBlock<R | R2>
    (options?: Options): <R2, E>(layer: Layer.Layer<R2, E, R>) => LayerBlock<R | R2>
  }

  /**
   * A flaky Effect, data-first or data-last.
   *
   * @since 4.0.0
   */
  export type FlakyTest = typeof internal.flakyTest

  /**
   * @since 4.0.0
   */
  export interface Tester<R> extends Vitest.Test<R> {
    skip: Vitest.Test<R>
    skipIf: (condition: boolean) => Vitest.Test<R>
    runIf: (condition: boolean) => Vitest.Test<R>
    only: Vitest.Test<R>
    each: <T extends object>(
      cases: ReadonlyArray<T>,
    ) => <A, E>(
      name: string,
      self: TestFunction<A, E, R, TestContextWithValues & [V.TestContext | T]>,
      timeout?: number | V.TestOptions,
    ) => void
    fails: Vitest.Test<R>

    /**
     * Runs a property that names its subject and carries a budget, on the Effect lane.
     *
     * **Details**
     *
     * `spec.subject` is handed to `holds` instead of being imported into the property. `holds` returns an
     * `Effect` of its verdict: `true` holds, `false` falsifies and triggers shrinking, and any typed failure
     * falsifies the property with its cause. A verdict that is not a literal boolean fails as
     * `NonBooleanVerdict`; a `runs` that is not a positive integer fails as `InvalidBudget`. `runs` is optional:
     * the property's own fields win over the configured default (`test.provide`) over `runs: 100`. After the
     * property holds, it is run again against a constant impostor of its subject; the file fails as
     * `VacuousProperty` unless some property in it refutes that impostor.
     *
     * The old positional form `it.effect.prop(name, [arbitraries], predicate)` is refused.
     *
     * @since 4.0.0
     */
    prop: <const G extends Gens, S extends PropertySubject, N extends number, E>(
      name: string,
      spec: PropertySpec<G, S, N>,
      holds: (subject: S, values: Values<G>) => Effect.Effect<boolean, E, R>,
    ) => void
  }

  /**
   * @since 4.0.0
   */
  export interface MethodsNonLive<R = never> extends API {
    readonly effect: Vitest.Tester<R | Scope.Scope>
    readonly flakyTest: FlakyTest
    readonly layer: LayerOf<R, NestedLayerOptions>

    /**
     * Runs a property that names its subject and carries a budget, on the sync lane.
     *
     * **Details**
     *
     * `spec.subject` is handed to `holds` instead of being imported into the property. `holds` returns a literal
     * `true`/`false` verdict: `false` falsifies and triggers shrinking. A verdict that is not a boolean — an
     * `Effect`, an `expect()`, an object — fails as `NonBooleanVerdict`, and a `runs` that is not a positive
     * integer fails as `InvalidBudget`. `runs` is optional: the property's own fields win over the configured
     * default (`test.provide`) over `runs: 100`. After the property holds, it is run again against a constant
     * impostor of its subject; the file fails as `VacuousProperty` unless some property in it refutes that impostor.
     *
     * The old positional form `it.prop(name, [arbitraries], predicate)` is refused.
     *
     * @since 4.0.0
     */
    readonly prop: {
      <const G extends Gens, S extends PropertySubject, N extends number>(
        name: string,
        spec: PropertySpec<G, S, N>,
        holds: (subject: S, values: Values<G>) => boolean,
      ): void
      <const G extends Gens, S extends PropertySubject, N extends number>(
        spec: PropertySpec<G, S, N>,
        holds: (subject: S, values: Values<G>) => boolean,
      ): (name: string) => void
    }

    /**
     * The R13 law kinds: `model`, `metamorphic`, `roundTrip` and `invariant` are gated like `prop`;
     * `idempotent` and `deterministic` skip the impostor gate and are reported as exempt.
     *
     * @since 4.0.0
     */
    readonly law: Property.LawApi
  }

  /**
   * @since 4.0.0
   */
  export interface Methods<R = never> extends MethodsNonLive<R> {
    readonly live: Vitest.Tester<Scope.Scope | R>
    readonly layer: LayerOf<R, LayerOptions>
  }
}
/**
 * @since 4.0.0
 */
export type MethodsNonLive<R = never> = Vitest.MethodsNonLive<R>

/**
 * @since 4.0.0
 */
export type Methods<R = never> = Vitest.Methods<R>

/**
 * @since 4.0.0
 */
export const addEqualityTesters: () => void = internal.addEqualityTesters

/**
 * @since 4.0.0
 */
export const effect: Vitest.Tester<Scope.Scope> = internal.effect

/**
 * @since 4.0.0
 */
export const live: Vitest.Tester<Scope.Scope> = internal.live

/**
 * Share a `Layer` between multiple tests, optionally wrapping
 * the tests in a `describe` block if a name is provided.
 *
 * Named layers accept `concurrent` to override inherited suite concurrency.
 * Anonymous layers always inherit the enclosing suite's concurrency.
 * Use `ctx.expect` in concurrent tests for test-local snapshots and assertion counts.
 *
 * @since 4.0.0
 *
 * ```ts
 * import { assert, layer } from "@systemfsoftware/vitest"
 * import { Effect, Layer, Context } from "effect"
 *
 * class Foo extends Context.Service<Foo, "foo">()("Foo") {
 *   static layer = Layer.succeed(Foo, "foo")
 * }
 *
 * class Bar extends Context.Service<Bar, "bar">()("Bar") {
 *   static layer = Layer.effect(
 *     Bar,
 *     Effect.map(Foo, () => "bar" as const)
 *   )
 * }
 *
 * layer(Foo.layer)("layer", (it) => {
 *   it.effect("adds context", () =>
 *     Effect.gen(function*() {
 *       const foo = yield* Foo
 *       assert.strictEqual(foo, "foo")
 *     }))
 *
 *   it.layer(Bar.layer)("nested", (it) => {
 *     it.effect("adds context", () =>
 *       Effect.gen(function*() {
 *         const foo = yield* Foo
 *         const bar = yield* Bar
 *         assert.strictEqual(foo, "foo")
 *         assert.strictEqual(bar, "bar")
 *       }))
 *   })
 * })
 * ```
 */
export const layer: Vitest.LayerOf<never, Vitest.LayerOptions> = internal.layer

/**
 * @since 4.0.0
 */
export const flakyTest: Vitest.FlakyTest = internal.flakyTest

/**
 * @since 4.0.0
 */
export const prop: Vitest.Methods['prop'] = internal.prop

/**
 * @since 4.0.0
 */
export const owned: <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R> = ownedInternal.owned

/**
 * @since 4.0.0
 */
export const recordAssertion: () => void = ownedInternal.recordAssertion

/**
 * The run binding of the test the effect is executing in. `bind` re-provides it
 * to an effect a library runs on a runtime of its own — its own scheduler, a
 * worker, a simulation kernel — so the checks inside it count as this test's
 * assertions, report softly, and see the same `owned` regions as the test.
 *
 * @since 4.0.0
 */
export const captureRunBinding: Effect.Effect<ownedInternal.RunBinding> = ownedInternal.captureRunBinding

/**
 * The key the running test's context is published under. A library that carries its own view of the task
 * context builds that view on this key, so the context a case lane sees and a property lane sees agree.
 *
 * @since 4.0.0
 */
export const vitestTestContextKey: string = testContextInternal.vitestTestContextKey

/**
 * The running Vitest `TestContext`, provided on every test the fork runs — the Effect lanes, both property
 * lanes, and each `it.each` row. It is `null` outside a run.
 *
 * @since 4.0.0
 */
export const VitestTestContext: Context.Reference<V.TestContext | null> = testContextInternal.VitestTestContext

/**
 * @since 4.0.0
 */
export const it: Vitest.Methods = internal.makeMethods(V.it)

/**
 * @since 4.0.0
 */
export const makeMethods: (it: V.TestAPI) => Vitest.Methods = internal.makeMethods

/**
 * @since 4.0.0
 */
export const describeWrapped: {
  (name: string, f: (it: Vitest.Methods) => void): V.SuiteCollector
  (f: (it: Vitest.Methods) => void): (name: string) => V.SuiteCollector
} = internal.describeWrapped

export const describe: {
  (name: string, f: (it: Vitest.Methods) => void): V.SuiteCollector
  (f: (it: Vitest.Methods) => void): (name: string) => V.SuiteCollector
} = internal.describeWrapped

/**
 * The fork's `expect`: soft within one Effect step, refusing the slop forms.
 *
 * @since 4.0.0
 */
export const expect: typeof expectInternal.expect = expectInternal.expect

/**
 * @since 4.0.0
 */
export const beforeEach: typeof expectInternal.beforeEach = expectInternal.beforeEach

/**
 * @since 4.0.0
 */
export const afterEach: typeof expectInternal.afterEach = expectInternal.afterEach

/**
 * @since 4.0.0
 */
export const beforeAll: typeof expectInternal.beforeAll = expectInternal.beforeAll

/**
 * @since 4.0.0
 */
export const afterAll: typeof expectInternal.afterAll = expectInternal.afterAll
