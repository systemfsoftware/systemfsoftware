import { Workflow } from '@systemfsoftware/effect-cell-types'
import type * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { describe, expect, it } from 'tstyche'

import { acceptTaggedCommand } from '../tests/__fixtures__/accept-tagged-command.workflow.js'
import {
  AdmissionDecision,
  admitDecodedCommand,
  Admitted,
  Decoded,
  Malformed,
  Rejected,
} from '../tests/__fixtures__/admit-decoded-command.workflow.js'
import {
  BadKeyCmd,
  BadValueCmd,
  CommandRefused,
  StructCmd,
  TaggedCmd,
  UnstampedCmd,
  UntaggedCmd,
  UntaggedEventList,
} from '../tests/__fixtures__/Command.schema.js'
import {
  Decision,
  DecisionError,
  DecisionOne,
  DecisionTwo,
  LoneDecision,
  SingleEventList,
} from '../tests/__fixtures__/Decision.schema.js'
import { refuseWidenedCommand, WidenedOne, WidenedTwo } from '../tests/__fixtures__/refuse-widened-command.workflow.js'

type Top<A = unknown> = A
type DecisionVariants = DecisionOne | DecisionTwo

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

declare const NarrowSlotBrandTypeId: unique symbol

interface NarrowSlotOne {
  readonly _tag: 'NarrowSlotOne'
  readonly [NarrowSlotBrandTypeId]: typeof NarrowSlotBrandTypeId
}

interface NarrowSlotTwo {
  readonly _tag: 'NarrowSlotTwo'
  readonly [NarrowSlotBrandTypeId]: typeof NarrowSlotBrandTypeId
}

interface WidenedSlotOne {
  readonly _tag: 'WidenedSlotOne'
  readonly [FamilyOne]: symbol
}

interface WidenedSlotTwo {
  readonly _tag: 'WidenedSlotTwo'
  readonly [FamilyOne]: symbol
}

declare const decideOverTagged: (command: TaggedCmd) => Result.Result<DecisionVariants, CommandRefused>
declare const decideOverUntagged: (command: UntaggedCmd) => Result.Result<DecisionVariants, CommandRefused>
declare const decideOverUnstamped: (command: UnstampedCmd) => Result.Result<DecisionVariants, CommandRefused>
declare const decideOverBadKey: (command: BadKeyCmd) => Result.Result<DecisionVariants, CommandRefused>
declare const decideOverBadValue: (command: BadValueCmd) => Result.Result<DecisionVariants, CommandRefused>
declare const decidePromiseOverTagged: (command: TaggedCmd) => Promise<DecisionOne>
declare const decideNeverOverTagged: (command: TaggedCmd) => Result.Result<DecisionVariants, never>
declare const decideLoneOverTagged: (command: TaggedCmd) => Result.Result<LoneDecision, never>
declare const decideLoneWithErrorOverTagged: (command: TaggedCmd) => Result.Result<LoneDecision, DecisionError>
declare const decideBooleanOverTagged: (command: TaggedCmd) => Result.Result<boolean, never>
declare const decideUntaggedVariantOverTagged: (
  command: TaggedCmd,
) => Result.Result<DecisionOne | UntaggedMember, CommandRefused>
declare const decideUnbrandedOverTagged: (
  command: TaggedCmd,
) => Result.Result<UnbrandedOne | UnbrandedTwo, CommandRefused>
declare const decideSplitOverTagged: (command: TaggedCmd) => Result.Result<SplitOne | SplitTwo, CommandRefused>
declare const decideNarrowSlotOverTagged: (
  command: TaggedCmd,
) => Result.Result<NarrowSlotOne | NarrowSlotTwo, CommandRefused>
declare const decideSingleEventOverTagged: (command: TaggedCmd) => Result.Result<ReadonlyArray<DecisionOne>, never>
declare const decideUntaggedEventsOverTagged: (
  command: TaggedCmd,
) => Result.Result<ReadonlyArray<UntaggedMember>, never>
declare const decideUntaggedErrorOverTagged: (
  command: TaggedCmd,
) => Result.Result<DecisionVariants, UntaggedMember>
declare const decideWrongDecisionOverTagged: (
  command: TaggedCmd,
) => Result.Result<Admitted | Rejected, CommandRefused>
declare const decideWrongErrorOverTagged: (command: TaggedCmd) => Result.Result<DecisionVariants, DecisionError>
declare const decideAdmissionOverTagged: (
  command: TaggedCmd,
) => Result.Result<Admitted | Rejected, Malformed>

