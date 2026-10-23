import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import type { StandardJSONSchemaV1, StandardSchemaV1 } from 'effect/StandardSchema'

import { keyDigestOf } from '../cache/key-digest.js'
import { canonicalJsonOf } from '../cache/key.schema.js'
import type { EngineShape } from '../engine/engine.service.js'
import { Engine } from '../engine/engine.service.js'
import type {
  Message,
  ModelAnswer,
  ModelFailure,
  ModelRequest,
  ModelResponse,
  ToolCall,
  ToolDefinition,
} from '../model/model.schema.js'
import type { ModelGatewayShape } from '../model/model.service.js'
import { ModelGateway } from '../model/model.service.js'
import type { VisionMode } from '../verdict/check.schema.js'
import { failureClassOf } from '../verdict/failure-class.schema.js'
import {
  AppNotOpen,
  ArtifactWriteFailed,
  AutomationUnsupported,
  type Evidence,
  type FailureCode,
  ModelOutputInvalid,
  type PolicyDenied,
  StepTimeout,
  type UnsupportedCapability,
} from '../verdict/failure.schema.js'
import type { StepOutcome, TokenUsage } from '../verdict/step-record.schema.js'
import { assistantMessageOf, toolResultOf } from './act-prompt.js'
import type { ActContext } from './act.js'
import { redactRequest } from './redaction.js'
import type { SecretLedgerShape } from './secret-ledger.service.js'
import { SecretLedger } from './secret-ledger.service.js'
import { type VisionEvidence, visionEvidenceOf, visionGate } from './vision.js'

const EXTRACT_MAX_OUTPUT_TOKENS = 4096
const MAX_REPAIRS = 1
const SKIPPED_CONTENT = 'not run: exactly one tool call per turn'

const EXTRACT_FRAMEWORK_SYSTEM = [
  'You read one value from the current screen of a real app.',
  'Answer with exactly one tool call: extracted, whose value is what the screen shows.',
  'The value must match the JSON Schema the extracted tool declares for its value argument.',
  'Never invent data the current screen does not show.',
].join('\n')

export interface ExtractOptions {
  /** What the model sees: the tree, the tree plus a masked screenshot, or only the screenshot. */
  readonly vision?: VisionMode | undefined
  /** The step timeout when the request names none. */
  readonly timeout?: Duration.Input | undefined
  /** Model calls allowed: the first answer plus repairs; defaults to 2, one call and one repair. */
  readonly maxModelCalls?: number | undefined
}

/** One `extract` call: the step's context, what to read, and the schema the answer must satisfy. */
export interface ExtractRequest<I, O> extends ExtractOptions {
  readonly context: ExtractContext
  readonly instruction: string
  readonly schema: StandardSchemaV1<I, O> & StandardJSONSchemaV1<I, O>
}

/** What a finished step hands its recorder; the run engine builds the `ExtractStep` from it (R17). */
export interface ExtractRecord {
  readonly stepIndex: number
  readonly instruction: string
  readonly schemaId: string
  /** The JSON value the model gave, or null when the step got none. */
  readonly value: Schema.Json
  readonly outcome: StepOutcome
  readonly modelCalls: number
  readonly tokens: TokenUsage
}

/** Who runs the step and where its record goes; `act`'s context with its own recorder, and no cache use. */
export interface ExtractContext extends Omit<ActContext, 'record'> {
  readonly record: (record: ExtractRecord) => Effect.Effect<void>
}

export interface ExtractResult<O> {
  readonly value: O
  readonly modelCalls: number
  readonly tokens: TokenUsage
}

export type ExtractFailure =
  | UnsupportedCapability
  | PolicyDenied
  | AutomationUnsupported
  | ArtifactWriteFailed
  | AppNotOpen
  | ModelFailure
  | StepTimeout

interface Run {
  readonly modelCalls: number
  readonly tokens: TokenUsage
  readonly repairs: number
  readonly history: ReadonlyArray<Message>
  readonly value: Option.Option<Schema.Json>
  readonly schemaId: Option.Option<string>
}

interface Step<I, O> {
  readonly context: ExtractContext
  readonly instruction: string
  readonly schema: StandardSchemaV1<I, O> & StandardJSONSchemaV1<I, O>
  readonly vision: VisionMode
  readonly maxModelCalls: number
  readonly timeout: Duration.Duration
  readonly engine: EngineShape
  readonly gateway: ModelGatewayShape
  readonly ledger: SecretLedgerShape
  readonly run: Ref.Ref<Run>
}

