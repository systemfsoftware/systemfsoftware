import { type Blueprint, Handle } from '@systemfsoftware/effect-cell-types'
import type * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import type * as Layer from 'effect/Layer'
import { describe, expect, it } from 'tstyche'

import {
  type Container,
  type ContainerSpec,
  isContainer,
  type Job,
  job,
  type JobSpec,
  make,
  withPort,
  withWorkdir,
} from '../tests/__fixtures__/container.blueprint.js'
import { concat, type Matcher, matcher, orElse, type Policy, when } from '../tests/__fixtures__/matcher.blueprint.js'
import {
  above,
  ask,
  type Check,
  is,
  labels,
  numbers,
  type Question,
  type Unsure,
} from '../tests/__fixtures__/question.blueprint.js'
import {
  exec,
  isRunningContainer,
  make as running,
  type RawDriver,
  type RunningContainer,
  type TypeId as RunningContainerTypeId,
} from '../tests/__fixtures__/running-container.handle.js'

type Top<A = unknown> = A

declare const driver: RawDriver
declare const PlainId: unique symbol
declare const Plain: Handle.Definition<typeof PlainId, { readonly count: number }, never>
declare const Slotted: Handle.Definition<typeof PlainId, { readonly count: number }, RawDriver>
declare const key: Context.Key<'Redis', RunningContainer>

interface Cell<A> {
  readonly current: A
}
interface CellSlot extends Handle.Indexed {
  readonly slot: Cell<this['Index']>
}
declare const CellId: unique symbol
declare const Cells: Handle.Definition<typeof CellId, { readonly key: string }, CellSlot, Top>
type CellHandle<A> = Handle.Handle<typeof CellId, { readonly key: string }, CellSlot, A>
declare const numberCell: CellHandle<number>

describe('Blueprint', () => {
  it('Should_AgreeAcrossMethodAndDual_When_ACombinatorIsApplied', () => {
    expect(make('redis:7').withPort(6379)).type.toBe<Container>()
    expect(withPort(make('redis:7'), 6379)).type.toBe<Container>()
    expect(pipe(make('redis:7'), withPort(6379))).type.toBe<Container>()
  })

  it('Should_RefuseACombinatorArgument_When_ItIsNotTheDeclaredType', () => {
    expect(withPort).type.toBeCallableWith(make('redis:7'), 6379)
    expect(withPort).type.not.toBeCallableWith(make('redis:7'), '6379')
    expect(make('redis:7').withPort).type.toBeCallableWith(6379)
    expect(make('redis:7').withPort).type.not.toBeCallableWith('6379')
  })

  it('Should_CarryItsSpecUnchanged_When_Configured', () => {
    expect(make('redis:7').withPort(6379).spec).type.toBe<ContainerSpec>()
    expect(job('alpine').withWorkdir('/srv').spec).type.toBe<JobSpec>()
  })

  it('Should_ExposeTargetsAsProperties_When_TheBlueprintIsConfigured', () => {
    expect(make('redis:7').scoped).type.toBe<Effect.Effect<RunningContainer, never, never>>()
    expect(make('redis:7').layer(key)).type.toBe<Layer.Layer<'Redis', never, never>>()
    expect(job('alpine').run).type.toBe<Effect.Effect<string, never, never>>()
  })

  it('Should_OfferVariantOnlyCombinators_When_TheVariantDeclaresThem', () => {
    expect(job('alpine')).type.toHaveProperty('withWorkdir')
    expect(make('redis:7')).type.not.toHaveProperty('withWorkdir')
    expect(make('redis:7')).type.not.toHaveProperty('run')
    expect(pipe(job('alpine'), withWorkdir('/srv'))).type.toBe<Job>()
    expect(job('alpine').withPort(80)).type.toBe<Job>()
    expect(withWorkdir).type.toBeCallableWith(job('alpine'), '/srv')
    expect(withWorkdir).type.not.toBeCallableWith(make('redis:7'), '/srv')
  })

  it('Should_KeepTheVariant_When_ASharedDualConfiguresIt', () => {
    expect(withPort(job('alpine'), 80)).type.toBe<Job>()
    expect(pipe(job('alpine'), withPort(80))).type.toBe<Job>()
  })

  it('Should_StandInForItsBaseBlueprint_When_AVariantSharesTheBrand', () => {
    expect<Job>().type.toBeAssignableTo<Container>()
    expect<Container>().type.not.toBeAssignableTo<Job>()
  })

  it('Should_NarrowToTheBlueprint_When_TheGuardHolds', () => {
    expect(isContainer).type.toBe<(u: Top) => u is Container>()
  })
})

