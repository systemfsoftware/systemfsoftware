import { Atom } from '@systemfsoftware/effect-atom'
import { Context, Effect, Layer, pipe, Schema } from 'effect'
import { describe, expect, it } from 'tstyche'

class NotRegistry extends Context.Service<NotRegistry, number>()(
  '@systemfsoftware/effect-atom/test-types/atom.tst/NotRegistry',
) {}

declare const registry: Atom.Registry.Registry
declare const count: Atom.Atom<number>
declare const ref: Atom.Ref.AtomRef<number>
declare const draft: Atom.Writable<number, string>
declare const loading: Atom.Atom<Atom.AsyncResult.Result<number, string>>
declare const writeContext: Atom.WriteContext<number>

describe('Atom.make', () => {
  it('Should_MakeAWritableAtomOfThatValue_When_TheInitialValueIsPlain', () => {
    expect(Atom.make(0)).type.toBe<Atom.Writable<number>>()
  })

  it('Should_ReadAsAnAsyncResultWithEveryChannelPinned_When_TheInitialValueIsAnEffect', () => {
    expect(Atom.make(Effect.succeed(1))).type.toBe<Atom.Atom<Atom.AsyncResult.Result<number, never>>>()
  })
})

describe('Atom.get', () => {
  it('Should_AnswerThroughTheCurrentRegistryServiceWithEveryChannelPinned_When_GetIsCalled', () => {
    expect(Atom.get(count)).type.toBe<Effect.Effect<number, never, Atom.Registry.Current>>()
  })
})

describe('Atom.Registry.layer', () => {
  it('Should_AcceptTheCurrentRegistryTagAndRefuseAnotherShape_When_LayerIsCalled', () => {
    expect(Atom.Registry.layer).type.toBeCallableWith(Atom.Registry.Current)
    expect(Atom.Registry.layer(Atom.Registry.Current)).type.toBe<Layer.Layer<Atom.Registry.Current>>()
    expect(Atom.Registry.layer).type.not.toBeCallableWith(NotRegistry)
  })
})

describe('dual operations', () => {
  it('Should_AcceptDataFirstAndDataLastCalls_When_RegistryGetIsCalled', () => {
    expect(Atom.Registry.get).type.toBeCallableWith(registry, count)
    expect(Atom.Registry.get(registry, count)).type.toBe<number>()
    expect(Atom.Registry.get(count)).type.toBe<(self: Atom.Registry.Registry) => number>()
    expect(pipe(registry, Atom.Registry.get(count))).type.toBe<number>()
  })

  it('Should_AcceptDataFirstAndDataLastCalls_When_RefSetIsCalled', () => {
    expect(Atom.Ref.make(0)).type.toBe<Atom.Ref.AtomRef<number>>()
    expect(Atom.Ref.set).type.toBeCallableWith(ref, 1)
    expect(Atom.Ref.set(ref, 1)).type.toBe<Atom.Ref.AtomRef<number>>()
    expect(Atom.Ref.set(1)).type.toBe<(self: Atom.Ref.AtomRef<number>) => Atom.Ref.AtomRef<number>>()
    expect(pipe(ref, Atom.Ref.set(1))).type.toBe<Atom.Ref.AtomRef<number>>()
  })
})

describe('an atom is a blueprint', () => {
  it('Should_KeepTheWritableVariantInEveryForm_When_ConfigurationStepIsApplied', () => {
    expect(draft.keepAlive()).type.toBe<Atom.Writable<number, string>>()
    expect(Atom.keepAlive(draft)).type.toBe<Atom.Writable<number, string>>()
    expect(pipe(draft, Atom.keepAlive)).type.toBe<Atom.Writable<number, string>>()
    expect(Atom.setIdleTTL(draft, '1 second')).type.toBe<Atom.Writable<number, string>>()
    expect(pipe(draft, Atom.setIdleTTL('1 second'))).type.toBe<Atom.Writable<number, string>>()
    expect(pipe(count, Atom.setLazy(false), Atom.withLabel('count'))).type.toBe<Atom.Atom<number>>()
  })

  it('Should_TypeItsCallbackByTheAtomValueAndRefuseAnotherValueType_When_AnEqualityStepIsApplied', () => {
    expect(
      pipe(
        count,
        Atom.withEquality((value, next) => {
          expect(value).type.toBe<number>()
          return value === next
        }),
      ),
    ).type.toBe<Atom.Atom<number>>()
    expect(Atom.withEquality).type.toBeCallableWith(count, (value: number, next: number) => value === next)
    expect(Atom.withEquality).type.not.toBeCallableWith(count, (value: string, next: string) => value === next)
  })

  it('Should_TypeTheServerValueByTheAtomValueAndRequireAnAsyncResultAtomForTheInitialValue_When_WithServerValueIsApplied', () => {
    expect(pipe(draft, Atom.withServerValue((get) => get(count) + 1))).type.toBe<Atom.Writable<number, string>>()
    expect(Atom.withServerValue).type.toBeCallableWith(count, () => 1)
    expect(Atom.withServerValue).type.not.toBeCallableWith(count, () => 'one')
    expect(pipe(loading, Atom.withServerValueInitial)).type.toBe<
      Atom.Atom<Atom.AsyncResult.Result<number, string>>
    >()
  })

  it('Should_AddTheSchemaToTheAtomItConfigures_When_SerializableIsApplied', () => {
    expect(Atom.serializable(draft, { key: 'draft', schema: Schema.Finite })).type.toBe<
      Atom.Writable<number, string> & Atom.Serializable<typeof Schema.Finite>
    >()
    expect(pipe(count, Atom.serializable({ key: 'count', schema: Schema.Finite }))).type.toBe<
      Atom.Atom<number> & Atom.Serializable<typeof Schema.Finite>
    >()
  })

  it('Should_TypeTheReadAndWriteTargetsByTheAtom_When_TheBlueprintIsRead', () => {
    expect(count.read).type.toBe<(get: Atom.AtomContext) => number>()
    expect(draft.write).type.toBe<(ctx: Atom.WriteContext<number>, value: string) => void>()
    expect(draft.write).type.toBeCallableWith(writeContext, 'text')
    expect(draft.write).type.not.toBeCallableWith(writeContext, 1)
  })

  it('Should_StandInForAnAtomOfItsValueAndNeverTheReverse_When_TheAtomIsWritable', () => {
    expect<Atom.Writable<number, string>>().type.toBeAssignableTo<Atom.Atom<number>>()
    expect<Atom.Atom<1>>().type.toBeAssignableTo<Atom.Atom<number>>()
    expect<Atom.Atom<number>>().type.not.toBeAssignableTo<Atom.Writable<number>>()
    expect<Atom.Atom<number>>().type.not.toBeAssignableTo<Atom.Atom<string>>()
  })

  it('Should_KeepTheWriteInputOfAWritableSource_When_TheAtomIsDerived', () => {
    expect(Atom.transform(draft, (get, self) => get(self) > 0)).type.toBe<Atom.Writable<boolean, string>>()
    expect(pipe(count, Atom.transform((get, self) => String(get(self))))).type.toBe<Atom.Atom<string>>()
    expect<Atom.Type<typeof draft>>().type.toBe<number>()
  })
})
