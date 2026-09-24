import { Array as Arr, Effect, Encoding, Layer, Option, Schema } from 'effect'
import * as Crypto from 'effect/Crypto'
import { LanguageModel } from 'effect/unstable/ai'
import { AnswerCache } from '../answer-cache.service.js'
import type { AnswerCacheKey, AnswerCacheShape, CachedAnswer } from '../answer-cache.service.js'
import { ContradictionJudge } from '../contradiction-judge.service.js'
import {
  type ContradictionJudgeRequest,
  type FewShotExample,
  JudgedPair,
  JudgeFailure,
  JudgePayload,
  JudgeReply,
} from '../contradiction-verdict.schema.js'
import { AnswerCacheFailure } from '../selection-trace.schema.js'

const judgeRole = 'judge'

const encoder = new TextEncoder()

const exampleOf = (example: FewShotExample): string =>
  [
    `Task: ${example.taskText}`,
    `Rule A: ${example.ruleABody}`,
    `Rule B: ${example.ruleBBody}`,
    `Critique: ${example.critique}`,
    `Verdict: ${example.verdict}`,
  ].join('\n')

const judgePromptOf = (request: ContradictionJudgeRequest): string =>
  [
    request.prompt.criterion,
    '',
    `Pass: ${request.prompt.passDefinition}`,
    `Fail: ${request.prompt.failDefinition}`,
    ...request.fewShot.flatMap((example) => ['', exampleOf(example)]),
    '',
    `Task: ${request.taskText}`,
    `Rule A (${request.ruleA.stem}, ${request.ruleA.title}): ${request.ruleA.body}`,
    `Rule B (${request.ruleB.stem}, ${request.ruleB.title}): ${request.ruleB.body}`,
  ].join('\n')

const digestHexOf = (crypto: Crypto.Crypto, text: string): Effect.Effect<string> =>
  Effect.map(Effect.orDie(crypto.digest('SHA-256', encoder.encode(text))), Encoding.encodeHex)

interface GeneratedPart {
  readonly type: string
  readonly modelId?: string | undefined
}

interface ProviderAnswer {
  readonly servedModel: string
  readonly answer: JudgePayload
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
): Effect.Effect<ProviderAnswer, JudgeFailure> =>
  model.generateObject({ prompt, schema: JudgeReply, objectName: 'ContradictionVerdict' }).pipe(
    Effect.map((response) => ({
      servedModel: servedModelOf(response.content),
      answer: {
        critique: response.value.critique,
        verdict: response.value.verdict,
      } satisfies JudgePayload,
    })),
    Effect.mapError((error) => new JudgeFailure({ role: judgeRole, model: requestedModel, message: error.message })),
  )

interface Judge {
  readonly cache: AnswerCacheShape
  readonly crypto: Crypto.Crypto
  readonly model: LanguageModel.LanguageModel
  readonly requestedModel: string
  readonly encodePayload: (answer: JudgePayload) => Effect.Effect<string, Schema.SchemaError>
  readonly decodePayload: (payload: string) => Effect.Effect<JudgePayload, Schema.SchemaError>
}

const askAndRemember = (
  judge: Judge,
  key: AnswerCacheKey,
  prompt: string,
): Effect.Effect<ProviderAnswer, JudgeFailure | AnswerCacheFailure> =>
  Effect.gen(function*() {
    const fresh = yield* askProvider(judge.model, judge.requestedModel, prompt)
    const payload = yield* Effect.mapError(
      judge.encodePayload(fresh.answer),
      (error) =>
        new AnswerCacheFailure({ operation: 'write', source: `${key.role}/${key.model}`, message: error.message }),
    )
    yield* judge.cache.set(key, { servedModel: fresh.servedModel, payload })
    return fresh
  })

const replayAnswer = (
  judge: Judge,
  key: AnswerCacheKey,
  entry: CachedAnswer,
): Effect.Effect<ProviderAnswer, AnswerCacheFailure> =>
  Effect.map(
    Effect.mapError(
      judge.decodePayload(entry.payload),
      (error) =>
        new AnswerCacheFailure({
          operation: 'read',
          source: `${key.role}/${key.model}/${key.promptDigest}`,
          message: error.message,
        }),
    ),
    (answer) => ({ servedModel: entry.servedModel, answer }),
  )

const judgedOf = (request: ContradictionJudgeRequest, answer: ProviderAnswer): JudgedPair =>
  new JudgedPair({
    critique: answer.answer.critique,
    verdict: answer.answer.verdict,
    servedModel: answer.servedModel,
  })

const judge = (
  interpreter: Judge,
  request: ContradictionJudgeRequest,
): Effect.Effect<JudgedPair, JudgeFailure | AnswerCacheFailure> =>
  Effect.gen(function*() {
    const prompt = judgePromptOf(request)
    const promptDigest = yield* digestHexOf(interpreter.crypto, prompt)
    const key: AnswerCacheKey = { role: judgeRole, model: interpreter.requestedModel, promptDigest }
    const cached = yield* interpreter.cache.get(key)
    const answer = yield* Option.match(cached, {
      onNone: () => askAndRemember(interpreter, key, prompt),
      onSome: (entry) => replayAnswer(interpreter, key, entry),
    })
    return judgedOf(request, answer)
  })

export const layer = (
  options: { readonly model: string },
): Layer.Layer<ContradictionJudge, never, AnswerCache | LanguageModel.LanguageModel | Crypto.Crypto> =>
  Layer.effect(
    ContradictionJudge,
    Effect.gen(function*() {
      const cache = yield* AnswerCache
      const crypto = yield* Crypto.Crypto
      const model = yield* LanguageModel.LanguageModel
      const payloadJson = Schema.fromJsonString(JudgePayload)
      const interpreter: Judge = {
        cache,
        crypto,
        model,
        requestedModel: options.model,
        encodePayload: Schema.encodeEffect(payloadJson),
        decodePayload: Schema.decodeEffect(payloadJson),
      }
      return ContradictionJudge.of({ judge: (request) => judge(interpreter, request) })
    }),
  )
