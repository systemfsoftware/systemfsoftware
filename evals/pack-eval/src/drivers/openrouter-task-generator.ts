import { Effect, Encoding, Layer, Option, Schema } from 'effect'
import * as Crypto from 'effect/Crypto'
import { LanguageModel } from 'effect/unstable/ai'
import { AnswerCache } from '../answer-cache.service.js'
import type { AnswerCacheKey, AnswerCacheShape, CachedAnswer } from '../answer-cache.service.js'
import {
  AnswerCacheFailure,
  Dimension,
  type DimensionTuple,
  GeneratedTask,
  ProposedRows,
  ProposedTuples,
  ProviderFailure,
  type TaskGenerationError,
  TupleEntry,
} from '../selection-trace.schema.js'
import { TaskGenerator } from '../task-generator.service.js'
import type { TaskDraftRequest, TupleProposalRequest } from '../task-generator.service.js'

const generatorRole = 'generator'

const encoder = new TextEncoder()

const dimensionLineOf = (dimension: Dimension): string =>
  `${dimension.name}: ${dimension.captures}. Possible values: ${dimension.values.join(', ')}`

const tupleLineOf = (dimensions: ReadonlyArray<Dimension>, tuple: DimensionTuple): string =>
  `(${dimensions.map((dimension) => `${dimension.name}: ${tuple[dimension.name] ?? ''}`).join(', ')})`

const proposalPromptOf = (request: TupleProposalRequest): string =>
  [
    `Generate 10 random combinations of (${
      request.dimensions.map((dimension) => dimension.name).join(', ')
    }) for a ${request.application}.`,
    '',
    'The dimensions are:',
    ...request.dimensions.map(dimensionLineOf),
    '',
    'The tuples already chosen are:',
    ...request.seeds.map((tuple) => tupleLineOf(request.dimensions, tuple)),
    '',
    'Avoid duplicates. Vary values across dimensions.',
  ].join('\n')

const exampleLineOf = (example: string): string => (example === '' ? '' : `Example: "${example}"`)

const draftPromptOf = (request: TaskDraftRequest): string =>
  [
    `We are generating synthetic tasks for a ${request.application}.`,
    '',
    'Given:',
    ...request.dimensions.map((dimension) => `${dimension.name}: ${request.tuple[dimension.name] ?? ''}`),
    '',
    'Write a realistic task that a user might enter. The task should reflect the specified characteristics.',
    exampleLineOf(request.example),
    '',
    'Now generate a new task.',
  ].join('\n')

const digestHexOf = (crypto: Crypto.Crypto, text: string): Effect.Effect<string> =>
  Effect.map(Effect.orDie(crypto.digest('SHA-256', encoder.encode(text))), Encoding.encodeHex)

interface GeneratedPart {
  readonly type: string
  readonly modelId?: string | undefined
}

const servedModelOf = (content: ReadonlyArray<GeneratedPart>): string =>
  Option.match(Option.fromUndefinedOr(content.find((part) => part.type === 'response-metadata')), {
    onNone: () => 'unknown',
    onSome: (part) => part.modelId ?? 'unknown',
  })

const toProviderFailure = (requestedModel: string) => (error: { readonly message: string }): ProviderFailure =>
  new ProviderFailure({ role: generatorRole, model: requestedModel, message: error.message })

interface Generator {
  readonly cache: AnswerCacheShape
  readonly crypto: Crypto.Crypto
  readonly model: LanguageModel.LanguageModel
  readonly requestedModel: string
  readonly encodeTuples: (answer: ProposedTuples) => Effect.Effect<string, Schema.SchemaError>
  readonly decodeTuples: (payload: string) => Effect.Effect<ProposedTuples, Schema.SchemaError>
  readonly encodeTask: (answer: GeneratedTask) => Effect.Effect<string, Schema.SchemaError>
  readonly decodeTask: (payload: string) => Effect.Effect<GeneratedTask, Schema.SchemaError>
}

const toCacheFailure =
  (key: AnswerCacheKey, operation: 'read' | 'write') => (error: { readonly message: string }): AnswerCacheFailure =>
    new AnswerCacheFailure({
      operation,
      source: `${key.role}/${key.model}/${key.promptDigest}`,
      message: error.message,
    })

const pairOf = (cell: TupleEntry): readonly [string, string] => [cell.name, cell.value]

const tupleOf = (cells: ReadonlyArray<TupleEntry>): DimensionTuple => Object.fromEntries(cells.map(pairOf))

const askTuples = (
  generator: Generator,
  prompt: string,
): Effect.Effect<ProposedTuples & { readonly servedModel: string }, ProviderFailure> =>
  generator.model.generateObject({ prompt, schema: ProposedRows, objectName: 'ProposedTuples' }).pipe(
    Effect.map((response) => ({
      servedModel: servedModelOf(response.content),
      tuples: response.value.tuples.map(tupleOf),
    })),
    Effect.mapError(toProviderFailure(generator.requestedModel)),
  )

