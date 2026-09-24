import { it as vitestIt, layer } from '@effect/vitest'
import { KernelCase, Suite } from '@systemfsoftware/effect-spec-runtime'
import { Context, Effect, Layer } from 'effect'
import { describe, expect, it } from 'tstyche'

class SharedFixture
  extends Context.Service<SharedFixture, true>()('@systemfsoftware/effect-spec-runtime/test-types/SharedFixture')
{}
class FreshFixture
  extends Context.Service<FreshFixture, true>()('@systemfsoftware/effect-spec-runtime/test-types/FreshFixture')
{}
class OtherFixture
  extends Context.Service<OtherFixture, true>()('@systemfsoftware/effect-spec-runtime/test-types/OtherFixture')
{}

interface CaseError {
  readonly message: string
}

const bindings = { it: vitestIt, layer }
const config: Suite.Config = { name: 'suite params', describe: 'describe', options: undefined }
const freshFixtureLayer: Layer.Layer<FreshFixture> = Layer.effect(
  FreshFixture,
  Effect.acquireRelease(Effect.succeed(true), () => Effect.void),
)
const otherFixtureLayer: Layer.Layer<OtherFixture> = Layer.effect(
  OtherFixture,
  Effect.acquireRelease(Effect.succeed(true), () => Effect.void),
)
const sharedFixtureLayer: Layer.Layer<SharedFixture> = Layer.effect(
  SharedFixture,
  Effect.acquireRelease(Effect.succeed(true), () => Effect.void),
)

declare const numericRegister: Suite.RegisterFn<number, CaseError, never>
declare const freshRegister: Suite.RegisterFn<void, never, FreshFixture>

describe('Suite.open', () => {
  it("accepts a registrar of the caller's own error and body channels", () => {
    expect(Suite.open).type.toBeCallableWith(
      bindings,
      config,
      (_register: Suite.RegisterFn<number, CaseError, never>) => {},
    )
    expect(Suite.openShared).type.toBeCallableWith(
      bindings,
      config,
      { layer: sharedFixtureLayer },
      (_register: Suite.RegisterFn<void, CaseError, SharedFixture>) => {},
    )
    expect(Suite.openShared).type.not.toBeCallableWith(
      bindings,
      config,
      { layer: otherFixtureLayer },
      (_register: Suite.RegisterFn<void, CaseError, SharedFixture>) => {},
    )
  })

  it('routes the body and error channels the registrar advertises', () => {
    expect(numericRegister).type.toBeCallableWith('counting case', Effect.succeed(42), 'run')
    expect(numericRegister).type.not.toBeCallableWith('string case', Effect.succeed('42'), 'run')
    expect(numericRegister).type.not.toBeCallableWith('failing case', Effect.fail('plain string'), 'run')
    expect(numericRegister).type.toBeCallableWith('failing case', Effect.fail<CaseError>({ message: 'nope' }), 'run')
  })

  it('does not erase the error channel into a broader one', () => {
    type ErasedRegister = (
      name: string,
      body: Effect.Effect<number, string, never>,
      mode: Suite.RegisterMode,
    ) => void
    expect<Suite.RegisterFn<number, CaseError, never>>().type.not.toBeAssignableTo<ErasedRegister>()
  })
})

describe('Suite.openCase', () => {
  it('accepts a registrar whose requirement is the case layer service', () => {
    expect(Suite.openCase).type.toBeCallableWith(
      bindings,
      config,
      freshFixtureLayer,
      (_register: Suite.RegisterFn<void, never, FreshFixture>) => {},
    )
  })

  it('routes the case layer service into the registrar without widening', () => {
    expect(freshRegister).type.toBeCallableWith('needing the fresh fixture', Effect.asVoid(FreshFixture), 'run')
    expect(freshRegister).type.not.toBeCallableWith('needing another fixture', Effect.asVoid(OtherFixture), 'run')
  })

  it('pins the register and describe mode unions exactly', () => {
    expect<Suite.RegisterMode>().type.toBe<'run' | 'skip' | 'only'>()
    expect<Suite.DescribeMode>().type.toBe<'describe' | 'skip' | 'only'>()
  })
})

describe('Suite.Config live declaration', () => {
  it('carries a live declaration only as a reason, never a bare flag', () => {
    expect<Suite.LiveCase>().type.toBe<{ readonly reason: string }>()
    expect<Suite.Config>().type.toBeAssignableTo<{ readonly live?: Suite.LiveCase }>()
    expect<Suite.Config>().type.not.toBeAssignableTo<{ readonly liveClock: boolean }>()
  })

  it('accepts a case-level live declaration with its reason', () => {
    expect(numericRegister).type.toBeCallableWith(
      'driving its own kernel',
      Effect.succeed(42),
      'run',
      { reason: 'drives its own kernel run' },
    )
    expect(numericRegister).type.not.toBeCallableWith(
      'driving its own kernel',
      Effect.succeed(42),
      'run',
      {},
    )
    expect(numericRegister).type.not.toBeCallableWith('counting case', Effect.succeed(42), 'run', {
      reason: 42,
    })
  })
})

describe('KernelCase.caseProgram', () => {
  it('runs once on data-first and once on data-last with the same channels', () => {
    expect(KernelCase.caseProgram(Effect.asVoid(FreshFixture), Layer.fresh(freshFixtureLayer))).type.toBe<
      Effect.Effect<void, never, never>
    >()
    expect(
      Effect.asVoid(FreshFixture).pipe(KernelCase.caseProgram(Layer.fresh(freshFixtureLayer))),
    ).type.toBe<Effect.Effect<void, never, never>>()
  })
})
