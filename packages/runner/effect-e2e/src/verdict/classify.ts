import * as Arr from 'effect/Array'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'

import { formatObservation } from '../agent/observation.js'
import { redactRequest } from '../agent/redaction.js'
import type { SecretLedgerShape } from '../agent/secret-ledger.service.js'
import { SecretLedger } from '../agent/secret-ledger.service.js'
import { toolDefinitionOf } from '../agent/tool-definition.js'
import type { AgentConfig } from '../Config/config.schema.js'
import type { LogEntry } from '../engine/engine.schema.js'
import type { EngineShape } from '../engine/engine.service.js'
import { Engine } from '../engine/engine.service.js'
import type { Observation } from '../engine/observation.schema.js'
import type { NodeRef, SemanticNode } from '../engine/semantic-node.schema.js'
import type { ModelRequest, ModelResponse, ToolDefinition } from '../model/model.schema.js'
import { ModelGateway } from '../model/model.service.js'
import {
  AdmitCauseProposal,
  admitCauseProposal,
  type CauseProposalDecision,
  ProposeCauseArguments,
  ProposeCauseToolName,
} from './admit-cause-proposal.workflow.js'
import type { EvidenceRef } from './check.schema.js'
import type { FailureRecord } from './failure.schema.js'
import type { TokenUsage } from './step-record.schema.js'

export interface ClassifyRequest {
  readonly failure: FailureRecord
  readonly sentence: string
  readonly observation: Observation
  readonly agent: AgentConfig
  readonly timeout: Duration.Duration
}

export interface Classified {
  readonly failure: FailureRecord
  readonly modelCalls: number
  readonly tokens: TokenUsage
}

const CLASSIFY_MAX_OUTPUT_TOKENS = 1024

const NO_TOKENS: TokenUsage = { input: 0, output: 0 }

const PROPOSE_CAUSE_DESCRIPTION = 'Propose the cause of the failure and cite the evidence for it.'

const CLASSIFY_SYSTEM = [
  'The assertion step failed.',
  'Propose the most likely cause of the failure: the app itself (product), the test automation (automation), or the environment around them (environment).',
  'Cite what you can see: a visible node by its [ref] id, an engine log line by its index counting from 0, or the route the app was on.',
  'Never judge whether the assertion passes or fails; only propose the cause and cite its evidence.',
].join('\n')

const systemTextOf = (agentSystem: string): string =>
  Match.value(agentSystem.length === 0).pipe(
    Match.when(true, () => CLASSIFY_SYSTEM),
    Match.when(false, () => `${CLASSIFY_SYSTEM}\n\n${agentSystem}`),
    Match.exhaustive,
  )

export const logLineOf = (entry: LogEntry): string =>
  Match.valueTags(entry, {
    Console: ({ level, text }) => `[console:${level}] ${text}`,
    PageError: ({ message }) => `[pageerror] ${message}`,
    Network: ({ method, url, status }) => `[network] ${method} ${url} answered ${status}`,
    RequestFailed: ({ method, url, failure }) => `[request-failed] ${method} ${url}: ${failure}`,
  })

const logLinesOf = (entries: ReadonlyArray<LogEntry>, ledger: SecretLedgerShape): ReadonlyArray<string> =>
  Arr.map(entries, (entry) => ledger.redact(logLineOf(entry)))

const readLogs = (engine: EngineShape, ledger: SecretLedgerShape): Effect.Effect<ReadonlyArray<string>, never> =>
  Effect.map(Effect.option(engine.logs), (entries) =>
    Option.match(entries, {
      onNone: (): ReadonlyArray<string> => [],
      onSome: (present) => logLinesOf(present, ledger),
    }))

const visibleRefsOf = (nodes: ReadonlyArray<SemanticNode>): ReadonlyArray<NodeRef> =>
  Arr.flatMap(nodes, (node) => (node.states.hidden ? [] : [node.ref, ...visibleRefsOf(node.children)]))

