import { Array as Arr, Effect, Encoding, Layer, Option, Schema } from 'effect'
import * as Crypto from 'effect/Crypto'
import { LanguageModel } from 'effect/unstable/ai'
import { AnswerCache } from '../answer-cache.service.js'
import type { AnswerCacheKey, AnswerCacheShape, CachedAnswer } from '../answer-cache.service.js'
import type { PackRule } from '../pack-rule.schema.js'
import { RuleSelector } from '../rule-selector.service.js'
import type { RuleSelectionRequest } from '../rule-selector.service.js'
import {
  AnswerCacheFailure,
  LoadedStems,
  ProviderFailure,
  type SelectionError,
  SelectionTrace,
  SelectorAnswer,
  UnknownSelectedStem,
} from '../selection-trace.schema.js'
import type { SelectorInstruction } from '../selector-instruction.schema.js'

const selectorRole = 'selector'

const encoder = new TextEncoder()

const ruleKeysOf = (rule: PackRule): string =>
  `- ${rule.stem}\n    title: ${rule.title}\n    applies_when: ${rule.appliesWhen.join('; ')}\n    tags: ${
    rule.tags.join(', ')
  }`

const selectorPromptOf = (request: RuleSelectionRequest): string =>
  [
    request.instruction.text,
    '',
    `Pack: ${request.pack.id}`,
    ...request.pack.rules.map(ruleKeysOf),
    '',
    `Task: ${request.task.text}`,
  ].join('\n')

const instructionFingerprintOf = (instruction: SelectorInstruction): string =>
  [
    instruction.provenance.consumer,
    instruction.provenance.pluginVersion,
    instruction.provenance.sourcePath,
    instruction.text,
  ].join('\u0000')

const digestHexOf = (crypto: Crypto.Crypto, text: string): Effect.Effect<string> =>
  Effect.map(Effect.orDie(crypto.digest('SHA-256', encoder.encode(text))), Encoding.encodeHex)

interface GeneratedPart {
  readonly type: string
  readonly modelId?: string | undefined
}

interface ProviderAnswer {
  readonly servedModel: string
  readonly answer: SelectorAnswer
}

const servedModelOf = (content: ReadonlyArray<GeneratedPart>): string =>
  Option.match(Arr.findFirst(content, (part) => part.type === 'response-metadata'), {
    onNone: () => 'unknown',
    onSome: (part) => part.modelId ?? 'unknown',
  })

const askProvider = (
  model: LanguageModel.LanguageModel,
  requestedModel: string,
  prompt: string,
): Effect.Effect<ProviderAnswer, ProviderFailure> =>
  model.generateObject({ prompt, schema: LoadedStems, objectName: 'LoadedRuleStems' }).pipe(
    Effect.map((response) => ({
      servedModel: servedModelOf(response.content),
      answer: {
        loaded: response.value.loaded,
        rawResponse: response.text,
      } satisfies SelectorAnswer,
    })),
    Effect.mapError((error) =>
      new ProviderFailure({ role: selectorRole, model: requestedModel, message: error.message })
    ),
  )

interface Selector {
  readonly cache: AnswerCacheShape
  readonly crypto: Crypto.Crypto
  readonly model: LanguageModel.LanguageModel
  readonly requestedModel: string
  readonly encodePayload: (answer: SelectorAnswer) => Effect.Effect<string, Schema.SchemaError>
  readonly decodePayload: (payload: string) => Effect.Effect<SelectorAnswer, Schema.SchemaError>
}

const askAndRemember = (
  selector: Selector,
  key: AnswerCacheKey,
  prompt: string,
): Effect.Effect<ProviderAnswer, ProviderFailure | AnswerCacheFailure> =>
  Effect.gen(function*() {
    const fresh = yield* askProvider(selector.model, selector.requestedModel, prompt)
    const payload = yield* Effect.mapError(
      selector.encodePayload(fresh.answer),
      (error) =>
        new AnswerCacheFailure({ operation: 'write', source: `${key.role}/${key.model}`, message: error.message }),
    )
    yield* selector.cache.set(key, { servedModel: fresh.servedModel, payload })
    return fresh
  })

const replayAnswer = (
  selector: Selector,
  key: AnswerCacheKey,
  entry: CachedAnswer,
): Effect.Effect<ProviderAnswer, AnswerCacheFailure> =>
  Effect.map(
    Effect.mapError(
      selector.decodePayload(entry.payload),
      (error) =>
        new AnswerCacheFailure({
          operation: 'read',
          source: `${key.role}/${key.model}/${key.promptDigest}`,
          message: error.message,
        }),
    ),
    (answer) => ({ servedModel: entry.servedModel, answer }),
  )

const unknownStemOf = (
  request: RuleSelectionRequest,
  loaded: ReadonlyArray<string>,
): Option.Option<UnknownSelectedStem> =>
  Option.map(
    Arr.findFirst(loaded, (stem) => !request.pack.rules.some((rule) => rule.stem === stem)),
    (stem) => new UnknownSelectedStem({ packId: request.pack.id, stem, selected: loaded }),
  )

const traceOf = (
  request: RuleSelectionRequest,
  requestedModel: string,
  instructionDigest: string,
  answer: ProviderAnswer,
): SelectionTrace =>
  new SelectionTrace({
    taskId: request.task.id,
    packId: request.pack.id,
    loadedStems: answer.answer.loaded,
    requestedModel,
    servedModel: answer.servedModel,
    instructionDigest,
    rawResponse: answer.answer.rawResponse,
  })

const select = (selector: Selector, request: RuleSelectionRequest): Effect.Effect<SelectionTrace, SelectionError> =>
  Effect.gen(function*() {
    const prompt = selectorPromptOf(request)
    const promptDigest = yield* digestHexOf(selector.crypto, prompt)
    const instructionDigest = yield* digestHexOf(selector.crypto, instructionFingerprintOf(request.instruction))
    const key: AnswerCacheKey = { role: selectorRole, model: selector.requestedModel, promptDigest }
    const cached = yield* selector.cache.get(key)
    const answer = yield* Option.match(cached, {
      onNone: () => askAndRemember(selector, key, prompt),
      onSome: (entry) => replayAnswer(selector, key, entry),
    })
    yield* Option.match(unknownStemOf(request, answer.answer.loaded), {
      onNone: () => Effect.void,
      onSome: (error) => Effect.fail(error),
    })
    return traceOf(request, selector.requestedModel, instructionDigest, answer)
  })

export const layer = (
  options: { readonly model: string },
): Layer.Layer<RuleSelector, never, AnswerCache | LanguageModel.LanguageModel | Crypto.Crypto> =>
  Layer.effect(
    RuleSelector,
    Effect.gen(function*() {
      const cache = yield* AnswerCache
      const crypto = yield* Crypto.Crypto
      const model = yield* LanguageModel.LanguageModel
      const payloadJson = Schema.fromJsonString(SelectorAnswer)
      const selector: Selector = {
        cache,
        crypto,
        model,
        requestedModel: options.model,
        encodePayload: Schema.encodeEffect(payloadJson),
        decodePayload: Schema.decodeEffect(payloadJson),
      }
      return RuleSelector.of({ select: (request) => select(selector, request) })
    }),
  )