const askTask = (
  generator: Generator,
  prompt: string,
): Effect.Effect<GeneratedTask & { readonly servedModel: string }, ProviderFailure> =>
  generator.model.generateObject({ prompt, schema: GeneratedTask, objectName: 'GeneratedTask' }).pipe(
    Effect.map((response) => ({
      servedModel: servedModelOf(response.content),
      text: response.value.text,
    })),
    Effect.mapError(toProviderFailure(generator.requestedModel)),
  )

const askAndRememberTuples = (
  generator: Generator,
  key: AnswerCacheKey,
  prompt: string,
): Effect.Effect<ProposedTuples & { readonly servedModel: string }, ProviderFailure | AnswerCacheFailure> =>
  Effect.gen(function*() {
    const fresh = yield* askTuples(generator, prompt)
    const payload = yield* Effect.mapError(
      generator.encodeTuples({ tuples: fresh.tuples }),
      toCacheFailure(key, 'write'),
    )
    yield* generator.cache.set(key, { servedModel: fresh.servedModel, payload })
    return fresh
  })

const askAndRememberTask = (
  generator: Generator,
  key: AnswerCacheKey,
  prompt: string,
): Effect.Effect<GeneratedTask & { readonly servedModel: string }, ProviderFailure | AnswerCacheFailure> =>
  Effect.gen(function*() {
    const fresh = yield* askTask(generator, prompt)
    const payload = yield* Effect.mapError(generator.encodeTask({ text: fresh.text }), toCacheFailure(key, 'write'))
    yield* generator.cache.set(key, { servedModel: fresh.servedModel, payload })
    return fresh
  })

const replayTuples = (
  generator: Generator,
  key: AnswerCacheKey,
  entry: CachedAnswer,
): Effect.Effect<ProposedTuples & { readonly servedModel: string }, AnswerCacheFailure> =>
  Effect.map(
    Effect.mapError(generator.decodeTuples(entry.payload), toCacheFailure(key, 'read')),
    (tuples) => ({ servedModel: entry.servedModel, tuples: tuples.tuples }),
  )

const replayTask = (
  generator: Generator,
  key: AnswerCacheKey,
  entry: CachedAnswer,
): Effect.Effect<GeneratedTask & { readonly servedModel: string }, AnswerCacheFailure> =>
  Effect.map(
    Effect.mapError(generator.decodeTask(entry.payload), toCacheFailure(key, 'read')),
    (task) => ({ servedModel: entry.servedModel, text: task.text }),
  )

const propose = (
  generator: Generator,
  request: TupleProposalRequest,
): Effect.Effect<ProposedTuples, TaskGenerationError> =>
  Effect.gen(function*() {
    const prompt = proposalPromptOf(request)
    const key: AnswerCacheKey = {
      role: generatorRole,
      model: generator.requestedModel,
      promptDigest: yield* digestHexOf(generator.crypto, prompt),
    }
    const cached = yield* generator.cache.get(key)
    return yield* Option.match(cached, {
      onNone: () => askAndRememberTuples(generator, key, prompt),
      onSome: (entry) => replayTuples(generator, key, entry),
    })
  })

const write = (generator: Generator, request: TaskDraftRequest): Effect.Effect<GeneratedTask, TaskGenerationError> =>
  Effect.gen(function*() {
    const prompt = draftPromptOf(request)
    const key: AnswerCacheKey = {
      role: generatorRole,
      model: generator.requestedModel,
      promptDigest: yield* digestHexOf(generator.crypto, prompt),
    }
    const cached = yield* generator.cache.get(key)
    return yield* Option.match(cached, {
      onNone: () => askAndRememberTask(generator, key, prompt),
      onSome: (entry) => replayTask(generator, key, entry),
    })
  })

export const layer = (
  options: { readonly model: string },
): Layer.Layer<TaskGenerator, never, AnswerCache | LanguageModel.LanguageModel | Crypto.Crypto> =>
  Layer.effect(
    TaskGenerator,
    Effect.gen(function*() {
      const cache = yield* AnswerCache
      const crypto = yield* Crypto.Crypto
      const model = yield* LanguageModel.LanguageModel
      const tuplesJson = Schema.fromJsonString(ProposedTuples)
      const taskJson = Schema.fromJsonString(GeneratedTask)
      const generator: Generator = {
        cache,
        crypto,
        model,
        requestedModel: options.model,
        encodeTuples: Schema.encodeEffect(tuplesJson),
        decodeTuples: Schema.decodeEffect(tuplesJson),
        encodeTask: Schema.encodeEffect(taskJson),
        decodeTask: Schema.decodeEffect(taskJson),
      }
      return TaskGenerator.of({
        proposeTuples: (request) => propose(generator, request),
        writeTask: (request) => write(generator, request),
      })
    }),
  )
