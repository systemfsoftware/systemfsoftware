import { type Workflow } from '@systemfsoftware/effect-cell-types'
import type { Result } from 'effect/Result'
import { describe, expect, it } from 'tstyche'

import {
  acceptTaggedCommand as decideTagged,
  type FixtureDecision,
} from '../tests/__fixtures__/accept-tagged-command.workflow.js'
import { CommandRefused, StructCmd, TaggedCmd, UntaggedCmd } from '../tests/__fixtures__/Command.schema.js'
import {
  Decision,
  DecisionError,
  DecisionOne,
  DecisionTwo,
  LoneDecision,
} from '../tests/__fixtures__/Decision.schema.js'
import {
  refuseWidenedCommand as decideWidened,
  type WidenedDecision as WidenedFixtureDecision,
} from '../tests/__fixtures__/refuse-widened-command.workflow.js'

interface Cmd {
  readonly _tag: 'Cmd'
}

interface Dec {
  readonly _tag: 'Dec'
  readonly succeeded: boolean
}

interface Alt {
  readonly _tag: 'Alt'
  readonly reason: string
}

interface Err {
  readonly _tag: 'Err'
  readonly code: number
}

interface UntaggedMember {
  readonly value: number
}

interface NumericTagMember {
  readonly _tag: number
}

declare const decideLone: (command: TaggedCmd) => Result<LoneDecision, CommandRefused>

type NumericTagError = Record<'_tag', number>
type OptionalTagError = Partial<Record<'_tag', string>>
type CallableTagError = Record<'_tag', () => void>

declare const cmd: Cmd
declare const decision: Dec | Alt
declare const decidePromiseOverTagged: (command: TaggedCmd) => Promise<Dec>
declare const decideValueOverTagged: (command: TaggedCmd) => Dec
declare const totallyDecided: Workflow.Workflow<Cmd, boolean, never>

declare const decideOverTagged: (command: TaggedCmd) => Result<Decision, DecisionError>
declare const decideOverUntagged: (command: UntaggedCmd) => Result<Decision, DecisionError>
declare const decideOverUnrelated: (command: { readonly nope: boolean }) => Result<Dec, Err>
declare const PlainCmdCtor: new(value: number) => { readonly value: number }
declare const objectLiteralCmd: { readonly value: number }
declare const primitiveCmd: number

describe('the four contractual claims', () => {
  it('Should_BeExactDeciderFunction_When_BothChannelsInhabited', () => {
    expect<Workflow.Workflow<Cmd, Dec, Err>>().type.toBe<
      ((command: Cmd) => Result<Dec, Err>) & Workflow.WorkflowBrand
    >()
  })

  it('Should_SurviveDecisionUnionDistribution_When_DecisionChannelIsAUnion', () => {
    expect<Workflow.Workflow<Cmd, Dec | Alt, Err>>().type.toBe<
      ((command: Cmd) => Result<Dec | Alt, Err>) & Workflow.WorkflowBrand
    >()
  })

  it('Should_DiscriminateUnionMembersByTag_When_NarrowingTheDecision', () => {
    if (decision._tag === 'Dec') {
      expect(decision).type.toBe<Dec>()
    } else {
      expect(decision).type.toBe<Alt>()
    }
  })

  it('Should_ResolveToUninhabitedDecision_When_DecisionChannelIsNever', () => {
    expect<Workflow.Workflow<Cmd, never, Err>>().type.toBe<Workflow.UninhabitedDecision>()
  })

  it('Should_ResolveToUninhabitedError_When_ErrorChannelIsNever', () => {
    expect<Workflow.Workflow<Cmd, Dec, never>>().type.toBe<Workflow.UninhabitedError>()
  })
})

describe('the constructor compiled evidence', () => {
  it('Should_ResolveTotalDecisionToUninhabitedError_When_ErrorChannelIsNever', () => {
    expect<Workflow.Workflow<Cmd, boolean, never>>().type.toBe<Workflow.UninhabitedError>()
    expect<Workflow.Workflow<Cmd, boolean, never>>().type.not.toBeAssignableTo<(...args: never[]) => unknown>()

    // @ts-expect-error: This expression is not callable
    totallyDecided(cmd)
  })

  it('Should_BeCallable_When_BothChannelsInhabited', () => {
    expect<Workflow.Workflow<Cmd, boolean, Error>>().type.toBeCallableWith(cmd)
  })

  it('Should_RejectPromiseReturningDecider_When_ParameterRequiresResultReturn', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(TaggedCmd, decidePromiseOverTagged)
  })

  it('Should_RejectBareValueDecider_When_ParameterRequiresResultReturn', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(TaggedCmd, decideValueOverTagged)
  })

  it('Should_RejectDeciderWithNoCommand_When_TheCommandArgumentIsMissing', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(decideOverTagged)
  })

  it('Should_CollapseToUnknown_When_ChannelsInhabitedAndShaped', () => {
    expect<Workflow.Inhabited<Decision, DecisionError>>().type.toBe<unknown>()
  })

  it('Should_DemandUninhabitedErrorMarker_When_ErrorChannelIsNever', () => {
    expect<Workflow.Inhabited<Dec, never>>().type.toBe<Workflow.UninhabitedError>()
  })

  it('Should_DemandUninhabitedDecisionMarker_When_DecisionChannelIsNever', () => {
    expect<Workflow.Inhabited<never, Err>>().type.toBe<Workflow.UninhabitedDecision>()
  })

  it('Should_DemandUntaggedErrorMarker_When_ErrorChannelCarriesNoTag', () => {
    expect<Workflow.Inhabited<Decision, Error>>().type.toBe<Workflow.UntaggedError>()
  })

  it('Should_DemandUntaggedErrorMarker_When_TagIsNotAString', () => {
    expect<Workflow.Inhabited<Decision, NumericTagError>>().type.toBe<Workflow.UntaggedError>()
  })

  it('Should_DemandUntaggedErrorMarker_When_TagIsOptional', () => {
    expect<Workflow.Inhabited<Decision, OptionalTagError>>().type.toBe<Workflow.UntaggedError>()
  })

  it('Should_DemandUntaggedErrorMarker_When_TagHoldsACallable', () => {
    expect<Workflow.Inhabited<Decision, CallableTagError>>().type.toBe<Workflow.UntaggedError>()
  })
})

