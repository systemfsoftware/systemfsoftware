import { Cell, Workflow } from '@systemfsoftware/effect-cell-types'
import type { Effect } from 'effect/Effect'
import type { Result } from 'effect/Result'
import { describe, expect, it } from 'tstyche'

import { acceptTaggedCommand, type FixtureDecision } from '../tests/__fixtures__/accept-tagged-command.workflow.js'
import { type Admitted, type Rejected } from '../tests/__fixtures__/admit-decoded-command.workflow.js'
import { chainAdmitTaggedCommands } from '../tests/__fixtures__/chain-admit-tagged-commands.workflow.js'
import { ChainedTaggedCommand } from '../tests/__fixtures__/chain-admit-tagged-commands.workflow.js'
import { CommandRefused, StructCmd, TaggedCmd, UntaggedCmd } from '../tests/__fixtures__/Command.schema.js'
import { type Decision, DecisionError, LoneDecision } from '../tests/__fixtures__/Decision.schema.js'
import { refuseWidenedCommand, type WidenedDecision } from '../tests/__fixtures__/refuse-widened-command.workflow.js'
import { SettleCommand } from '../tests/__fixtures__/total-admit-decision.workflow.js'
import { totalAdmitTaggedCommand } from '../tests/__fixtures__/total-admit-tagged-command.workflow.js'
import { totalPairAdmitTaggedCommands } from '../tests/__fixtures__/total-pair-admit-tagged-commands.workflow.js'

interface UntaggedMember {
  readonly value: number
}

interface UnbrandedOne {
  readonly _tag: 'UnbrandedOne'
  readonly one: number
}

interface UnbrandedTwo {
  readonly _tag: 'UnbrandedTwo'
  readonly two: string
}

declare const FamilyOne: unique symbol
declare const FamilyTwo: unique symbol

interface SplitOne {
  readonly _tag: 'SplitOne'
  readonly [FamilyOne]: typeof FamilyOne
}

interface SplitTwo {
  readonly _tag: 'SplitTwo'
  readonly [FamilyTwo]: typeof FamilyTwo
}

declare const KeyOnlyBrand: unique symbol

interface KeyOnlyBrandOne {
  readonly _tag: 'KeyOnlyBrandOne'
  readonly [KeyOnlyBrand]: 'one'
}

interface KeyOnlyBrandTwo {
  readonly _tag: 'KeyOnlyBrandTwo'
  readonly [KeyOnlyBrand]: 'two'
}

declare const UnrelatedBrand: unique symbol

interface UnrelatedKeyStringOne {
  readonly _tag: 'UnrelatedKeyStringOne'
  readonly [UnrelatedBrand]: 'one'
}

interface UnrelatedKeyStringTwo {
  readonly _tag: 'UnrelatedKeyStringTwo'
  readonly [UnrelatedBrand]: 'two'
}

interface UnrelatedBrandOne {
  readonly _tag: 'UnrelatedBrandOne'
  readonly [UnrelatedBrand]: typeof UnrelatedBrand
}

interface UnrelatedBrandTwo {
  readonly _tag: 'UnrelatedBrandTwo'
  readonly [UnrelatedBrand]: typeof UnrelatedBrand
}

declare const NarrowSlotBrandTypeId: unique symbol

/**
 * The narrowed twin of the class idiom, hand-written as interfaces: an interface has no field
 * initializer, so the slot can only be annotated (`typeof T`), which keeps it the unique symbol
 * type — the slot width a class field's initializer leaves behind when it widens to the general
 * `symbol`. This is the shape the predicate refuses.
 */
interface NarrowSlotBrandOne {
  readonly _tag: 'NarrowSlotBrandOne'
  readonly value: number
  readonly [NarrowSlotBrandTypeId]: typeof NarrowSlotBrandTypeId
}

interface NarrowSlotBrandTwo {
  readonly _tag: 'NarrowSlotBrandTwo'
  readonly reason: string
  readonly [NarrowSlotBrandTypeId]: typeof NarrowSlotBrandTypeId
}

