/// <reference types="./compat.d.ts" />
/**
 * The root entry of the fork. There is no `expect` here: a test's `expect` is the parameter of its own body, so
 * the check is bound to the test by construction (R1, KTD2). The Vitest values the fork still re-exports are
 * listed explicitly, so a value it refuses cannot arrive through a star export.
 *
 * The v3 `effect/TestClock` ambient (R18) arrives through the reference above.
 */
import type * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import type * as Layer from 'effect/Layer'
import type * as Scope from 'effect/Scope'
import * as V from 'vitest'
import type { Asserted, Check, Checks, Expect } from './internal/checks.js'
import { checkDefaultsKey, type ProvidedCheckDefaults } from './internal/property/defaults.js'
import type * as Engine from './internal/property/engine.js'
import type * as Property from './internal/property/kinds.js'
import type {
  EffectLaneRefusal,
  NoCheckRefusal,
  RefuseAsyncBody,
  RefuseEffectBody,
  RefuseSyncBody,
  ScopedLaneRefusal,
  ScopedLiveLaneRefusal,
  UnprovidedRefusal,
} from './internal/refusals.js'
import * as internal from './internal/runner.js'
import * as testContextInternal from './internal/test-context.js'

declare module 'vitest' {
  interface ProvidedContext {
    [checkDefaultsKey]?: ProvidedCheckDefaults
    '@systemfsoftware/vitest:package'?: string
    '@systemfsoftware/vitest:workspace-root'?: string
  }
}

/**
 * The Vitest values the fork keeps. `expect`, `assert`, `beforeEach` and `afterEach` are deliberately absent:
 * the first two are what the callback parameter replaces (R1), and the last two are the fork's own refusals.
 *
 * @since 4.0.0
 */
export {
  afterAll,
  assertType,
  beforeAll,
  expectTypeOf,
  inject,
  onTestFailed,
  onTestFinished,
  recordArtifact,
  vi,
  vitest,
} from 'vitest'

/**
 * The fork's test API and the types a body, a check and a property are written with.
 *
 * @since 4.0.0
 */
export namespace Vitest {
  /**
   * Any argument a refusal accepts. A refusal sits on the `this` type, so the call's own arguments must still
   * type-check; this is the widest argument type this repo's lint allows.
   *
   * @since 4.0.0
   */
  export type Argument = object | string | number | boolean | bigint | symbol | null | undefined

  /**
   * What a body yields and returns: the checks it was handed, then the Effects it yields.
   *
   * @since 4.0.0
   */
  export type Body<Eff, AEff> = (checks: Checks) => Generator<Eff, AEff, never>

  /**
   * A row body: the row first, then the checks — the order Vitest's `it.for` passes them (R9).
   *
   * @since 4.0.0
   */
  export type RowBody<Row, Eff, AEff> = (row: Row, checks: Checks) => Generator<Eff, AEff, never>

  /**
   * Whether `Eff` still stands at the placeholder the checker uses while it is inferring a body's yields.
   * `unknown` is the only sound placeholder; `Sentinel` names it as a generic default, so no bare `unknown`
   * appears at a use site.
   *
   * @since 4.0.0
   */
  export type Unresolved<Eff, Sentinel = unknown> = [Eff] extends [never] ? false
    : [Sentinel] extends [Eff] ? true
    : false

  /**
   * The requirement a body's yields impose on the run.
   *
   * **Details**
   *
   * `Eff` is inferred from what the body yields. While a body is still being inferred — and always, for a body
   * whose `{ expect }` is destructured without an annotation — `Eff` stands at the checker's placeholder, and
   * this reads that placeholder as the checks' own requirement. The body's real yields decide once inference
   * settles, which is what refuses a body that yields no check at the test name (R4).
   *
   * @since 4.0.0
   */
  export type RequirementOf<Eff> = [Eff] extends [never] ? never
    : [Eff] extends [Effect.Effect<infer _A, infer _E, infer R>] ? R
    : Unresolved<Eff> extends true ? Asserted
    : never

  /**
   * What a lane provides besides its block's layer: the scope the body runs in, and the checks it yields.
   *
   * @since 4.0.0
   */
  export type Lane<R> = R | Scope.Scope | Asserted

  /**
   * The no-check gate, on the test name (KTD4). It reads the tuple form so a distributive `Exclude` cannot widen
   * `R`, and it sits on the name rather than the body because a body with a destructured `{ expect }` is
   * context-sensitive: a gate on the body is judged before `{ expect }` is inferred, so it cannot see the checks.
   *
   * @since 4.0.0
   */
  export type Gate<R, Provided = never> = [R] extends [Asserted | Provided]
    ? [Asserted] extends [R] ? string : NoCheckRefusal
    : UnprovidedRefusal

