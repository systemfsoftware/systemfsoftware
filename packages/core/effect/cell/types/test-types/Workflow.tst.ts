import { Cell, type Workflow } from '@systemfsoftware/effect-cell-types'
import type { Result } from 'effect/Result'
import { describe, expect, it } from 'tstyche'

import type { AltTag, CmdTag, DecTag, ErrTag } from './tags.js'

// The fixtures inherit their tags from `./tags.js` instead of declaring a `_tag`
// member: this file must contain no runtime values, and a type-only import emits
// none. The discrimination claim below compares `_tag` directly, which
// `no-direct-tag-access` permits here: it exempts `*.tst.ts`, where the comparison
// is the assertion under test rather than a dispatch a consumer routes on.
type Cmd = CmdTag

interface Dec extends DecTag {
  readonly succeeded: boolean
}

interface Alt extends AltTag {
  readonly reason: string
}

interface Err extends ErrTag {
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
declare const decidePromise: (command: Cmd) => Promise<Dec>
declare const decideValue: (command: Cmd) => Dec
declare const totallyDecided: Workflow.Workflow<Cmd, boolean, never>
declare const madeDecide: Workflow.Workflow<Cmd, Dec, Err>

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
  it('Should_AcceptInhabitedDecider_When_BothChannelsInhabited', () => {
    expect<typeof Workflow.make>().type.toBeCallableWith(decideInhabited)
  })

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
    expect<typeof Workflow.make>().type.not.toBeCallableWith(decidePromise)
  })

  it('Should_RejectBareValueDecider_When_ParameterRequiresResultReturn', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(decideValue)
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