/**
 * The spoken-loudly twin of {@link NarrowSlotBrandOne}: an interface that annotates the slot
 * with the general `symbol` instead. That is the type a class field's initializer infers, so
 * this union is structurally the class instance itself — the check keys on the declared shape
 * (a widened slot), never on whether the declaration is a class or an interface.
 */
interface WidenedBrandOne {
  readonly _tag: 'WidenedBrandOne'
  readonly [UnrelatedBrand]: symbol
}

interface WidenedBrandTwo {
  readonly _tag: 'WidenedBrandTwo'
  readonly [UnrelatedBrand]: symbol
}

interface StringKeyBrandOne {
  readonly _tag: 'StringKeyBrandOne'
  readonly familyBrand: symbol
}

interface StringKeyBrandTwo {
  readonly _tag: 'StringKeyBrandTwo'
  readonly familyBrand: symbol
}

declare const decideOverTagged: (command: TaggedCmd) => Result<Decision, DecisionError>
declare const decideOverUntagged: (command: UntaggedCmd) => Result<Decision, DecisionError>
declare const decideWidened: typeof refuseWidenedCommand
declare const decideNeverOverTagged: (command: TaggedCmd) => Result<Decision, never>
declare const decideLoneOverTagged: (command: TaggedCmd) => Result<LoneDecision, CommandRefused>
declare const decideUntaggedOverTagged: (command: TaggedCmd) => Result<Decision | UntaggedMember, CommandRefused>
declare const decideUnbrandedOverTagged: (command: TaggedCmd) => Result<UnbrandedOne | UnbrandedTwo, CommandRefused>
declare const decideSplitOverTagged: (command: TaggedCmd) => Result<SplitOne | SplitTwo, CommandRefused>
declare const decideKeyOnlyBrandOverTagged: (
  command: TaggedCmd,
) => Result<KeyOnlyBrandOne | KeyOnlyBrandTwo, CommandRefused>
declare const decideUnrelatedKeyStringOverTagged: (
  command: TaggedCmd,
) => Result<UnrelatedKeyStringOne | UnrelatedKeyStringTwo, CommandRefused>
declare const decideUnrelatedBrandTotalOverTagged: (
  command: TaggedCmd,
) => Result<UnrelatedBrandOne | UnrelatedBrandTwo, never>
declare const decideNarrowSlotBrandOverTagged: (
  command: TaggedCmd,
) => Result<NarrowSlotBrandOne | NarrowSlotBrandTwo, CommandRefused>
declare const decideUnrelatedBrandOverTagged: (
  command: TaggedCmd,
) => Result<UnrelatedBrandOne | UnrelatedBrandTwo, CommandRefused>
declare const decidePromiseOverTagged: (command: TaggedCmd) => Promise<Decision>
declare const decideChainedUnbranded: (command: ChainedTaggedCommand) => Result<FixtureDecision, DecisionError>

type SettledDecision = Admitted | Rejected

declare const decideTotalOverSettle:
  & ((command: SettleCommand) => Result<SettledDecision, never>)
  & Workflow.WorkflowBrand
declare const decideRefusingOverSettle:
  & ((command: SettleCommand) => Result<SettledDecision, DecisionError>)
  & Workflow.WorkflowBrand
declare const readSettleCommand: (command: SettleCommand) => Effect<SettleCommand, never, never>
declare const writeTotalSettleOutcome: (
  outcome: Result<SettledDecision, never>,
  raw: SettleCommand,
) => Effect<void, never, never>