export const evidenceLineOf = (ref: EvidenceRef): string =>
  Match.valueTags(ref, {
    NodeEvidence: ({ ref }) => `- node ${ref.id}`,
    ScreenshotEvidence: ({ screenshot }) => `- screenshot ${screenshot.digest}`,
    RouteEvidence: ({ route }) => `- route ${route.origin}${route.path}`,
    LogEvidence: ({ text }) => `- log ${JSON.stringify(text)}`,
  })

const failureTextOf = (failure: FailureRecord): string =>
  [
    `Failure: ${failure.code} (${failure.cause})`,
    ...Arr.map(failure.evidence, evidenceLineOf),
  ].join('\n')

const logsTextOf = (logs: ReadonlyArray<string>): string =>
  Arr.match(logs, {
    onEmpty: () => 'Engine logs: none',
    onNonEmpty: (lines) =>
      [
        'Engine logs, numbered from 0:',
        ...Arr.map(lines, (line, index) => `${index}: ${line}`),
      ].join('\n'),
  })

const userTextOf = (request: ClassifyRequest, ledger: SecretLedgerShape, logs: ReadonlyArray<string>): string =>
  [
    `Statement: ${request.sentence}`,
    failureTextOf(request.failure),
    '',
    'Current screen:',
    formatObservation(request.observation, ledger.redactCut),
    '',
    logsTextOf(logs),
  ].join('\n')

const modelRequestOf = (
  request: ClassifyRequest,
  ledger: SecretLedgerShape,
  tool: ToolDefinition,
  logs: ReadonlyArray<string>,
): ModelRequest =>
  redactRequest(ledger.redact)({
    model: request.agent.model.model,
    system: systemTextOf(request.agent.system),
    messages: [{ _tag: 'UserMessage', content: [{ _tag: 'TextPart', text: userTextOf(request, ledger, logs) }] }],
    tools: [tool],
    toolChoice: { _tag: 'NamedTool', name: ProposeCauseToolName.literal },
    temperature: 0,
    maxOutputTokens: CLASSIFY_MAX_OUTPUT_TOKENS,
  })

const decidedOf = (result: Result.Result<CauseProposalDecision, never>): CauseProposalDecision =>
  Result.match(result, { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const classifiedOf = (
  request: ClassifyRequest,
  response: ModelResponse,
  logs: ReadonlyArray<string>,
): Classified => {
  const decision = decidedOf(
    admitCauseProposal(
      new AdmitCauseProposal({
        failure: request.failure,
        answer: response.answer,
        refs: visibleRefsOf(request.observation.tree),
        logs,
        route: request.observation.route,
      }),
    ),
  )
  return { failure: decision.failure, modelCalls: 1, tokens: response.usage }
}

/**
 * Asks the model to propose a cause for an `ASSERTION_FAILED` failure, cited from what it can see; any
 * model failure, invalid answer or timeout returns the input failure unchanged, so the verdict never
 * depends on the classifier (design §10).
 */
export const classifyFailure = (
  request: ClassifyRequest,
): Effect.Effect<Classified, never, Engine | ModelGateway | SecretLedger> =>
  Effect.gen(function*() {
    const engine = yield* Engine
    const gateway = yield* ModelGateway
    const ledger = yield* SecretLedger
    const logs = yield* readLogs(engine, ledger)
    const tool = toolDefinitionOf({
      name: ProposeCauseToolName.literal,
      description: PROPOSE_CAUSE_DESCRIPTION,
      arguments: ProposeCauseArguments,
    })
    if (Option.isNone(tool)) {
      return { failure: request.failure, modelCalls: 0, tokens: NO_TOKENS }
    }
    const response = yield* gateway.complete(modelRequestOf(request, ledger, tool.value, logs)).pipe(
      Effect.option,
      Effect.timeoutOrElse({
        duration: request.timeout,
        orElse: () => Effect.succeed(Option.none<ModelResponse>()),
      }),
    )
    return Option.match(response, {
      onNone: (): Classified => ({ failure: request.failure, modelCalls: 1, tokens: NO_TOKENS }),
      onSome: (answered) => classifiedOf(request, answered, logs),
    })
  })
