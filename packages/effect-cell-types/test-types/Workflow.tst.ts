import type { Workflow } from '@systemfsoftware/effect-cell-types'
import type { Either } from 'effect/Either'
import { describe, expect, it } from 'tstyche'

// The fixtures are deliberately plain interfaces with a literal `_tag`, and the
// discrimination claim below compares `_tag` directly. That authoring trips
// `@systemfsoftware/effect-dmmf(no-manual-tag-member)` and
// `@systemfsoftware(no-direct-tag-access)` — a known rule-scope defect fixed in a
// later unit, not a signal to reach for S.TaggedStruct (this file must contain no
// runtime values).
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

declare const cmd: Cmd
declare const decision: Dec | Alt
declare const decideInhabited: (command: Cmd) => Either<Dec, Err>
declare const decidePromise: (command: Cmd) => Promise<Dec>
declare const decideValue: (command: Cmd) => Dec
declare const totallyDecided: Workflow.Workflow<Cmd, boolean, never>

describe('the four contractual claims', () => {
  it('Should_BeExactDeciderFunction_When_BothChannelsInhabited', () => {
    expect<Workflow.Workflow<Cmd, Dec, Err>>().type.toBe<(command: Cmd) => Either<Dec, Err>>()
  })

  it('Should_SurviveDecisionUnionDistribution_When_DecisionChannelIsAUnion', () => {
    expect<Workflow.Workflow<Cmd, Dec | Alt, Err>>().type.toBe<(command: Cmd) => Either<Dec | Alt, Err>>()
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

  it('Should_RejectPromiseReturningDecider_When_ParameterRequiresEitherReturn', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(decidePromise)
  })

  it('Should_RejectBareValueDecider_When_ParameterRequiresEitherReturn', () => {
    expect<typeof Workflow.make>().type.not.toBeCallableWith(decideValue)
  })
})