describe('T11 the commands and deciders make refuses', () => {
  it('Should_BrandTheWorkflow_When_TheDeciderCarriesTwoTaggedVariants', () => {
    expect(acceptTaggedCommand).type.toBe<Workflow.Workflow<TaggedCmd, FixtureDecision, CommandRefused>>()
  })

  it('Should_AcceptTheUntaggedClassCommand_When_TheDeciderCarriesTwoVariants', () => {
    expect<typeof Workflow.make>().type.toBeCallableWith(UntaggedCmd, decideOverUntagged)
  })

  it('Should_RefuseTheNeverErrorChannel_When_TheDecisionCannotFail', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(TaggedCmd, decideNeverOverTagged)
  })

  it('Should_RefuseASingleVariant_When_TheDecisionHasOneTag', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(TaggedCmd, decideLoneOverTagged)
  })

  it('Should_RefuseAnUntaggedVariant_When_TheUnionCarriesOne', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(TaggedCmd, decideUntaggedOverTagged)
  })

  it('Should_RefuseAnUnbrandedUnion_When_NoSharedTypeIdBindsIt', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(TaggedCmd, decideUnbrandedOverTagged)
  })

  it('Should_RefuseANonClassCommand_When_TheConstraintIsASchema', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(StructCmd, decideOverTagged)
  })

  it('Should_RefuseAPromiseDecider_When_TheResultIsNotAResult', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(TaggedCmd, decidePromiseOverTagged)
  })

  it('Should_KeepTheClassCommand_When_TheDeciderWidensItsParameter', () => {
    expect(decideWidened).type.toBe<Workflow.Workflow<TaggedCmd, WidenedDecision, CommandRefused>>()
  })
})

describe('T12 the total constructor', () => {
  it('Should_BrandTheTotalDecision_When_ItsErrorChannelIsNever', () => {
    expect(totalAdmitTaggedCommand).type.toBe<
      ((command: TaggedCmd) => Result<Decision, never>) & Workflow.WorkflowBrand
    >()
  })

  it('Should_RefuseASingleVariant_When_TheTotalDecisionHasOneTag', () => {
    expect<typeof Workflow.total>().type.not.toBeCallableWith(TaggedCmd, decideLoneOverTagged)
  })

  it('Should_RefuseAnUntaggedVariant_When_TheTotalUnionCarriesOne', () => {
    expect<typeof Workflow.total>().type.not.toBeCallableWith(TaggedCmd, decideUntaggedOverTagged)
  })

  it('Should_RefuseAnUnbrandedUnion_When_TheTotalUnionSharesNoTypeId', () => {
    expect<typeof Workflow.total>().type.not.toBeCallableWith(TaggedCmd, decideUnbrandedOverTagged)
  })
})

describe('T13 the composite constructor', () => {
  it('Should_UnionTheComponentErrors_When_TwoWorkflowsChain', () => {
    expect(chainAdmitTaggedCommands).type.toBe<Workflow.Workflow<TaggedCmd, Decision, CommandRefused | DecisionError>>()
  })

  it('Should_RefuseAnAdapterLambda_When_TheDownstreamIsAFunction', () => {
    expect<typeof Workflow.andThen>().type.not.toBeCallableWith(
      TaggedCmd,
      acceptTaggedCommand,
      ChainedTaggedCommand,
      'ctx',
      decideChainedUnbranded,
    )
  })

  it('Should_BrandTheTotalComposite_When_NeitherComponentCanFail', () => {
    expect(totalPairAdmitTaggedCommands([])).type.toBe<
      ((command: SettleCommand) => Result<SettledDecision, never>) & Workflow.WorkflowBrand
    >()
  })

  it('Should_KeepTheCarriedChannel_When_TheTotalComesFirst', () => {
    const composite = Workflow.andThen(
      SettleCommand,
      decideTotalOverSettle,
      SettleCommand,
      'second',
      decideRefusingOverSettle,
    )
    expect(composite).type.toBe<Workflow.Workflow<SettleCommand, SettledDecision, DecisionError>>()
  })

  it('Should_KeepTheCarriedChannel_When_TheTotalComesLast', () => {
    const composite = Workflow.andThen(
      SettleCommand,
      decideRefusingOverSettle,
      SettleCommand,
      'second',
      decideTotalOverSettle,
    )
    expect(composite).type.toBe<Workflow.Workflow<SettleCommand, SettledDecision, DecisionError>>()
  })

  it('Should_RefuseTheUninhabitedAnnotation_When_TheCompositeIsTotal', () => {
    expect(totalPairAdmitTaggedCommands([])).type.not.toBeAssignableTo<
      Workflow.Workflow<SettleCommand, SettledDecision, never>
    >()
  })
})

