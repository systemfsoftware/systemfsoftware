import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { Route } from '../engine/route.schema.js'
import { NodeRef } from '../engine/semantic-node.schema.js'
import { ModelAnswer, ToolCall } from '../model/model.schema.js'
import { recordedProposalOf } from './cause.schema.js'
import { type EvidenceRef } from './check.schema.js'
import { FailureRecord } from './failure.schema.js'

const RefCauseCitation = Schema.Struct({ ref: Schema.String }).annotate({
  description: 'Cite a visible node by the [ref] id shown on the screen.',
})

const LogCauseCitation = Schema.Struct({ log: Schema.Int }).annotate({
  description: 'Cite an engine log line by its index, counting from 0.',
})

const RouteCauseCitation = Schema.Struct({ route: Schema.Literal(true) }).annotate({
  description: 'Cite the route the app was on when the step failed.',
})

export const CauseCitation = Schema.Union([RefCauseCitation, LogCauseCitation, RouteCauseCitation])
export type CauseCitation = typeof CauseCitation.Type

export const ProposeCauseArguments = Schema.Struct({
  cause: Schema.Literals(['product', 'automation', 'environment']).annotate({
    description: 'What caused the failure: the app itself (product), the test automation, or the environment.',
  }),
  evidence: Schema.Array(CauseCitation).annotate({
    description: 'The refs, log line indices, or route that support the cause, cited from what you can see.',
  }),
  reason: Schema.String.annotate({
    description: 'One sentence naming what the cited evidence shows.',
  }),
})
export type ProposeCauseArguments = typeof ProposeCauseArguments.Type

export const ProposeCauseToolName = Schema.Literal('propose_cause')
export type ProposeCauseToolName = typeof ProposeCauseToolName.Type

const ProposeCauseTool = Schema.Struct({
  name: ProposeCauseToolName,
  arguments: ProposeCauseArguments,
}).annotate({
  description: 'Propose the cause of the failure and cite the evidence for it.',
})

const CauseProposalDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/CauseProposalDecision')
type CauseProposalDecisionTypeId = typeof CauseProposalDecisionTypeId

export class CauseClassified extends Schema.TaggedClass<CauseClassified>()('CauseClassified', {
  failure: FailureRecord,
}) {
  readonly [CauseProposalDecisionTypeId] = CauseProposalDecisionTypeId
}

export class CauseUnchanged extends Schema.TaggedClass<CauseUnchanged>()('CauseUnchanged', {
  failure: FailureRecord,
}) {
  readonly [CauseProposalDecisionTypeId] = CauseProposalDecisionTypeId
}

export const CauseProposalDecision = Schema.Union([CauseClassified, CauseUnchanged])
export type CauseProposalDecision = typeof CauseProposalDecision.Type

export class AdmitCauseProposal extends Schema.TaggedClass<AdmitCauseProposal>()('AdmitCauseProposal', {
  failure: FailureRecord,
  answer: ModelAnswer,
  refs: Schema.Array(NodeRef),
  logs: Schema.Array(Schema.String),
  route: Route,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const withoutProposedOf = (failure: FailureRecord): FailureRecord => ({
  code: failure.code,
  cause: failure.cause,
  evidence: failure.evidence,
})

const evidenceRefOf = (command: AdmitCauseProposal) => (citation: CauseCitation): Option.Option<EvidenceRef> =>
  Match.value(citation).pipe(
    Match.when({ ref: Predicate.isString }, (hit): Option.Option<EvidenceRef> =>
      Option.map(
        Arr.findFirst(command.refs, (ref) => ref.id === hit.ref),
        (found): EvidenceRef => ({ _tag: 'NodeEvidence', ref: found }),
      )),
    Match.when(
      { log: Predicate.isNumber },
      (hit): Option.Option<EvidenceRef> =>
        Option.map(Arr.get(command.logs, hit.log), (text): EvidenceRef => ({ _tag: 'LogEvidence', text })),
    ),
    Match.orElse((): Option.Option<EvidenceRef> => Option.some({ _tag: 'RouteEvidence', route: command.route })),
  )

const evidenceRefsOf = (
  command: AdmitCauseProposal,
  citations: ReadonlyArray<CauseCitation>,
): ReadonlyArray<EvidenceRef> => Arr.flatMap(citations, (citation) => Option.toArray(evidenceRefOf(command)(citation)))

const unchangedOf = (command: AdmitCauseProposal): CauseProposalDecision =>
  new CauseUnchanged({ failure: withoutProposedOf(command.failure) })

const classifiedOf = (command: AdmitCauseProposal, proposal: ProposeCauseArguments): CauseProposalDecision =>
  new CauseClassified({
    failure: {
      code: command.failure.code,
      cause: command.failure.cause,
      evidence: command.failure.evidence,
      ...recordedProposalOf({ cause: proposal.cause, evidence: evidenceRefsOf(command, proposal.evidence) }),
    },
  })

const callDecisionOf = (command: AdmitCauseProposal, call: ToolCall): CauseProposalDecision =>
  Result.match(Schema.decodeUnknownResult(ProposeCauseTool)({ name: call.name, arguments: call.arguments }), {
    onFailure: () => unchangedOf(command),
    onSuccess: (tool) => classifiedOf(command, tool.arguments),
  })

const decide = (command: AdmitCauseProposal): Result.Result<CauseProposalDecision, never> =>
  Result.succeed(
    Match.valueTags(command.answer, {
      Text: () => unchangedOf(command),
      ToolCalls: ({ calls }) => callDecisionOf(command, Arr.headNonEmpty(calls)),
    }),
  )

export const admitCauseProposal = Workflow.make({
  command: AdmitCauseProposal,
  decision: CauseProposalDecision,
  error: Schema.Never,
  decide,
})