interface Finished<O> {
  readonly value: O
}

interface Extracted {
  readonly value: Schema.Json
}

const FRESH_RUN: Run = {
  modelCalls: 0,
  tokens: { input: 0, output: 0 },
  repairs: 0,
  history: [],
  value: Option.none(),
  schemaId: Option.none(),
}

const logEvidence = (text: string): Evidence => [{ _tag: 'LogEvidence', text }]

const update = <I, O>(step: Step<I, O>, change: (run: Run) => Run): Effect.Effect<void> => Ref.update(step.run, change)

const extractSystemOf = (agentSystem: string): string =>
  agentSystem.length === 0 ? EXTRACT_FRAMEWORK_SYSTEM : `${EXTRACT_FRAMEWORK_SYSTEM}\n\n${agentSystem}`

const taskMessageOf = (context: ExtractContext, instruction: string): Message => ({
  _tag: 'UserMessage',
  content: [{
    _tag: 'TextPart',
    text: [
      ...(context.agent.config.context.length === 0 ? [] : [context.agent.config.context]),
      `Read from the current screen: ${instruction}`,
    ].join('\n'),
  }],
})

const screenMessageOf = (evidence: VisionEvidence): Message => ({
  _tag: 'UserMessage',
  content: evidence.parts,
})

const requestOf = <I, O>(
  step: Step<I, O>,
  tool: ToolDefinition,
  run: Run,
  evidence: VisionEvidence,
): ModelRequest =>
  redactRequest(step.ledger.redact)({
    model: step.context.agent.config.model.model,
    system: extractSystemOf(step.context.agent.config.system),
    messages: [taskMessageOf(step.context, step.instruction), ...run.history, screenMessageOf(evidence)],
    tools: [tool],
    toolChoice: { _tag: 'NamedTool', name: 'extracted' },
    temperature: 0,
    maxOutputTokens: EXTRACT_MAX_OUTPUT_TOKENS,
  })

const extractedToolOf = (valueSchema: Schema.Json): ToolDefinition => ({
  name: 'extracted',
  description: 'Answer with the value read from the current screen; the value must match its declared schema.',
  parameters: {
    type: 'object',
    properties: { value: valueSchema },
    required: ['value'],
    additionalProperties: false,
  },
})

const unsupportedOf = (ledger: SecretLedgerShape, reason: string): AutomationUnsupported =>
  new AutomationUnsupported({
    message: `the schema cannot be shown to the model: ${reason}`,
    evidence: logEvidence(ledger.redact(reason)),
  })

const convertedOf = <I, O>(step: Step<I, O>): Effect.Effect<Schema.Json, AutomationUnsupported> =>
  Effect.flatMap(
    Effect.try({
      try: () => step.schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' }),
      catch: (error) =>
        unsupportedOf(step.ledger, error instanceof Error ? error.message : 'the converter threw a non-Error value'),
    }),
    (record) =>
      Effect.mapError(
        Effect.fromOption(Schema.decodeUnknownOption(Schema.Json)(record)),
        () => unsupportedOf(step.ledger, 'the converter returned a value that is not JSON'),
      ),
  )

const schemaIdOf = <I, O>(
  schema: StandardSchemaV1<I, O> & StandardJSONSchemaV1<I, O>,
  jsonSchema: Schema.Json,
): string => `${schema['~standard'].vendor}:${keyDigestOf(canonicalJsonOf(jsonSchema))}`

const extractedOf = (answer: ModelAnswer): Option.Option<Extracted> =>
  Match.valueTags(answer, {
    Text: () => Option.none(),
    ToolCalls: ({ calls }) =>
      Option.flatMap(Arr.head(calls), (call) =>
        Match.value(calls.length === 1 && call.name === 'extracted').pipe(
          Match.when(true, () =>
            Option.map(
              Schema.decodeUnknownOption(Schema.Json)(call.arguments['value']),
              (value): Extracted => ({ value }),
            )),
          Match.orElse(() => Option.none()),
        )),
  })

const validatedOf = <I, O>(
  step: Step<I, O>,
  candidate: Schema.Json,
): Effect.Effect<StandardSchemaV1.Result<O>, ModelOutputInvalid> =>
  Effect.tryPromise({
    try: () => Promise.resolve(step.schema['~standard'].validate(candidate)),
    catch: () =>
      new ModelOutputInvalid({
        message: 'the schema crashed while validating the value instead of reporting issues',
        evidence: logEvidence('~standard.validate threw'),
      }),
  })