type AcceptSchemas = typeof acceptTaggedCommand[Workflow.WorkflowSchemasKey]

describe('the workflow the constructor publishes', () => {
  it('Should_BrandTheWorkflow_When_TheCommandDecisionErrorSchemasAreDeclared', () => {
    expect(acceptTaggedCommand).type.toBeCallableWith(new TaggedCmd({ value: 1 }))
    expect(acceptTaggedCommand(new TaggedCmd({ value: 1 }))).type.toBe<
      Result.Result<DecisionOne | DecisionTwo, CommandRefused>
    >()
  })

  it('Should_CarryTheDeclaredSchemas_When_TheWorkflowIsMade', () => {
    expect<AcceptSchemas['command']['Type']>().type.toBe<TaggedCmd>()
    expect<AcceptSchemas['decision']['Type']>().type.toBe<DecisionOne | DecisionTwo>()
    expect<AcceptSchemas['error']['Type']>().type.toBe<CommandRefused>()
  })

  it('Should_RefuseAPromiseDecider_When_TheReturnIsNotAResult', () => {
    expect<typeof Workflow.make>().type.toBeCallableWith({
      command: TaggedCmd,
      decision: Decision,
      error: CommandRefused,
      decide: decideOverTagged,
    })
    expect<typeof Workflow.make>().type.not.toBeCallableWith({
      command: TaggedCmd,
      decision: Decision,
      error: CommandRefused,
      decide: decidePromiseOverTagged,
    })
  })
})

describe('the commands the constructor refuses', () => {
  it('Should_RefuseAMissingInstrumentationMap_When_TheCommandDeclaresNone', () => {
    expect<typeof Workflow.make>().type.toBeCallableWith({
      command: UntaggedCmd,
      decision: Decision,
      error: CommandRefused,
      decide: decideOverUntagged,
    })
    expect<typeof Workflow.make>().type.not.toBeCallableWith({
      command: UnstampedCmd,
      decision: Decision,
      error: CommandRefused,
      decide: decideOverUnstamped,
    })
  })

  it('Should_RefuseAnInstrumentationValue_When_TheKeyIsNotOtel', () => {
    expect<typeof Workflow.make>().type.toBeCallableWith({
      command: TaggedCmd,
      decision: Decision,
      error: CommandRefused,
      decide: decideOverTagged,
    })
    expect<typeof Workflow.make>().type.not.toBeCallableWith({
      command: BadValueCmd,
      decision: Decision,
      error: CommandRefused,
      decide: decideOverBadValue,
    })
  })

  it('Should_DeriveTheSpanAttributes_When_TheMapRemapsTheFields', () => {
    expect<Workflow.SpanAttributes<typeof TaggedCmd>>().type.toBe<{ readonly 'tests.command.value': number }>()
  })

  it('Should_RefuseAnUnknownInstrumentationKey_When_TheMapNamesANonField', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith({
      command: BadKeyCmd,
      decision: Decision,
      error: CommandRefused,
      decide: decideOverBadKey,
    })
  })

  it('Should_RefuseANonClassCommand_When_TheConstraintIsASchema', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith({
      command: StructCmd,
      decision: Decision,
      error: CommandRefused,
      decide: decideOverTagged,
    })
  })
})

