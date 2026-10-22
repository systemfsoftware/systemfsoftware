import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'

const GateDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/GateDecision')
type GateDecisionTypeId = typeof GateDecisionTypeId

export class DeclaredSkip extends Schema.TaggedClass<DeclaredSkip>()('DeclaredSkip', {
  reason: Schema.String,
}) {}

export class AgentWithoutKey extends Schema.TaggedClass<AgentWithoutKey>()('AgentWithoutKey', {
  apiKeyEnv: Schema.String,
}) {}

export class NoGatewayConfigured extends Schema.TaggedClass<NoGatewayConfigured>()('NoGatewayConfigured', {}) {}

export class PlatformMismatch extends Schema.TaggedClass<PlatformMismatch>()('PlatformMismatch', {
  platforms: Schema.Array(Schema.String),
  target: Schema.String,
}) {}

export const TestGate = Schema.Union([DeclaredSkip, AgentWithoutKey, NoGatewayConfigured, PlatformMismatch])
export type TestGate = typeof TestGate.Type

export class TestReady extends Schema.TaggedClass<TestReady>()('TestReady', {}) {
  readonly [GateDecisionTypeId] = GateDecisionTypeId
}
export class TestSkipped extends Schema.TaggedClass<TestSkipped>()('TestSkipped', {
  reason: Schema.String,
}) {
  readonly [GateDecisionTypeId] = GateDecisionTypeId
}

export const GateDecision = Schema.Union([TestReady, TestSkipped])
export type GateDecision = typeof GateDecision.Type

export class GateTest extends Schema.TaggedClass<GateTest>()('GateTest', {
  gates: Schema.Array(TestGate),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const reasonOf = (gate: TestGate): string =>
  Match.value(gate).pipe(
    Match.tag('DeclaredSkip', (skip) => skip.reason),
    Match.tag('AgentWithoutKey', (gate) => `${gate.apiKeyEnv} is not set`),
    Match.tag('NoGatewayConfigured', () => 'no model gateway is configured'),
    Match.tag(
      'PlatformMismatch',
      (gate) => `platform ${gate.platforms.join(' or ')} is not targeted (target platform ${gate.target})`,
    ),
    Match.exhaustive,
  )

const decide = (command: GateTest): Result.Result<GateDecision, never> =>
  Result.succeed(
    Option.match(Arr.head(command.gates), {
      onSome: (gate) => new TestSkipped({ reason: reasonOf(gate) }),
      onNone: () => new TestReady(),
    }),
  )

export const gateTest = Workflow.make({
  command: GateTest,
  decision: GateDecision,
  error: Schema.Never,
  decide,
})
