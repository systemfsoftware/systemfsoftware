import type * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import type * as Scope from 'effect/Scope'
import { describe, expect, it } from 'tstyche'
import type * as V from 'vitest'
import * as Fork from '../src/mod'
import type { Vitest } from '../src/mod'

/**
 * Upstream `@effect/vitest` rc.117's published surface (repos/effect/packages/vitest/src/index.ts), spelled
 * out because `@effect/vitest` resolves to this package. `prop` is deliberately missing from `Tester`: the
 * fork's lawful property API replaces the positional one (R11-R15), so the claim is about the rest.
 */
declare namespace Upstream {
  interface TestFunction<A, E, R> {
    (ctx: V.TestContext): Effect.Effect<A, E, R>
  }

  interface Test<R> {
    <A, E>(name: string, self: TestFunction<A, E, R>, timeout?: number | V.TestOptions): void
  }

  interface Tester<R> extends Test<R> {
    skip: Test<R>
    only: Test<R>
    fails: Test<R>
  }

  interface LayerOf {
    <R2, E>(layer: Layer.Layer<R2, E>, options?: { readonly concurrent?: boolean }): {
      (f: (it: object) => void): void
      (name: string, f: (it: object) => void): void
    }
  }

  interface Methods {
    readonly effect: Tester<Scope.Scope>
    readonly live: Tester<Scope.Scope>
    readonly flakyTest: <A, E, R2>(
      self: Effect.Effect<A, E, R2 | Scope.Scope>,
      timeout?: string,
    ) => Effect.Effect<A, never, R2>
    readonly layer: LayerOf
  }
}

const innerBlock = (it: Vitest.MethodsNonLive<never>): void => {
  void it
}

const subject = (n: number): number => n + 1

const holdsSync = (s: (n: number) => number, values: ReadonlyArray<number>): boolean => {
  const first = values[0] ?? 0
  return s(first) === first + 1
}

type OwnedSignature = <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>

describe('the fork keeps the surface upstream publishes (R1)', () => {
  it('exports the integration API unchanged', () => {
    expect(Fork.addEqualityTesters).type.toBe<() => void>()
    expect(Fork.recordAssertion).type.toBe<() => void>()
    expect(Fork.owned).type.toBe<OwnedSignature>()
    expect(Fork.makeMethods).type.toBe<(it: V.TestAPI) => Vitest.Methods>()
  })

  it('exports the running test context under its published key', () => {
    expect(Fork.VitestTestContext).type.toBe<Context.Reference<V.TestContext | null>>()
    expect(Fork.vitestTestContextKey).type.toBe<string>()
  })

  it('keeps the data-first call forms upstream documents', () => {
    expect(Fork.it.effect).type.toBeCallableWith('a test', () => Effect.void)
    expect(Fork.it.live).type.toBeCallableWith('a test', () => Effect.void)
    expect(Fork.it.effect).type.toBeAssignableTo<Upstream.Tester<Scope.Scope>>()
    expect(Fork.it.live).type.toBeAssignableTo<Upstream.Tester<Scope.Scope>>()
    expect(Fork.effect).type.toBeAssignableTo<Upstream.Tester<Scope.Scope>>()
    expect(Fork.live).type.toBeAssignableTo<Upstream.Tester<Scope.Scope>>()
  })

  it('keeps the upstream layer call form and refuses a non-layer', () => {
    expect(Fork.layer).type.toBeCallableWith(Layer.empty)
    expect(Fork.layer).type.toBeCallableWith(Layer.empty, {
      concurrent: true,
      timeout: '5 seconds',
      excludeTestServices: true,
    })
    expect(Fork.layer).type.not.toBeCallableWith(1)
    expect(Fork.it.layer).type.toBeAssignableTo<Upstream.LayerOf>()
    expect(Fork.it.effect).type.not.toBeCallableWith(1)
  })

  it('keeps flakyTest, describeWrapped and the fork expect', () => {
    expect(Fork.flakyTest).type.toBeCallableWith(Effect.void)
    expect(Fork.flakyTest).type.toBeCallableWith(Effect.void, '5 seconds')
    expect(Fork.flakyTest).type.not.toBeCallableWith({ nope: true })
    expect(Fork.describeWrapped).type.toBeCallableWith('a suite', innerBlock)
    expect(Fork.expect(1).toEqual).type.toBeCallableWith(1)
  })
})

describe('every added data-last form type-checks (pipeable surface)', () => {
  it('routes it data-last to a named registration', () => {
    expect(Fork.it(() => Effect.void)).type.toBe<(name: string | Function) => void>()
    expect(Fork.it({ timeout: 100 }, () => Effect.void)).type.toBe<(name: string | Function) => void>()
  })

  it('routes the Effect lanes data-last', () => {
    expect(Fork.it.effect(() => Effect.void)).type.toBe<(name: string) => void>()
    expect(Fork.it.live(() => Effect.void)).type.toBe<(name: string) => void>()
    expect(Fork.effect(() => Effect.void)).type.toBe<(name: string) => void>()
    expect(Fork.live(() => Effect.void)).type.toBe<(name: string) => void>()
    expect(Fork.it.effect.skip(() => Effect.void)).type.toBe<(name: string) => void>()
    expect(Fork.it.effect.fails(() => Effect.void)).type.toBe<(name: string) => void>()
  })

  it('routes the sync property lane data-last', () => {
    expect(Fork.it.prop({ of: [Schema.Int], subject, runs: 100 }, holdsSync)).type.toBe<(name: string) => void>()
    expect(Fork.prop({ of: [Schema.Int], subject, runs: 100 }, holdsSync)).type.toBe<(name: string) => void>()
  })

  it('routes layer and flakyTest data-last', () => {
    expect(Fork.layer()).type.toBeCallableWith(Layer.empty)
    expect(Fork.layer({ concurrent: true })).type.toBeCallableWith(Layer.empty)
    expect(Layer.empty.pipe(Fork.layer())).type.toBeCallableWith(innerBlock)
    expect(Fork.flakyTest()).type.toBeCallableWith(Effect.void)
    expect(Effect.void.pipe(Fork.flakyTest())).type.toBe<Effect.Effect<void, never, never>>()
  })

  it('routes describeWrapped data-last', () => {
    expect(Fork.describeWrapped(innerBlock)).type.toBe<(name: string) => V.SuiteCollector>()
  })
})