describe('the exclusive decision law the constructor enforces', () => {
  it('Should_AcceptASingleVariant_When_TheErrorChannelIsInhabited', () => {
    expect<typeof Workflow.make>().type.toBeCallableWith({
      command: TaggedCmd,
      decision: LoneDecision,
      error: DecisionError,
      decide: decideLoneWithErrorOverTagged,
    })
  })

  it('Should_RefuseASingleVariant_When_TheErrorChannelIsNever', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith({
      command: TaggedCmd,
      decision: LoneDecision,
      error: Schema.Never,
      decide: decideLoneOverTagged,
    })
  })

  it('Should_AcceptTwoVariants_When_TheErrorChannelIsNever', () => {
    expect<typeof Workflow.make>().type.toBeCallableWith({
      command: TaggedCmd,
      decision: Decision,
      error: Schema.Never,
      decide: decideNeverOverTagged,
    })
  })

  it('Should_RefuseABareBooleanDecision_When_TheSchemaIsBoolean', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith({
      command: TaggedCmd,
      decision: Schema.Boolean,
      error: Schema.Never,
      decide: decideBooleanOverTagged,
    })
  })

  it('Should_RefuseAnUntaggedVariant_When_TheUnionCarriesOne', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith({
      command: TaggedCmd,
      decision: Decision,
      error: CommandRefused,
      decide: decideUntaggedVariantOverTagged,
    })
  })

  it('Should_RefuseAnUnbrandedUnion_When_NoSharedTypeIdBindsIt', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith({
      command: TaggedCmd,
      decision: Decision,
      error: CommandRefused,
      decide: decideUnbrandedOverTagged,
    })
  })

  it('Should_RefuseDivergentTypeIds_When_TheVariantsCarrySeparateFamilies', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith({
      command: TaggedCmd,
      decision: Decision,
      error: CommandRefused,
      decide: decideSplitOverTagged,
    })
  })

  it('Should_RefuseTheNarrowSlotBrand_When_TheSlotKeepsTheUniqueSymbol', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith({
      command: TaggedCmd,
      decision: Decision,
      error: CommandRefused,
      decide: decideNarrowSlotOverTagged,
    })
  })
})

describe('the event-list decision law the constructor enforces', () => {
  it('Should_AcceptASingleTaggedEvent_When_TheListCarriesOneVariant', () => {
    expect<typeof Workflow.make>().type.toBeCallableWith({
      command: TaggedCmd,
      decision: SingleEventList,
      error: Schema.Never,
      decide: decideSingleEventOverTagged,
    })
  })

  it('Should_AcceptAnEventList_When_TheElementsShareOneTypeId', () => {
    expect<typeof Workflow.make>().type.toBeCallableWith({
      command: TaggedCmd,
      decision: Schema.Array(Decision),
      error: Schema.Never,
      decide: decideSingleEventOverTagged,
    })
  })

  it('Should_RefuseAnEventList_When_TheElementsCarryNoTag', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith({
      command: TaggedCmd,
      decision: UntaggedEventList,
      error: Schema.Never,
      decide: decideUntaggedEventsOverTagged,
    })
  })

  it('Should_RefuseAnEventList_When_TheElementsCarryDivergentTypeIds', () => {
    expect<Workflow.Inhabited<ReadonlyArray<SplitOne | SplitTwo>, never>>().type.toBe<
      Workflow.UnsharedTypeId
    >()
  })
})

describe('the channels the declared schemas pin', () => {
  it('Should_RefuseADecider_When_ItsDecisionDisagreesWithTheSchema', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith({
      command: TaggedCmd,
      decision: Decision,
      error: CommandRefused,
      decide: decideWrongDecisionOverTagged,
    })
  })

  it('Should_RefuseADecider_When_ItsErrorDisagreesWithTheSchema', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith({
      command: TaggedCmd,
      decision: Decision,
      error: CommandRefused,
      decide: decideWrongErrorOverTagged,
    })
  })

  it('Should_RefuseAnUntaggedError_When_TheSchemaHasNoTag', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith({
      command: TaggedCmd,
      decision: Decision,
      error: StructCmd,
      decide: decideUntaggedErrorOverTagged,
    })
  })

  it('Should_AcceptTheAdmissionPair_When_BothSchemasMatchTheDecider', () => {
    expect<typeof Workflow.make>().type.toBeCallableWith({
      command: TaggedCmd,
      decision: AdmissionDecision,
      error: Malformed,
      decide: decideAdmissionOverTagged,
    })
  })
})

describe('the command channel the widened decider keeps', () => {
  it('Should_KeepTheClassCommand_When_TheDeciderWidensItsParameter', () => {
    expect(refuseWidenedCommand).type.toBeCallableWith(new TaggedCmd({ value: 1 }))
    expect(refuseWidenedCommand).type.not.toBeCallableWith(new UntaggedCmd({ value: 1 }))
  })

  it('Should_PublishTheWidenedDecision_When_TheCommandChannelStaysTheClass', () => {
    expect(refuseWidenedCommand(new TaggedCmd({ value: 1 }))).type.toBe<
      Result.Result<WidenedOne | WidenedTwo, CommandRefused>
    >()
  })
})