describe('T14 the shared-type-id predicate as measured', () => {
  it('Should_RefuseTheMarker_When_TheUnionSharesNoProperty', () => {
    expect<Workflow.Inhabited<UnbrandedOne | UnbrandedTwo, CommandRefused>>().type.toBe<Workflow.UnsharedTypeId>()
  })

  it('Should_RefuseTheMarker_When_TwoFamiliesCarryDivergentTypeIds', () => {
    expect<Workflow.Inhabited<SplitOne | SplitTwo, CommandRefused>>().type.toBe<Workflow.UnsharedTypeId>()
  })

  it('Should_RefuseTheMarker_When_TheSharedSymbolKeyCarriesAStringValue', () => {
    expect<Workflow.Inhabited<KeyOnlyBrandOne | KeyOnlyBrandTwo, CommandRefused>>().type.toBe<Workflow.UnsharedTypeId>()
  })

  it('Should_RefuseTheMarker_When_AnUnrelatedSymbolKeyCarriesStringLiterals', () => {
    expect<Workflow.Inhabited<UnrelatedKeyStringOne | UnrelatedKeyStringTwo, CommandRefused>>().type.toBe<
      Workflow.UnsharedTypeId
    >()
  })

  it('Should_RefuseTheMarker_When_AnUnrelatedSymbolKeyCarriesTheSymbolItself', () => {
    expect<Workflow.Inhabited<UnrelatedBrandOne | UnrelatedBrandTwo, CommandRefused>>().type.toBe<
      Workflow.UnsharedTypeId
    >()
  })

  it('Should_RefuseTheMarker_When_ConstructorReceivedTheUnrelatedPair', () => {
    expect<typeof Workflow.total>().type.not.toBeCallableWith(TaggedCmd, decideUnrelatedKeyStringOverTagged)
  })

  it('Should_RefuseTheMarker_When_TheUnrelatedPairReachesTheTotalConstructor', () => {
    expect<typeof Workflow.total>().type.not.toBeCallableWith(TaggedCmd, decideUnrelatedBrandTotalOverTagged)
  })

  it('Should_RefuseTheMarker_When_TheUnrelatedPairReachesAMakeConstructor', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(TaggedCmd, decideUnrelatedBrandOverTagged)
  })

  it('Should_RefuseTheMarker_When_AnInterfaceCarriesTheNarrowSlotBrand', () => {
    expect<Workflow.Inhabited<NarrowSlotBrandOne | NarrowSlotBrandTwo, CommandRefused>>().type.toBe<
      Workflow.UnsharedTypeId
    >()
  })

  it('Should_RefuseTheMarker_When_TheNarrowSlotPairReachesAMakeConstructor', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(TaggedCmd, decideNarrowSlotBrandOverTagged)
  })

  it('Should_AcceptTheMarker_When_AnInterfaceCarriesTheClassFieldsWidenedSlot', () => {
    expect<Workflow.Inhabited<WidenedBrandOne | WidenedBrandTwo, CommandRefused>>().type.toBe<unknown>()
  })

  it('Should_AcceptTheMarker_When_TheGenuineTaggedClassFamilyCarriesTheFieldInitializerBrand', () => {
    expect<Workflow.Inhabited<Decision, CommandRefused>>().type.toBe<unknown>()
  })

  it('Should_RefuseTheMarker_When_TheFamilyBrandCarriesAStringKey', () => {
    expect<Workflow.Inhabited<StringKeyBrandOne | StringKeyBrandTwo, CommandRefused>>().type.toBe<
      Workflow.UnsharedTypeId
    >()
  })

  it('Should_RefuseTheMarker_When_TheSplitPairReachesAConstructor', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(TaggedCmd, decideSplitOverTagged)
  })

  it('Should_RefuseTheMarker_When_TheKeyOnlyPairReachesAConstructor', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(TaggedCmd, decideKeyOnlyBrandOverTagged)
  })
})

describe('T15 the composite the decide slot accepts', () => {
  it('Should_AcceptTheTotalComposite_When_TheDecideSlotTakesAWorkflow', () => {
    const cell = Cell.layer({
      read: readSettleCommand,
      decide: totalPairAdmitTaggedCommands([]),
      write: writeTotalSettleOutcome,
    })
    expect(cell).type.toBe<Cell.Cell<SettleCommand, void, never, never>>()
  })
})
