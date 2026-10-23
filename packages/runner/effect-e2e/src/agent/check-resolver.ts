import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Result from 'effect/Result'

import type { AgentConfig } from '../Config/config.schema.js'
import { Engine } from '../engine/engine.service.js'
import type { Observation } from '../engine/observation.schema.js'
import type { Message, ModelFailure, ModelRequest, ModelResponse, ToolDefinition } from '../model/model.schema.js'
import type { ModelGatewayShape } from '../model/model.service.js'
import { ModelGateway } from '../model/model.service.js'
import type { Check, CheckRecord, VisionMode } from '../verdict/check.schema.js'
import {
  type AppNotOpen,
  type ArtifactWriteFailed,
  type AutomationUnsupported,
  type Evidence,
  ModelOutputInvalid,
  type PolicyDenied,
  StepBudgetExhausted,
} from '../verdict/failure.schema.js'
import type { TokenUsage } from '../verdict/step-record.schema.js'
import { assistantMessageOf } from './act-prompt.js'
import { AdmitCheckAnswer, admitCheckAnswer, ResolveCheckArguments } from './admit-check-answer.workflow.js'
import { redactMessage, redactRequest } from './redaction.js'
import type { SecretLedgerShape } from './secret-ledger.service.js'
import { SecretLedger } from './secret-ledger.service.js'
import { toolDefinitionOf } from './tool-definition.js'
import { type VisionEvidence, visionEvidenceOf } from './vision.js'

const RESOLVE_MAX_OUTPUT_TOKENS = 1024
const MAX_ATTEMPTS = 2

const JUDGMENT_SYSTEM = [
  'You resolve one statement about the current screen into one check to run against it.',
  'Answer with exactly one tool call: resolve_check, with the check to run as its arguments.',
  'Cite a node that is shown by the [ref] beside it.',
  'Target a control that is not on the screen by its role and accessible name.',
  'Never answer with a verdict; the check is evaluated elsewhere, not by you.',
].join('\n')

const RESOLVE_CHECK_DESCRIPTION =
  'Resolve the statement into one check to run against the current screen: one or more literals combined with all or any.'

const INVALID_ANSWER_CONTENT =
  'the reply could not be used; reply with exactly one tool call: resolve_check, with the check to run as its arguments'

const resolveCheckTool: ToolDefinition = Option.getOrThrow(
  toolDefinitionOf({ name: 'resolve_check', description: RESOLVE_CHECK_DESCRIPTION, arguments: ResolveCheckArguments }),
)

/** What the resolver spends: the sentence, the step kind, the vision mode, the observation to resolve against, the
 * agent, and the model-call budget already spent and allowed for the step. */
export interface ResolveCheckRequest {
  readonly sentence: string
  readonly kind: 'assert' | 'waitFor'
  readonly vision: VisionMode
  readonly observation: Observation
  readonly agent: AgentConfig
  /** Model calls the step has already made; the resolver may spend only what remains of the budget. */
  readonly modelCalls: number
  readonly maxModelCalls: number
}

/** What a resolution answers: the admitted check, a record draft the caller extends with the evaluation evidence,
 * and the calls and tokens the resolution spent. */
export interface ResolvedCheck {
  readonly check: Check
  readonly record: CheckRecord
  readonly modelCalls: number
  readonly tokens: TokenUsage
}

export type ResolveCheckFailure =
  | ModelFailure
  | PolicyDenied
  | AutomationUnsupported
  | ArtifactWriteFailed
  | AppNotOpen
  | StepBudgetExhausted

interface ResolveStep {
  readonly sentence: string
  readonly kind: 'assert' | 'waitFor'
  readonly vision: VisionMode
  readonly observation: Observation
  readonly agent: AgentConfig
  readonly maxAttempts: number
  readonly gateway: ModelGatewayShape
  readonly ledger: SecretLedgerShape
  readonly evidence: VisionEvidence
  readonly run: Ref.Ref<ResolveRun>
}