interface Change {
  readonly title: string
}

const impact = labels<Change>()('impact', ['breaking', 'minor'], () => 'minor')
const risk = labels<Change>()('risk', ['high', 'low'], () => 'low')
const size = numbers<Change>()('size', (change) => change.title.length)

declare const TaggedId: unique symbol
interface TagOf extends Blueprint.Target {
  readonly target: this['Index'] extends { readonly Tag: infer A } ? A : never
}
type Tagged<A> = Blueprint.Blueprint<typeof TaggedId, null, { readonly tag: TagOf }, { readonly Tag: A }>

describe('Blueprint over a type index', () => {
  it('Should_AgreeAcrossMethodAndBothDuals_When_AnOperationCompilesToAnotherType', () => {
    expect(impact.is('breaking')).type.toBe<Check<Change>>()
    expect(is(impact, 'breaking')).type.toBe<Check<Change>>()
    expect(pipe(impact, is('breaking'))).type.toBe<Check<Change>>()
  })

  it('Should_RefuseALabelTheQuestionDoesNotHave_When_CalledInAnyForm', () => {
    expect(impact.is).type.not.toBeCallableWith('critical')
    expect(is).type.not.toBeCallableWith(impact, 'critical')
    expect(pipe).type.not.toBeCallableWith(impact, is('critical'))
  })

  it('Should_OfferAnOperationOnlyWhereTheIndexAdmitsIt_When_ItIsScaleSpecific', () => {
    expect(size).type.toHaveProperty('above')
    expect(impact).type.not.toHaveProperty('above')
    expect(pipe(size, above(3))).type.toBe<Check<Change>>()
    expect(pipe).type.not.toBeCallableWith(impact, above(3))
    expect(above).type.not.toBeCallableWith(impact, 3)
  })

  it('Should_ReadATargetTypedByTheIndex_When_ItIsAProperty', () => {
    expect(impact.labels).type.toBe<ReadonlyArray<'breaking' | 'minor'>>()
  })

  it('Should_KeepUnmarkedMembers_When_TheIndexIsGeneric', () => {
    const tagOf = <A>(tagged: Tagged<A>) => tagged.tag
    expect(tagOf<'x'>).type.toBe<(tagged: Tagged<'x'>) => 'x'>()
    expect<Tagged<'x'>>().type.toHaveProperty('tag')
    expect<Question<Change, string>>().type.not.toHaveProperty('above')
  })

  it('Should_DropTheErrorChannel_When_AFallbackIsGiven', () => {
    const change: Change = { title: 'x' }
    expect(impact.ask(change)).type.toBe<Effect.Effect<'breaking' | 'minor', Unsure>>()
    expect(ask(impact, change, { onUnsure: () => 'escalate' as const })).type.toBe<
      Effect.Effect<'breaking' | 'minor' | 'escalate'>
    >()
    expect(pipe(impact, ask(change, { onUnsure: () => 'escalate' as const }))).type.toBe<
      Effect.Effect<'breaking' | 'minor' | 'escalate'>
    >()
  })

  it('Should_WidenTheOutput_When_EachCaseIsAddedInAnyForm', () => {
    const byMethod = matcher<Change>().when(impact.is('breaking'), () => 'block' as const).when(
      risk.is('high'),
      () => 42,
    )
    expect(byMethod).type.toBe<Matcher<Change, 'block' | number>>()
    expect(when(when(matcher<Change>(), impact.is('breaking'), () => 'block' as const), risk.is('high'), () => 42))
      .type.toBe<Matcher<Change, 'block' | number>>()
    expect(
      pipe(matcher<Change>(), when(impact.is('breaking'), () => 'block' as const), when(risk.is('high'), () => 42)),
    ).type.toBe<Matcher<Change, 'block' | number>>()
  })

  it('Should_TypeTheHandlerInput_When_TheCaseIsAddedInAnyForm', () => {
    expect(matcher<Change>().when(impact.is('breaking'), (change) => change.title)).type.toBe<Matcher<Change, string>>()
    expect(when(matcher<Change>(), impact.is('breaking'), (change) => change.title)).type.toBe<
      Matcher<Change, string>
    >()
    expect(pipe(matcher<Change>(), when(impact.is('breaking'), (change) => change.title))).type.toBe<
      Matcher<Change, string>
    >()
  })

  it('Should_RefuseACheckOverAnotherInput_When_TheCaseIsAdded', () => {
    expect(matcher<number>().when).type.not.toBeCallableWith(impact.is('breaking'), () => 1)
    expect(when).type.not.toBeCallableWith(matcher<number>(), impact.is('breaking'), () => 1)
    expect(pipe).type.not.toBeCallableWith(matcher<number>(), when(impact.is('breaking'), () => 1))
  })

  it('Should_JoinTheOutputs_When_TwoMatchersAreConcatenated', () => {
    const block = matcher<Change>().when(impact.is('breaking'), () => 'block' as const)
    const score = matcher<Change>().when(risk.is('high'), () => 42)
    expect(block.concat(score)).type.toBe<Matcher<Change, 'block' | number>>()
    expect(concat(block, score)).type.toBe<Matcher<Change, 'block' | number>>()
    expect(pipe(block, concat(score))).type.toBe<Matcher<Change, 'block' | number>>()
  })

  it('Should_CompileToACallablePolicy_When_AFallbackFinishesIt', () => {
    const cases = matcher<Change>().when(impact.is('breaking'), () => 'block' as const)
    expect(cases.orElse(() => true)).type.toBe<Policy<Change, 'block' | boolean>>()
    expect(orElse(cases, () => true)).type.toBe<Policy<Change, 'block' | boolean>>()
    expect(pipe(cases, orElse(() => true))).type.toBe<Policy<Change, 'block' | boolean>>()
    expect(pipe(cases, orElse((change: Change) => change.title))).type.toBe<Policy<Change, string>>()
  })

  it('Should_NotConfuseTwoKinds_When_AnOperationIsGivenTheWrongBlueprint', () => {
    expect(when).type.not.toBeCallableWith(impact, impact.is('breaking'), () => 1)
    expect(is).type.not.toBeCallableWith(matcher<Change>(), 'breaking')
  })
})