  /**
   * A body that is not the generator itself, as a parameter union: the error prints the rewrite (KTD3). A sync
   * body, an `async` body and an Effect-returning body each reach one of these texts, at compile time and at run
   * time (R2).
   *
   * @since 4.0.0
   */
  export type BodyRefusal = RefuseSyncBody | RefuseAsyncBody | RefuseEffectBody

  /**
   * A test lane: `it(name, function* ({ expect }) { ... })`. `R` is what the lane's own environment provides
   * besides the checks — its scope, and the services of the `layer` block it is written in.
   *
   * @since 4.0.0
   */
  export interface Test<R> {
    <Eff, AEff>(
      name: NoInfer<Gate<RequirementOf<Eff>, Lane<R>>>,
      body: Body<Eff, AEff> | BodyRefusal,
      timeout?: number | V.TestOptions,
    ): void
    <Eff, AEff>(
      body: Body<Eff, AEff> | BodyRefusal,
      timeout?: number | V.TestOptions,
    ): (name: NoInfer<Gate<RequirementOf<Eff>, Lane<R>>>) => void
  }

  /**
   * A row lane: `it.each(rows)(name, function* (row, { expect }) { ... })`.
   *
   * @since 4.0.0
   */
  export interface RowTest<Row, R> {
    <Eff, AEff>(
      name: NoInfer<Gate<RequirementOf<Eff>, Lane<R>>>,
      body: RowBody<Row, Eff, AEff> | BodyRefusal,
      timeout?: number | V.TestOptions,
    ): void
  }

  /**
   * The `it` modifiers every lane has, each registering the same generator body.
   *
   * @since 4.0.0
   */
  export interface Modifiers<R> {
    readonly skip: Test<R>
    readonly skipIf: (condition: boolean) => Test<R>
    readonly runIf: (condition: boolean) => Test<R>
    readonly only: Test<R>
    readonly fails: Test<R>
    readonly each: <Row>(cases: ReadonlyArray<Row>) => RowTest<Row, R>
  }

  /**
   * A lane with the Effect-lane property attached: `it.live.prop(...)` and `it.effect.prop(...)`.
   *
   * @since 4.0.0
   */
  export interface Tester<R> extends Test<R>, Modifiers<R> {
    readonly prop: EffectProperty<R>
  }

  /**
   * A removed habit lane: calling it is a `this`-type error naming the lane and its rewrite, and a run-time
   * throw with the same text (R9, KTD3). `Refusal` is that lane's own text, so `it.scoped` blames `it.scoped`
   * and `it.effect` blames `it.effect`. It keeps `prop`, so `it.effect.prop` still runs properties.
   *
   * @since 4.0.0
   */
  export interface EffectLane<R, Refusal extends string = EffectLaneRefusal> {
    (this: Refusal, ...args: ReadonlyArray<Argument>): never
    readonly prop: EffectProperty<R | Scope.Scope>
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
   * A property's `holds` on the Effect lane: the verdict is an `Effect` of the literal boolean.
   *
   * @since 4.0.0
   */
  export type EffectProperty<R> = <const G extends Gens, S extends PropertySubject, N extends number, E>(
    name: string,
    spec: PropertySpec<G, S, N>,
    holds: (subject: S, values: Values<G>) => Effect.Effect<boolean, E, R>,
  ) => void