interface ResolveRun {
  readonly history: ReadonlyArray<Message>
  readonly modelCalls: number
  readonly tokens: TokenUsage
}

const decided = <A>(result: Result.Result<A, never>): A =>
  Result.match(result, { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const logEvidence = (text: string): Evidence => [{ _tag: 'LogEvidence', text }]

const messageTextOf = (message: Message): string =>
  Match.valueTags(message, {
    UserMessage: ({ content }) =>
      Match.valueTags(Arr.headNonEmpty(content), {
        TextPart: ({ text }) => text,
        ImagePart: () => '[image]',
      }),
    AssistantMessage: ({ text }) => text,
    ToolMessage: ({ content }) => content,
  })

const systemOf = (agentSystem: string): string =>
  agentSystem.length === 0 ? JUDGMENT_SYSTEM : `${JUDGMENT_SYSTEM}\n\n${agentSystem}`

const taskTextOf = (kind: 'assert' | 'waitFor', sentence: string): string =>
  kind === 'assert' ? `Statement: ${sentence}` : `Condition to wait for: ${sentence}`

const taskMessageOf = (step: ResolveStep): Message => ({
  _tag: 'UserMessage',
  content: [{
    _tag: 'TextPart',
    text: [
      ...(step.agent.context === '' ? [] : [step.agent.context]),
      taskTextOf(step.kind, step.sentence),
    ].join('\n'),
  }],
})

const requestOf = (step: ResolveStep, history: ReadonlyArray<Message>): ModelRequest =>
  redactRequest(step.ledger.redact)({
    model: step.agent.model.model,
    system: systemOf(step.agent.system),
    messages: [taskMessageOf(step), { _tag: 'UserMessage', content: step.evidence.parts }, ...history],
    tools: [resolveCheckTool],
    toolChoice: { _tag: 'NamedTool', name: 'resolve_check' },
    temperature: 0,
    maxOutputTokens: RESOLVE_MAX_OUTPUT_TOKENS,
  })

const metered = (step: ResolveStep, response: ModelResponse): Effect.Effect<void> =>
  Ref.update(step.run, (run) => ({
    ...run,
    modelCalls: run.modelCalls + 1,
    tokens: {
      input: run.tokens.input + response.usage.input,
      output: run.tokens.output + response.usage.output,
    },
  }))

const appended = (step: ResolveStep, messages: ReadonlyArray<Message>): Effect.Effect<void> =>
  Ref.update(step.run, (run) => ({
    ...run,
    history: [...run.history, ...Arr.map(messages, redactMessage(step.ledger.redact))],
  }))

/** The second unusable answer ends the resolution; the redacted reason is the only evidence the failure carries. */
const invalidOf = (step: ResolveStep, reason: string): ModelOutputInvalid =>
  new ModelOutputInvalid({
    message: step.ledger.redact(`the model did not answer with a usable resolve_check call: ${reason}`),
    evidence: logEvidence(step.ledger.redact(reason)),
  })

const budgetExhaustedOf = (request: ResolveCheckRequest): StepBudgetExhausted =>
  new StepBudgetExhausted({
    message: `the step used all ${request.maxModelCalls} model calls it may make without resolving the check`,
    evidence: logEvidence(`budget model-calls ${request.maxModelCalls}`),
  })

/** One gateway call; an adapter-level decode failure counts as the first invalid answer and repairs with a user
 * message, so it shares the two-attempt budget instead of passing through. */
const responded = (step: ResolveStep, attempt: number): Effect.Effect<ModelResponse, ResolveCheckFailure> =>
  Effect.flatMap(Ref.get(step.run), (run) =>
    step.gateway.complete(requestOf(step, run.history)).pipe(
      Effect.catchTag('MODEL_OUTPUT_INVALID', (invalid) =>
        Match.value(attempt >= step.maxAttempts).pipe(
          Match.when(
            true,
            (): Effect.Effect<ModelResponse, ResolveCheckFailure> => Effect.fail(invalidOf(step, invalid.message)),
          ),
          Match.when(
            false,
            (): Effect.Effect<ModelResponse, ResolveCheckFailure> =>
              Effect.andThen(
                appended(step, [{
                  _tag: 'UserMessage',
                  content: [{ _tag: 'TextPart', text: INVALID_ANSWER_CONTENT }],
                }]),
                () => responded(step, attempt + 1),
              ),
          ),
          Match.exhaustive,
        )),
    ))

const admittedOf = (step: ResolveStep, response: ModelResponse, check: Check): Effect.Effect<ResolvedCheck, never> =>
  Effect.gen(function*() {
    const run = yield* Ref.get(step.run)
    const resolvedAt = yield* DateTime.now
    return {
      check,
      record: {
        sentence: step.sentence,
        check,
        evidence: Option.match(step.evidence.screenshot, {
          onNone: () => [],
          onSome: (screenshot) => [screenshot],
        }),
        vision: step.vision,
        resolvedBy: response.served,
        resolvedAt,
      },
      modelCalls: run.modelCalls,
      tokens: run.tokens,
    }
  })

const attempted = (step: ResolveStep, attempt: number): Effect.Effect<ResolvedCheck, ResolveCheckFailure> =>
  Effect.flatMap(responded(step, attempt), (response) =>
    Effect.flatMap(metered(step, response), () => {
      const decision = decided(
        admitCheckAnswer(
          new AdmitCheckAnswer({
            answer: response.answer,
            observation: step.observation,
            refsOffered: step.evidence.refsOffered,
          }),
        ),
      )
      return Match.valueTags(decision, {
        CheckAdmitted: ({ check }) => admittedOf(step, response, check),
        CheckRefused: ({ replies }) =>
          Match.value(attempt >= step.maxAttempts).pipe(
            Match.when(
              true,
              (): Effect.Effect<ResolvedCheck, ResolveCheckFailure> =>
                Effect.fail(invalidOf(step, messageTextOf(Arr.headNonEmpty(replies)))),
            ),
            Match.when(
              false,
              (): Effect.Effect<ResolvedCheck, ResolveCheckFailure> =>
                Effect.andThen(
                  appended(step, [assistantMessageOf(response.answer), ...replies]),
                  () => attempted(step, attempt + 1),
                ),
            ),
            Match.exhaustive,
          ),
      })
    }))

const stepOf = (request: ResolveCheckRequest) =>
  Effect.gen(function*() {
    const engine = yield* Engine
    const ledger = yield* SecretLedger
    const evidence = yield* visionEvidenceOf({
      mode: request.vision,
      observation: request.observation,
      engine,
      ledger,
    })
    return {
      sentence: request.sentence,
      kind: request.kind,
      vision: request.vision,
      observation: request.observation,
      agent: request.agent,
      maxAttempts: Math.max(0, Math.min(MAX_ATTEMPTS, request.maxModelCalls - request.modelCalls)),
      gateway: yield* ModelGateway,
      ledger,
      evidence,
      run: yield* Ref.make<ResolveRun>({ history: [], modelCalls: 0, tokens: { input: 0, output: 0 } }),
    } satisfies ResolveStep
  })

/**
 * Resolves the sentence into one closed `Check`: one `resolve_check` call per attempt, at most one repair, and
 * `MODEL_OUTPUT_INVALID` when the second answer is still unusable (design §8.2 step 3).
 */
export const resolveCheck = (
  request: ResolveCheckRequest,
): Effect.Effect<ResolvedCheck, ResolveCheckFailure, Engine | ModelGateway | SecretLedger> =>
  Effect.flatMap(stepOf(request), (step) =>
    Match.value(step.maxAttempts).pipe(
      Match.when(0, (): Effect.Effect<ResolvedCheck, ResolveCheckFailure> => Effect.fail(budgetExhaustedOf(request))),
      Match.orElse((): Effect.Effect<ResolvedCheck, ResolveCheckFailure> => attempted(step, 1)),
    ))