describe('Handle', () => {
  it('Should_BuildTheProtocolRecord_When_DataAndSlotAreGiven', () => {
    expect(running({ id: 'redis', driver })).type.toBe<RunningContainer>()
    expect(running({ id: 'redis', driver }).id).type.toBe<string>()
    expect(running({ id: 'redis', driver })[RunningContainerTypeIdValue]).type.toBe<RunningContainerTypeId>()
  })

  it('Should_RequireTheSlot_When_TheKindDeclaresOne', () => {
    expect(Slotted.make).type.toBeCallableWith({ count: 1 }, driver)
    expect(Slotted.make).type.not.toBeCallableWith({ count: 1 })
    expect(Plain.make).type.toBeCallableWith({ count: 1 })
    expect(Plain.make).type.not.toBeCallableWith({ count: 1 }, driver)
  })

  it('Should_KeepTheSlotKeyUnnameable_When_ReadFromOutside', () => {
    expect<keyof typeof Handle>().type.toBe<'make'>()
    expect<Extract<keyof RunningContainer, string>>().type.toBe<'id' | 'pipe'>()
    expect<Extract<keyof RunningContainer, symbol>>().type.not.toBe<RunningContainerTypeId>()
    expect<Extract<keyof Handle.Of<typeof Plain>, symbol>>().type.toBe<typeof PlainId>()
  })

  it('Should_TakeTheHandleFirstOrLast_When_AnOperationIsCalled', () => {
    expect(exec(running({ id: 'redis', driver }), 'ping')).type.toBe<Effect.Effect<number, never, never>>()
    expect(pipe(running({ id: 'redis', driver }), exec('ping'))).type.toBe<Effect.Effect<number, never, never>>()
    expect(exec).type.not.toBeCallableWith(make('redis:7'), 'ping')
  })

  it('Should_NarrowToTheHandle_When_TheGuardHolds', () => {
    expect(isRunningContainer).type.toBe<(u: Top) => u is RunningContainer>()
  })
})

describe('Handle over a type index', () => {
  it('Should_ReadTheSlotAtTheHandlesIndex_When_TheSlotIsIndexed', () => {
    expect(Cells.slot(numberCell)).type.toBe<Cell<number>>()
    expect(Cells.make<number>({ key: 'n' }, { current: 1 })).type.toBe<CellHandle<number>>()
  })

  it('Should_RefuseASlotOfAnotherIndex_When_AHandleIsMinted', () => {
    expect(Cells.make<number>).type.toBeCallableWith({ key: 'n' }, { current: 1 })
    expect(Cells.make<number>).type.not.toBeCallableWith({ key: 'n' }, { current: 'one' })
  })

  it('Should_KeepTheIndexCovariant_When_AHandleIsWidened', () => {
    expect<CellHandle<1>>().type.toBeAssignableTo<CellHandle<number>>()
    expect<CellHandle<number>>().type.not.toBeAssignableTo<CellHandle<string>>()
  })
})

declare const RunningContainerTypeIdValue: RunningContainerTypeId