const issuePathOf = (issue: StandardSchemaV1.Issue): string =>
  Arr.match(issue.path ?? [], {
    onEmpty: () => '(the value)',
    onNonEmpty: (segments) =>
      segments.map((segment) => String(typeof segment === 'object' ? segment.key : segment)).join('.'),
  })

const issuesTextOf = (issues: ReadonlyArray<StandardSchemaV1.Issue>): string =>
  issues.map((issue) => `${issuePathOf(issue)}: ${issue.message}`).join('; ')

const oneCallContent = (): string =>
  'reply with exactly one tool call: extracted, with the value read from the current screen'

const singleCallContentOf = (call: ToolCall): string =>
  call.name === 'extracted'
    ? 'the arguments for "extracted" do not match its schema: pass one "value" the value schema accepts'
    : `unknown tool "${call.name}"; call extracted with the value read from the current screen`

const refusedContentOf = (answer: ModelAnswer): string =>
  Match.valueTags(answer, {
    Text: () => oneCallContent(),
    ToolCalls: ({ calls }) => calls.length === 1 ? singleCallContentOf(calls[0]) : oneCallContent(),
  })

const repliesOf = (answer: ModelAnswer, content: string): ReadonlyArray<Message> =>
  Match.valueTags(answer, {
    Text: (): ReadonlyArray<Message> => [{ _tag: 'UserMessage', content: [{ _tag: 'TextPart', text: content }] }],
    ToolCalls: ({ calls }) =>
      calls.map((call, index) => toolResultOf(call.id, index === 0 ? content : SKIPPED_CONTENT)),
  })

const invalidOf = <I, O>(step: Step<I, O>, reason: string): ModelOutputInvalid =>
  new ModelOutputInvalid({
    message: `the model did not produce a valid extracted value: ${reason}`,
    evidence: logEvidence(step.ledger.redact(reason)),
  })

const correctedOf = <I, O>(
  step: Step<I, O>,
  tool: ToolDefinition,
  answer: ModelAnswer,
  content: string,
  evidence: VisionEvidence,
): Effect.Effect<Finished<O>, ExtractFailure> =>
  Effect.flatMap(
    Ref.get(step.run),
    (run) =>
      Match.value(run.repairs < MAX_REPAIRS && run.modelCalls < step.maxModelCalls).pipe(
        Match.when(true, (): Effect.Effect<Finished<O>, ExtractFailure> =>
          Effect.flatMap(
            update(step, (current) => ({
              ...current,
              repairs: current.repairs + 1,
              history: [...current.history, ...repliesOf(answer, step.ledger.redact(content))],
            })),
            () => turn(step, tool, evidence),
          )),
        Match.orElse((): Effect.Effect<Finished<O>, ExtractFailure> => Effect.fail(invalidOf(step, content))),
      ),
  )

const finishedOf = <I, O>(
  step: Step<I, O>,
  tool: ToolDefinition,
  answer: ModelAnswer,
  evidence: VisionEvidence,
): Effect.Effect<Finished<O>, ExtractFailure> =>
  Option.match(extractedOf(answer), {
    onNone: () => correctedOf(step, tool, answer, refusedContentOf(answer), evidence),
    onSome: ({ value }) =>
      Effect.flatMap(validatedOf(step, value), (result) => {
        if (result.issues !== undefined) {
          return correctedOf(
            step,
            tool,
            answer,
            `the value does not match the requested schema: ${
              issuesTextOf(result.issues)
            }; call extracted again with a corrected value`,
            evidence,
          )
        }
        return Effect.map(
          update(step, (run) => ({ ...run, value: Option.some(value) })),
          (): Finished<O> => ({ value: result.value }),
        )
      }),
  })

const metered = (response: ModelResponse) => (run: Run): Run => ({
  ...run,
  modelCalls: run.modelCalls + 1,
  tokens: { input: run.tokens.input + response.usage.input, output: run.tokens.output + response.usage.output },
})

const turn = <I, O>(
  step: Step<I, O>,
  tool: ToolDefinition,
  evidence: VisionEvidence,
): Effect.Effect<Finished<O>, ExtractFailure> =>
  Effect.gen(function*() {
    const before = yield* Ref.get(step.run)
    const response = yield* step.gateway.complete(requestOf(step, tool, before, evidence))
    yield* update(step, metered(response))
    yield* update(step, (run) => ({ ...run, history: [...run.history, assistantMessageOf(response.answer)] }))
    return yield* finishedOf(step, tool, response.answer, evidence)
  })