describe('the decision-shape markers as measured', () => {
  it('Should_RefuseTheMarker_When_TheUnionSharesNoProperty', () => {
    expect<Workflow.Inhabited<UnbrandedOne | UnbrandedTwo, CommandRefused>>().type.toBe<
      Workflow.UnsharedTypeId
    >()
  })

  it('Should_RefuseTheMarker_When_TwoFamiliesCarryDivergentTypeIds', () => {
    expect<Workflow.Inhabited<SplitOne | SplitTwo, CommandRefused>>().type.toBe<Workflow.UnsharedTypeId>()
  })

  it('Should_RefuseTheMarker_When_AnInterfaceCarriesTheNarrowSlotBrand', () => {
    expect<Workflow.Inhabited<NarrowSlotOne | NarrowSlotTwo, CommandRefused>>().type.toBe<
      Workflow.UnsharedTypeId
    >()
  })

  it('Should_AcceptTheMarker_When_TheClassFamilyCarriesTheWidenedSlot', () => {
    expect<Workflow.Inhabited<WidenedSlotOne | WidenedSlotTwo, CommandRefused>>().type.toBe<Top>()
  })

  it('Should_AcceptTheMarker_When_TheGenuineTaggedClassFamilyCarriesTheFieldInitializerBrand', () => {
    expect<Workflow.Inhabited<DecisionVariants, CommandRefused>>().type.toBe<Top>()
  })

  it('Should_RefuseTheMarker_When_TheDecisionCarriesAnUntaggedVariant', () => {
    expect<Workflow.Inhabited<DecisionOne | UntaggedMember, CommandRefused>>().type.toBe<
      Workflow.UntaggedDecision & Workflow.UnsharedTypeId
    >()
  })

  it('Should_RefuseTheMarker_When_TheDecisionIsABareBoolean', () => {
    expect<Workflow.Inhabited<boolean, never>>().type.toBe<Workflow.UntaggedDecision>()
  })

  it('Should_RefuseTheMarker_When_TheSingleVariantDecidesAlone', () => {
    expect<Workflow.Inhabited<LoneDecision, never>>().type.toBe<Workflow.SingleVariantDecision>()
  })

  it('Should_AcceptTheMarker_When_TheSingleVariantFailsWithATaggedError', () => {
    expect<Workflow.Inhabited<LoneDecision, DecisionError>>().type.toBe<Top>()
  })

  it('Should_AcceptTheMarker_When_TheEventListCarriesOneTaggedVariant', () => {
    expect<Workflow.Inhabited<ReadonlyArray<DecisionOne>, never>>().type.toBe<Top>()
  })

  it('Should_RefuseTheMarker_When_TheEventListCarriesAnUntaggedElement', () => {
    expect<Workflow.Inhabited<ReadonlyArray<UntaggedMember>, never>>().type.toBe<
      Workflow.UntaggedDecision & Workflow.UnsharedTypeId
    >()
  })

  it('Should_RefuseTheMarker_When_TheEventListCarriesDivergentTypeIds', () => {
    expect<Workflow.Inhabited<ReadonlyArray<SplitOne | SplitTwo>, never>>().type.toBe<
      Workflow.UnsharedTypeId
    >()
  })

  it('Should_RefuseTheMarker_When_TheErrorChannelCarriesNoTag', () => {
    expect<Workflow.Inhabited<DecisionVariants, UntaggedMember>>().type.toBe<Workflow.UntaggedError>()
  })

  it('Should_RefuseTheMarker_When_TheDecisionChannelIsNever', () => {
    expect<Workflow.Inhabited<never, CommandRefused>>().type.toBe<Workflow.UninhabitedDecision>()
  })
})

describe('the decoded-command workflow the fixtures publish', () => {
  it('Should_BrandTheAdmissionWorkflow_When_TheDecisionAndErrorSchemasAreDeclared', () => {
    expect(admitDecodedCommand).type.toBeCallableWith(new Decoded({ length: 4 }))
    expect(admitDecodedCommand).type.not.toBeCallableWith(new TaggedCmd({ value: 0 }))
  })
})
