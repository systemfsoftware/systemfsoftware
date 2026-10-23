import { it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { type Route } from '../../engine/route.schema.js'
import { NodeRef } from '../../engine/semantic-node.schema.js'
import { type ModelAnswer, type ToolCall } from '../../model/model.schema.js'
import {
  AdmitCauseProposal,
  admitCauseProposal,
  type CauseCitation,
  type CauseProposalDecision,
  ProposeCauseArguments,
  ProposeCauseToolName,
} from '../admit-cause-proposal.workflow.js'
import { ProposedCause } from '../cause.schema.js'
import { type FailureRecord } from '../failure.schema.js'

type Admit = typeof admitCauseProposal

const decisionOf = (admit: Admit, command: AdmitCauseProposal): CauseProposalDecision =>
  Result.match(admit(command), { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const failureOf = (decision: CauseProposalDecision): FailureRecord =>
  Match.valueTags(decision, {
    CauseClassified: ({ failure }) => failure,
    CauseUnchanged: ({ failure }) => failure,
  })

const proposedOf = (decision: CauseProposalDecision): ProposedCause | undefined => failureOf(decision).proposed

const isClassified = (decision: CauseProposalDecision): boolean =>
  Match.valueTags(decision, { CauseClassified: () => true, CauseUnchanged: () => false })

const isUnchanged = (decision: CauseProposalDecision): boolean =>
  Match.valueTags(decision, { CauseClassified: () => false, CauseUnchanged: () => true })

const rebuiltOf = (
  command: AdmitCauseProposal,
  patch: {
    readonly failure?: FailureRecord
    readonly answer?: ModelAnswer
    readonly refs?: ReadonlyArray<NodeRef>
    readonly logs?: ReadonlyArray<string>
    readonly route?: Route
  },
): AdmitCauseProposal =>
  new AdmitCauseProposal({
    failure: patch.failure ?? command.failure,
    answer: patch.answer ?? command.answer,
    refs: patch.refs ?? command.refs,
    logs: patch.logs ?? command.logs,
    route: patch.route ?? command.route,
  })

const proposeCallOf = (
  arguments_: ProposeCauseArguments,
  evidence: ReadonlyArray<CauseCitation>,
): ToolCall => ({
  id: 'call-cause',
  name: ProposeCauseToolName.literal,
  arguments: { cause: arguments_.cause, evidence: [...evidence], reason: arguments_.reason },
})

const toolCallsAnswerOf = (arguments_: ProposeCauseArguments, evidence: ReadonlyArray<CauseCitation>): ModelAnswer => ({
  _tag: 'ToolCalls',
  calls: [proposeCallOf(arguments_, evidence)],
})

const parametersDocumentIsObject = (): boolean =>
  Option.getOrElse(
    Option.map(
      Schema.decodeUnknownOption(Schema.JsonObject)(Schema.toJsonSchemaDocument(ProposeCauseArguments).schema),
      (document) => document['type'] === 'object',
    ),
    () => false,
  )

it.prop(
  '∀c_AdmitCauseProposal_≡CodeCauseEvidencePreserved',
  { of: [AdmitCauseProposal], subject: admitCauseProposal, arbitrary: { seed: 506_301 } },
  (subject, [command]) => {
    const decided = failureOf(decisionOf(subject, command))
    return decided.code === command.failure.code &&
      decided.cause === command.failure.cause &&
      JSON.stringify(decided.evidence) === JSON.stringify(command.failure.evidence)
  },
)

it.prop(
  '∀c_AdmitCauseProposal_→AbsentCitationsUnclassified',
  { of: [AdmitCauseProposal, ProposeCauseArguments], subject: admitCauseProposal, arbitrary: { seed: 506_303 } },
  (subject, [command, arguments_]) => {
    const citations: ReadonlyArray<CauseCitation> = [
      ...Arr.map(command.refs, (ref): CauseCitation => ({ ref: ref.id })),
      { log: command.logs.length },
    ]
    const decision = decisionOf(
      subject,
      rebuiltOf(command, {
        answer: toolCallsAnswerOf(arguments_, citations),
        refs: [],
      }),
    )
    return isClassified(decision) &&
      JSON.stringify(proposedOf(decision)) === JSON.stringify({ cause: 'unclassified', evidence: [] })
  },
)

it.prop(
  '∀c_AdmitCauseProposal_≡ValidProposalAdmitted',
  {
    of: [AdmitCauseProposal, NodeRef, ProposeCauseArguments],
    subject: admitCauseProposal,
    arbitrary: { seed: 506_304 },
  },
  (subject, [command, present, arguments_]) => {
    const citations: ReadonlyArray<CauseCitation> = [
      { ref: present.id },
      { ref: `${present.id}#absent` },
      ...Arr.flatMap(
        command.refs,
        (ref): ReadonlyArray<CauseCitation> => ref.id === present.id ? [] : [{ ref: ref.id }],
      ),
    ]
    const decision = decisionOf(
      subject,
      rebuiltOf(command, {
        answer: toolCallsAnswerOf(arguments_, citations),
        refs: [present],
      }),
    )
    const proposed = proposedOf(decision)
    return isClassified(decision) && proposed !== undefined &&
      proposed.cause === arguments_.cause &&
      JSON.stringify(proposed.evidence) === JSON.stringify([{ _tag: 'NodeEvidence', ref: present }]) &&
      parametersDocumentIsObject()
  },
)

it.prop(
  '∀c_AdmitCauseProposal_≡LogAndRouteCitationsKept',
  {
    of: [AdmitCauseProposal, ProposeCauseArguments, Schema.String],
    subject: admitCauseProposal,
    arbitrary: { seed: 506_305 },
  },
  (subject, [command, arguments_, logLine]) => {
    const logs = Arr.append(command.logs, logLine)
    const citations: ReadonlyArray<CauseCitation> = [{ log: logs.length - 1 }, { route: true }]
    const decision = decisionOf(
      subject,
      rebuiltOf(command, {
        answer: toolCallsAnswerOf(arguments_, citations),
        logs,
      }),
    )
    const proposed = proposedOf(decision)
    return isClassified(decision) && proposed !== undefined &&
      proposed.cause === arguments_.cause &&
      JSON.stringify(proposed.evidence) === JSON.stringify([
          { _tag: 'LogEvidence', text: logLine },
          { _tag: 'RouteEvidence', route: command.route },
        ])
  },
)

it.prop(
  '∀c_AdmitCauseProposal_¬ProposedOnRefusedAnswer',
  {
    of: [AdmitCauseProposal, ProposedCause, ProposeCauseArguments, Schema.String, Schema.String],
    subject: admitCauseProposal,
    arbitrary: { seed: 506_306 },
  },
  (subject, [command, proposal, arguments_, text, wrong]) => {
    const failure: FailureRecord = { ...command.failure, proposed: proposal }
    const wrongName = `w_${wrong.replace(/[^A-Za-z0-9_-]/gu, '_')}`.slice(0, 64)
    const textDecision = decisionOf(
      subject,
      rebuiltOf(command, {
        failure,
        answer: { _tag: 'Text', text: text.length > 0 ? text : 'refused' },
      }),
    )
    const wrongDecision = decisionOf(
      subject,
      rebuiltOf(command, {
        failure,
        answer: {
          _tag: 'ToolCalls',
          calls: [{
            id: 'call-cause',
            name: wrongName,
            arguments: { cause: arguments_.cause, evidence: [], reason: arguments_.reason },
          }],
        },
      }),
    )
    const expected = JSON.stringify({ code: failure.code, cause: failure.cause, evidence: failure.evidence })
    return isUnchanged(textDecision) && isUnchanged(wrongDecision) &&
      proposedOf(textDecision) === undefined && proposedOf(wrongDecision) === undefined &&
      JSON.stringify(failureOf(textDecision)) === expected &&
      JSON.stringify(failureOf(wrongDecision)) === expected
  },
)