const stepped = <I, O>(step: Step<I, O>): Effect.Effect<ExtractResult<O>, ExtractFailure> =>
  Effect.gen(function*() {
    yield* visionGate({
      mode: step.vision,
      modelVision: step.context.agent.config.model.vision,
      capabilities: step.engine.capabilities,
    })
    const jsonSchema = yield* convertedOf(step)
    yield* update(step, (run) => ({ ...run, schemaId: Option.some(schemaIdOf(step.schema, jsonSchema)) }))
    const tool = extractedToolOf(jsonSchema)
    const observation = yield* step.engine.observe
    const evidence = yield* visionEvidenceOf({
      mode: step.vision,
      observation,
      engine: step.engine,
      ledger: step.ledger,
    })
    const finished = yield* turn(step, tool, evidence)
    const run = yield* Ref.get(step.run)
    return { value: finished.value, modelCalls: run.modelCalls, tokens: run.tokens }
  })

const outcomeOfError = (error: ExtractFailure): StepOutcome => {
  const code: FailureCode = error._tag
  return { _tag: 'Failed', code, cause: failureClassOf(code).cause, evidence: error.evidence }
}

const DIED: StepOutcome = {
  _tag: 'Failed',
  code: 'INTERNAL_ERROR',
  cause: failureClassOf('INTERNAL_ERROR').cause,
  evidence: logEvidence('the extract step died'),
}

const outcomeOf = <O>(exit: Exit.Exit<ExtractResult<O>, ExtractFailure>): Option.Option<StepOutcome> =>
  Exit.match(exit, {
    onSuccess: (): Option.Option<StepOutcome> => Option.some({ _tag: 'Passed' }),
    onFailure: (cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Option.none()
        : Option.some(cause.pipe(Cause.findErrorOption, Option.match({ onNone: () => DIED, onSome: outcomeOfError }))),
  })

const recordOf = <I, O>(step: Step<I, O>, run: Run, outcome: StepOutcome): ExtractRecord => ({
  stepIndex: step.context.stepIndex,
  instruction: step.instruction,
  schemaId: Option.getOrElse(run.schemaId, () => `${step.schema['~standard'].vendor}:unavailable`),
  value: Option.getOrElse(run.value, () => null),
  outcome,
  modelCalls: run.modelCalls,
  tokens: run.tokens,
})

/** A cancelled step records nothing, as `act` does (design §9.5). */
const recorded = <I, O>(
  step: Step<I, O>,
  exit: Exit.Exit<ExtractResult<O>, ExtractFailure>,
): Effect.Effect<void> =>
  Option.match(outcomeOf(exit), {
    onNone: () => Effect.void,
    onSome: (outcome) => Effect.flatMap(Ref.get(step.run), (run) => step.context.record(recordOf(step, run, outcome))),
  })

const timedOut = <I, O>(step: Step<I, O>): StepTimeout =>
  new StepTimeout({
    message: `the step did not read its value within ${Duration.toMillis(step.timeout)} ms`,
    evidence: logEvidence(`timeout ${Duration.toMillis(step.timeout)} ms`),
  })

const orDefault = <A>(value: A | undefined, fallback: A): A => value ?? fallback

const stepOf = <I, O>(request: ExtractRequest<I, O>) =>
  Effect.gen(function*() {
    return {
      context: request.context,
      instruction: request.instruction,
      schema: request.schema,
      vision: orDefault(request.vision, false),
      maxModelCalls: orDefault(request.maxModelCalls, 2),
      timeout: Duration.fromInputUnsafe(orDefault(request.timeout, request.context.timeout)),
      engine: yield* Engine,
      gateway: yield* ModelGateway,
      ledger: yield* SecretLedger,
      run: yield* Ref.make(FRESH_RUN),
    } satisfies Step<I, O>
  })

/**
 * Reads one value from the current screen through the model: the answer must arrive through the
 * `extracted` tool and validate against the author's schema, with one repair round (design §8.3).
 */
export const extract = <I, O>(
  request: ExtractRequest<I, O>,
): Effect.Effect<ExtractResult<O>, ExtractFailure, Engine | ModelGateway | SecretLedger> =>
  Effect.flatMap(stepOf(request), (step) =>
    stepped(step).pipe(
      Effect.timeoutOrElse({ duration: step.timeout, orElse: () => Effect.fail(timedOut(step)) }),
      Effect.onExit((exit) => recorded(step, exit)),
    ))
