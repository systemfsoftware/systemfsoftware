import { Cell, type Workflow } from '@systemfsoftware/effect-cell-types'
import type { Result } from 'effect/Result'
import { describe, expect, it } from 'tstyche'

import { CommandRefused, StructCmd, TaggedCmd, UntaggedCmd } from '../tests/__fixtures__/Command.schema.js'
import { decideTagged } from '../tests/__fixtures__/TaggedCommand.workflow.js'
import { decideWidened } from '../tests/__fixtures__/WidenedCommand.workflow.js'

// The fixtures declare their `_tag` directly. `no-manual-tag-member` exempts
// `*.tst.ts`, because every replacement it names is a runtime value and this
// file must contain none — inheriting from a carrier would have meant a const
// existing only to be read back by `typeof`. The discrimination claim below
// compares `_tag` directly, which `no-direct-tag-access` permits here for the
// same reason: the comparison is the assertion under test rather than a
// dispatch a consumer routes on.
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

/**
 * The three shapes a bare key-presence test admits and a dispatchable-tag test refuses. Each is
 * spelled through `Record` rather than a `_tag` property signature, so these fixtures pin the
 * bound without writing the member `no-manual-tag-member` forbids — the evasion shape earns its
 * keep as the fixture for the bound it evades.
 */
type NumericTagError = Record<'_tag', number>
type OptionalTagError = Partial<Record<'_tag', string>>
type CallableTagError = Record<'_tag', () => void>

declare const cmd: Cmd
declare const decision: Dec | Alt
declare const decideInhabited: (command: Cmd) => Result<Dec, Err>
declare const decidePromiseOverTagged: (command: TaggedCmd) => Promise<Dec>
declare const decideValueOverTagged: (command: TaggedCmd) => Dec
declare const totallyDecided: Workflow.Workflow<Cmd, boolean, never>
declare const madeDecide: Workflow.Workflow<Cmd, Dec, Err>

// The command channel is keyed on the command VALUE, so these fixtures are the
// arguments `make` receives. The negatives are `declare`d rather than written:
// a plain class, an object literal and a primitive need no runtime value to be
// refused, and this file declares none.
declare const decideOverTagged: (command: TaggedCmd) => Result<Dec, Err>
declare const decideOverUntagged: (command: UntaggedCmd) => Result<Dec, Err>
declare const decideOverUnrelated: (command: { readonly nope: boolean }) => Result<Dec, Err>
declare const PlainCmdCtor: new(value: number) => { readonly value: number }
declare const objectLiteralCmd: { readonly value: number }
declare const primitiveCmd: number

/**
 * A bag whose decide phase is the exact shape of `decideInhabited`, so the brand is the
 * only thing `Cell.decide` can be objecting to. `Err` carries a `_tag`, so the channel
 * check that would otherwise refuse an untagged error is out of the picture.
 */