  /**
   * A property's `holds` on the sync lane: the verdict is a literal boolean.
   *
   * @since 4.0.0
   */
  export type SyncProperty = {
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
   * The lanes a `layer` block hands its body: the generator lanes, the fences a property lives in, and the
   * removal of the Effect lane as a callable. `R` is what the block's layer provides; the lanes carry the
   * block's own scope beside it, which is why the base callable is `Test<R | Scope.Scope>`.
   *
   * @since 4.0.0
   */
  export interface MethodsNonLive<R = never> extends Test<R | Scope.Scope>, Modifiers<R | Scope.Scope> {
    readonly effect: EffectLane<R, EffectLaneRefusal>
    readonly scoped: EffectLane<R, ScopedLaneRefusal>
    readonly scopedLive: EffectLane<R, ScopedLiveLaneRefusal>
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
    readonly prop: SyncProperty

    /**
     * The R13 law kinds: `model`, `metamorphic`, `roundTrip` and `invariant` are gated like `prop`;
     * `idempotent` and `deterministic` skip the impostor gate and are reported as exempt.
     *
     * @since 4.0.0
     */
    readonly law: Property.LawApi
  }

  /**
   * The top-level methods: `MethodsNonLive` plus the real-clock lane and the top-level `layer`.
   *
   * @since 4.0.0
   */
  export interface Methods<R = never> extends MethodsNonLive<R> {
    readonly live: Tester<R | Scope.Scope>
    readonly layer: LayerOf<R, LayerOptions>
  }
}

/**
 * The fork's test API, with the generator lanes of R2 and R9.
 *
 * @since 4.0.0
 */
export const it: Vitest.Methods = internal.makeMethods(V.it)

/**
 * The same lanes under the other name upstream publishes.
 *
 * @since 4.0.0
 */
export const test: Vitest.Methods = it

/**
 * The fork's lawful collector: it forces the fork's concurrency and shuffle defaults and hands its body the
 * fork's methods.
 *
 * @since 4.0.0
 */
export const describeWrapped: {
  (name: string, f: (it: Vitest.Methods) => void): V.SuiteCollector
  (f: (it: Vitest.Methods) => void): (name: string) => V.SuiteCollector
} = internal.describeWrapped

/**
 * @since 4.0.0
 */
export const describe: {
  (name: string, f: (it: Vitest.Methods) => void): V.SuiteCollector
  (f: (it: Vitest.Methods) => void): (name: string) => V.SuiteCollector
} = internal.describeWrapped

/**
 * Share a `Layer` between multiple tests, optionally wrapping the tests in a `describe` block if a name is
 * provided. Every test in the block gets its own fresh build of the layer, unless the block declares
 * `shared: true`.
 *
 * ```ts
 * import { it, layer } from "@systemfsoftware/vitest"
 * import { Context, Effect, Layer } from "effect"
 *
 * class Foo extends Context.Service<Foo, "foo">()("Foo") {
 *   static layer = Layer.succeed(Foo, "foo")
 * }
 *
 * layer(Foo.layer)("layer", (it) => {
 *   it("reads the service", function* ({ expect }) {
 *     const foo = yield* Foo
 *     yield* expect(foo).toEqual("foo")
 *   })
 * })
 * ```
 *
 * @since 4.0.0
 */
export const layer: Vitest.LayerOf<never, Vitest.LayerOptions> = internal.layer

/**
 * @since 4.0.0
 */
export const flakyTest: Vitest.FlakyTest = internal.flakyTest

/**
 * @since 4.0.0
 */
export const prop: Vitest.SyncProperty = internal.prop

/**
 * @since 4.0.0
 */
export const law: Property.LawApi = internal.law

/**
 * The fork's test API over another Vitest `it`, so a library can register tests in its own suite.
 *
 * @since 4.0.0
 */
export const makeMethods: (it: V.TestAPI) => Vitest.Methods = internal.makeMethods

/**
 * Refused: hooks share state between tests, and services come fresh per test from `layer`.
 *
 * @since 4.0.0
 */
export const beforeEach: typeof internal.beforeEach = internal.beforeEach

/**
 * Refused: hooks share state between tests, and services come fresh per test from `layer`.
 *
 * @since 4.0.0
 */
export const afterEach: typeof internal.afterEach = internal.afterEach

/**
 * @since 4.0.0
 */
export const addEqualityTesters: () => void = internal.addEqualityTesters

/**
 * The key the running test's context is published under. A library that carries its own view of the task
 * context builds that view on this key, so the context a case lane sees and a property lane sees agree.
 *
 * @since 4.0.0
 */
export const vitestTestContextKey: string = testContextInternal.vitestTestContextKey

/**
 * The running Vitest `TestContext`, provided on every test the fork runs — every generator lane, both property
 * lanes, and each `it.each` row. It is `null` outside a run.
 *
 * @since 4.0.0
 */
export const VitestTestContext: Context.Reference<V.TestContext | null> = testContextInternal.VitestTestContext

/**
 * The no-check gate, on the test name (KTD4).
 *
 * @since 4.0.0
 */
export type Gate<R, Provided = never> = Vitest.Gate<R, Provided>

/**
 * What a test body receives: the one `expect` in reach.
 *
 * @since 4.0.0
 */
export type { Check, Checks, Expect }

/**
 * The `Asserted` service a check needs; a library that ends in a check names it, and `@systemfsoftware/vitest/integration`
 * exports the step marker that opens a new observed state.
 *
 * @since 4.0.0
 */
export type { Asserted }