describe('the success channel the union constrains', () => {
  it('Should_AcceptTwoBrandedTaggedClasses_When_TheDecisionIsAUnion', () => {
    expect<Workflow.Inhabited<Decision, DecisionError>>().type.toBe<unknown>()
    expect<Workflow.Inhabited<DecisionOne | DecisionTwo, DecisionError>>().type.toBe<unknown>()
  })

  it('Should_RefuseOneVariant_When_TheDecisionIsASingleClass', () => {
    expect<Workflow.Inhabited<LoneDecision, DecisionError>>().type.toBe<Workflow.SingleVariantDecision>()
    expect<typeof Workflow.make>().type.not.toBeCallableWith(TaggedCmd, decideLone)
  })

  it('Should_RefuseAnUntaggedMember_When_TheUnionCarriesNoTagToDispatch', () => {
    expect<Workflow.Inhabited<DecisionOne | UntaggedMember, Err>>().type.toBe<Workflow.UntaggedDecision>()
  })

  it('Should_RefuseANonStringTag_When_TheMemberCannotBeDispatchedOn', () => {
    expect<Workflow.Inhabited<DecisionOne | NumericTagMember, Err>>().type.toBe<Workflow.UntaggedDecision>()
  })

  it('Should_KeepPrecedence_When_TheNeverLegsFire', () => {
    expect<Workflow.Inhabited<never, Err>>().type.toBe<Workflow.UninhabitedDecision>()
    expect<Workflow.Inhabited<Dec | Alt, never>>().type.toBe<Workflow.UninhabitedError>()
  })

  it('Should_ReAnchorTheCollapseClaim_When_TheUnionWearsTheFamilyBrand', () => {
    expect<Workflow.Workflow<Cmd, Decision, DecisionError>>().type.toBe<
      ((command: Cmd) => Result<Decision, DecisionError>) & Workflow.WorkflowBrand
    >()
  })
})

describe('the command channel the value constrains', () => {
  it('Should_RefuseInterfaceAtTheCommandPosition_When_TheCommandIsAPlainInterface', () => {
    expect<Cmd>().type.not.toBeAssignableTo<Parameters<typeof Workflow.make>[0]>()
    expect<Result<never, never>>().type.not.toBeAssignableTo<Parameters<typeof Workflow.make>[0]>()
  })

  it('Should_AcceptTaggedClassCommand_When_PassedAtTheCommandPosition', () => {
    expect<typeof Workflow.make>().type.toBeCallableWith(TaggedCmd, decideOverTagged)
  })

  it('Should_AcceptUntaggedClassCommand_When_PassedAtTheCommandPosition', () => {
    expect<typeof Workflow.make>().type.toBeCallableWith(UntaggedCmd, decideOverUntagged)
  })

  it('Should_ExposeEveryCommandFieldAndTag_When_CommandIsATaggedClass', () => {
    expect<typeof decideTagged>().type.toBe<
      ((command: TaggedCmd) => Result<FixtureDecision, CommandRefused>) & Workflow.WorkflowBrand
    >()
    expect<TaggedCmd['value']>().type.toBe<number>()
    expect<TaggedCmd['_tag']>().type.toBe<'TaggedCmd'>()
  })

  it('Should_RefuseStructCommand_When_PassedAtTheCommandPosition', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(StructCmd, decideOverTagged)
  })

  it('Should_RefusePlainClassCommand_When_ItCarriesNoSchemaSurface', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(PlainCmdCtor, decideOverTagged)
  })

  it('Should_RefuseObjectLiteralCommand_When_PassedAtTheCommandPosition', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(objectLiteralCmd, decideOverTagged)
  })

  it('Should_RefusePrimitiveCommand_When_PassedAtTheCommandPosition', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(primitiveCmd, decideOverTagged)
  })

  it('Should_RefuseUnrelatedDeciderParameter_When_ItDoesNotMatchTheCommand', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(TaggedCmd, decideOverUnrelated)
  })

  it('Should_KeepTheClassAsTheCommandChannel_When_TheDeciderWidensToUnknown', () => {
    expect<typeof decideWidened>().type.toBe<
      ((command: TaggedCmd) => Result<WidenedFixtureDecision, CommandRefused>) & Workflow.WorkflowBrand
    >()
  })
})