interface Shape extends Cell.Phases {
  readonly decoded: Cmd
  readonly decision: Dec
  readonly decisionError: Err
}

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
    // Direct `_tag` comparison on the fixture union.
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
    // Paired with a real command so the refusal is about the decider's return type,
    // not about arity — a one-argument call would now fail for the wrong reason and
    // the assertion would stop testing what it names.
    expect<typeof Workflow.make>().type.not.toBeCallableWith(TaggedCmd, decidePromiseOverTagged)
  })

  it('Should_RejectBareValueDecider_When_ParameterRequiresResultReturn', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(TaggedCmd, decideValueOverTagged)
  })

  it('Should_RejectDeciderWithNoCommand_When_TheCommandArgumentIsMissing', () => {
    // The arity claim, stated once and on purpose: the command is not optional, so a
    // bare decider is not a workflow constructor call.
    expect<typeof Workflow.make>().type.not.toBeCallableWith(decideOverTagged)
  })

  it('Should_CollapseToUnknown_When_BothChannelsInhabitedAndErrorTagged', () => {
    expect<Workflow.Inhabited<Dec, Err>>().type.toBe<unknown>()
  })

  it('Should_DemandUninhabitedErrorMarker_When_ErrorChannelIsNever', () => {
    expect<Workflow.Inhabited<Dec, never>>().type.toBe<Workflow.UninhabitedError>()
  })

  it('Should_DemandUninhabitedDecisionMarker_When_DecisionChannelIsNever', () => {
    expect<Workflow.Inhabited<never, Err>>().type.toBe<Workflow.UninhabitedDecision>()
  })

  it('Should_DemandUntaggedErrorMarker_When_ErrorChannelCarriesNoTag', () => {
    expect<Workflow.Inhabited<Dec, Error>>().type.toBe<Workflow.UntaggedError>()
  })

  it('Should_DemandUntaggedErrorMarker_When_TagIsNotAString', () => {
    expect<Workflow.Inhabited<Dec, NumericTagError>>().type.toBe<Workflow.UntaggedError>()
  })

  it('Should_DemandUntaggedErrorMarker_When_TagIsOptional', () => {
    expect<Workflow.Inhabited<Dec, OptionalTagError>>().type.toBe<Workflow.UntaggedError>()
  })

  it('Should_DemandUntaggedErrorMarker_When_TagHoldsACallable', () => {
    expect<Workflow.Inhabited<Dec, CallableTagError>>().type.toBe<Workflow.UntaggedError>()
  })
})

describe('the brand Cell.decide demands', () => {
  it('Should_RefuseBareDecider_When_DecidePhaseIsDemanded', () => {
    // A bare decider carries no brand, so the diagnostic names the conjunct it lacks —
    // Workflow.make is the only door.
    // @ts-expect-error: is not assignable to type 'WorkflowBrand'
    Cell.decide<Shape>(decideInhabited)
  })

  it('Should_AcceptMakeValue_When_DecidePhaseIsDemanded', () => {
    expect<Cell.DecidePhase<Shape>>().type.toBe<((decoded: Cmd) => Result<Dec, Err>) & Workflow.WorkflowBrand>()
    expect<Cell.DecidePhase<Shape>>().type.toBeCallableWith(cmd)
    expect<typeof Cell.decide<Shape>>().type.toBeCallableWith(madeDecide)
  })
})

describe('the command channel the value constrains', () => {
  it('Should_RefuseInterfaceAtTheCommandPosition_When_TheCommandIsAPlainInterface', () => {
    // The load-bearing claim, and the reason enforcement moved to the value: a
    // declared type produces no value, so an interface cannot reach an argument
    // position at all. Stated here as the type-level truth behind that — no
    // interface is assignable to the command parameter, so there is nothing to
    // smuggle a marker into.
    expect<Cmd>().type.not.toBeAssignableTo<Parameters<typeof Workflow.make>[0]>()
    expect<Shape>().type.not.toBeAssignableTo<Parameters<typeof Workflow.make>[0]>()
  })

  it('Should_AcceptTaggedClassCommand_When_PassedAtTheCommandPosition', () => {
    expect<typeof Workflow.make>().type.toBeCallableWith(TaggedCmd, decideOverTagged)
  })

  it('Should_AcceptUntaggedClassCommand_When_PassedAtTheCommandPosition', () => {
    expect<typeof Workflow.make>().type.toBeCallableWith(UntaggedCmd, decideOverUntagged)
  })

  it('Should_ExposeEveryCommandFieldAndTag_When_CommandIsATaggedClass', () => {
    expect<typeof decideTagged>().type.toBe<
      ((command: TaggedCmd) => Result<number, CommandRefused>) & Workflow.WorkflowBrand
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
    // Contravariance is ordinary and allowed: widening the decider's own parameter
    // does not degrade the published command channel, which stays the class. This
    // is asserted on the resulting type, not merely accepted, because a channel
    // that silently became `unknown` would reopen the hole the unit closes.
    expect<typeof decideWidened>().type.toBe<
      ((command: TaggedCmd) => Result<number, CommandRefused>) & Workflow.WorkflowBrand
    >()
  })
})
