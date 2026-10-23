import * as Clock from 'effect/Clock'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as HttpClient from 'effect/http/HttpClient'
import type * as HttpClientError from 'effect/http/HttpClientError'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'

import type { ModelSpec } from '../Config/config.schema.js'
import { ContextOverflow, ModelOutputInvalid, ModelProviderFailed } from '../verdict/failure.schema.js'
import { JudgeReply, judgeReply } from './judge-reply.workflow.js'
import {
  type Answered,
  estimateInputTokens,
  type ModelFailure,
  type ModelRequest,
  type ModelResponse,
  type ProviderReply,
  type Rejected,
} from './model.schema.js'
import { ModelGateway } from './model.service.js'
import { ChatCompletionReply, ChatCompletionRequest, ProviderErrorBody } from './openai-wire.schema.js'

export interface OpenAiCompatibleOptions {
  readonly model: ModelSpec
  readonly apiKey: Option.Option<Redacted.Redacted<string>>
}

const OPENROUTER_COMPLETIONS = 'https://openrouter.ai/api/v1/chat/completions'

const REDACTED = '<redacted>'

const UNREAD_BODY_LIMIT = 512

const endpointOf = (spec: ModelSpec): string =>
  Match.value(spec).pipe(
    Match.when({ gateway: 'openrouter' }, () => OPENROUTER_COMPLETIONS),
    Match.when({ gateway: 'openai-compatible' }, (compatible) =>
      `${compatible.baseURL.replace(/\/+$/u, '')}/chat/completions`),
    Match.exhaustive,
  )

const providerOf = (spec: ModelSpec): string =>
  Match.value(spec).pipe(
    Match.when({ gateway: 'openrouter' }, () => 'openrouter'),
    Match.when({ gateway: 'openai-compatible' }, (compatible) => new URL(compatible.baseURL).host),
    Match.exhaustive,
  )

const scrubberOf = (key: string) => (text: string): string =>
  Match.value(key.length).pipe(
    Match.when(0, () => text),
    Match.orElse(() => text.split(key).join(REDACTED)),
  )

const providerFailed = (text: string): ModelFailure =>
  ModelProviderFailed.make({ message: text, evidence: [{ _tag: 'LogEvidence', text }] })

const keyOf = (options: OpenAiCompatibleOptions): Effect.Effect<Redacted.Redacted<string>, ModelFailure> =>
  Effect.fromOption(options.apiKey).pipe(
    Effect.mapError(() => providerFailed(`no API key: the environment variable ${options.model.apiKeyEnv} is not set`)),
  )

const overBudget = (spec: ModelSpec, request: ModelRequest): Option.Option<number> =>
  Option.fromNullishOr(spec.maxInputTokens).pipe(
    Option.filter((budget) => estimateInputTokens(request) > budget),
  )

const contextOverflowOf = (request: ModelRequest) => (budget: number): ModelFailure => {
  const text = `the request is estimated at ${estimateInputTokens(request)} input tokens, over the budget of ${budget}`
  return ContextOverflow.make({ message: text, evidence: [{ _tag: 'LogEvidence', text }] })
}

const withinBudget = (spec: ModelSpec, request: ModelRequest): Effect.Effect<void, ModelFailure> =>
  Effect.fromOption(Option.map(overBudget(spec, request), contextOverflowOf(request))).pipe(
    Effect.flip,
    Effect.asVoid,
  )

const transportFailed = (scrub: (text: string) => string) => (error: HttpClientError.HttpClientError): ModelFailure =>
  providerFailed(scrub(`the model provider could not be reached: ${error.message}`))

const outputInvalid = (error: Schema.SchemaError): ModelFailure => {
  const text = `the provider's answer does not decode: ${error.message}`
  return ModelOutputInvalid.make({ message: text, evidence: [{ _tag: 'LogEvidence', text }] })
}

const isSuccessStatus = (status: number): boolean => status >= 200 && status < 300

const answeredOf = (body: string): Effect.Effect<Answered, ModelFailure> =>
  Schema.decodeEffect(Schema.fromJsonString(ChatCompletionReply))(body).pipe(Effect.mapError(outputInvalid))

const rejectedOf = (status: number, body: string): Rejected => ({
  _tag: 'Rejected',
  status,
  ...Option.getOrElse(
    Schema.decodeOption(Schema.fromJsonString(ProviderErrorBody))(body),
    () => ({ code: null, message: body.slice(0, UNREAD_BODY_LIMIT) }),
  ),
})

const replyOf = (status: number, body: string): Effect.Effect<ProviderReply, ModelFailure> =>
  Match.value(isSuccessStatus(status)).pipe(
    Match.when(true, (): Effect.Effect<ProviderReply, ModelFailure> => answeredOf(body)),
    Match.when(false, () => Effect.succeed(rejectedOf(status, body))),
    Match.exhaustive,
  )

const httpRequestOf = (endpoint: string, key: Redacted.Redacted<string>, request: ModelRequest) =>
  Effect.map(
    Effect.orDie(Schema.encodeEffect(ChatCompletionRequest)(request)),
    (body) =>
      HttpClientRequest.post(endpoint).pipe(
        HttpClientRequest.bearerToken(key),
        HttpClientRequest.acceptJson,
        HttpClientRequest.bodyJsonUnsafe(body),
      ),
  )

const completeWith = (options: OpenAiCompatibleOptions, client: HttpClient.HttpClient) => {
  const endpoint = endpointOf(options.model)
  const provider = providerOf(options.model)
  return (request: ModelRequest): Effect.Effect<ModelResponse, ModelFailure> =>
    Effect.gen(function*() {
      const key = yield* keyOf(options)
      yield* withinBudget(options.model, request)
      const scrub = scrubberOf(Redacted.value(key))
      const outgoing = yield* httpRequestOf(endpoint, key, request)
      const started = yield* Clock.currentTimeMillis
      const response = yield* client.execute(outgoing).pipe(Effect.mapError(transportFailed(scrub)))
      const body = yield* response.text.pipe(Effect.map(scrub), Effect.mapError(transportFailed(scrub)))
      const finished = yield* Clock.currentTimeMillis
      const reply = yield* replyOf(response.status, body)
      const accepted = yield* Effect.fromResult(judgeReply(JudgeReply.make({ reply })))
      return {
        answer: accepted.answer,
        finishReason: accepted.finishReason,
        usage: accepted.usage,
        served: { provider, model: accepted.model },
        latency: Duration.millis(finished - started),
      }
    })
}

export const layer = (options: OpenAiCompatibleOptions): Layer.Layer<ModelGateway, never, HttpClient.HttpClient> =>
  Layer.effect(
    ModelGateway,
    Effect.gen(function*() {
      const client = yield* HttpClient.HttpClient
      return ModelGateway.of({ complete: completeWith(options, client) })
    }),
  )
