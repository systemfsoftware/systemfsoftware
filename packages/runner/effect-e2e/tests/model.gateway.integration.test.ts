import {
  ModelFailure,
  ModelGateway,
  type ModelRequest,
  ModelResponse,
  type ModelSpec,
  OpenAiCompatible,
} from '@systemfsoftware/effect-e2e/model'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as HttpClient from 'effect/http/HttpClient'
import * as HttpClientRequest from 'effect/http/HttpClientRequest'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import * as Tracer from 'effect/Tracer'

import {
  openAiStub,
  type RecordedRequest,
  refusedOrigin,
  type ScriptedReply,
} from './__fixtures__/openai-stub.fixture.js'

const Feature = makeFeature({ it })

const API_KEY = 'sk-test-504-0f3c9a7e51d24b88'

const OPENROUTER_ORIGIN = 'https://openrouter.ai'

const openRouterSpec: ModelSpec = {
  gateway: 'openrouter',
  model: 'deepseek/deepseek-flash-latest',
  apiKeyEnv: 'OPENROUTER_API_KEY',
}

const compatibleSpec = (origin: string): ModelSpec => ({
  gateway: 'openai-compatible',
  baseURL: `${origin}/v1`,
  model: 'acme/chat-1',
  apiKeyEnv: 'ACME_API_KEY',
})

const budgetedSpec = (origin: string): ModelSpec => ({ ...compatibleSpec(origin), maxInputTokens: 10 })

const actRequest: ModelRequest = {
  model: 'deepseek/deepseek-flash-latest',
  system: 'You are a first-time customer.',
  messages: [{
    _tag: 'UserMessage',
    content: [{ _tag: 'TextPart', text: 'press Greet' }, {
      _tag: 'ImagePart',
      mediaType: 'image/png',
      data: 'iVBORw0KGgo=',
    }],
  }],
  tools: [{
    name: 'tap',
    description: 'Tap a control',
    parameters: { type: 'object', properties: { locator: { type: 'string' } }, required: ['locator'] },
  }],
  toolChoice: { _tag: 'AutoTool' },
  temperature: 0,
  maxOutputTokens: 256,
}

const judgmentRequest: ModelRequest = {
  ...actRequest,
  tools: [{ name: 'resolve_check', description: 'Resolve the statement', parameters: { type: 'object' } }],
  toolChoice: { _tag: 'NamedTool', name: 'resolve_check' },
}

const longRequest: ModelRequest = {
  ...actRequest,
  messages: [{ _tag: 'UserMessage', content: [{ _tag: 'TextPart', text: 'press Greet '.repeat(20) }] }],
}

const replyOf = (choice: object, usage: object = { prompt_tokens: 120, completion_tokens: 8 }): ScriptedReply => ({
  status: 200,
  body: JSON.stringify({
    id: 'chatcmpl-504',
    object: 'chat.completion',
    model: 'deepseek/deepseek-flash-20261001',
    provider: 'DeepSeek',
    choices: [{ index: 0, ...choice }],
    usage: { ...usage, total_tokens: 128 },
  }),
})

const toolCallReply = replyOf({
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'tap', arguments: '{"locator":"Greet"}' } }],
  },
  finish_reason: 'tool_calls',
})

const textReply = replyOf({ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' })

const refusalReply = replyOf({
  message: { role: 'assistant', content: null, refusal: "I can't help with that" },
  finish_reason: 'stop',
})

const errorBody = (status: number, message: string, code: string | number): ScriptedReply => ({
  status,
  body: JSON.stringify({ error: { message, code } }),
})

const viaStub = (origin: string): Layer.Layer<HttpClient.HttpClient> =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function*() {
      const client = yield* HttpClient.HttpClient
      return HttpClient.mapRequest(client, (request) =>
        HttpClientRequest.setUrl(
          request,
          request.url.startsWith(`${OPENROUTER_ORIGIN}/`)
            ? request.url.replace(OPENROUTER_ORIGIN, origin)
            : `${origin}/unexpected-origin`,
        ))
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer))

interface CallPlan {
  readonly spec: (origin: string) => ModelSpec
  readonly replies: ReadonlyArray<ScriptedReply>
  readonly request?: ModelRequest
  readonly apiKey?: Option.Option<Redacted.Redacted<string>>
  readonly client?: (origin: string) => Layer.Layer<HttpClient.HttpClient>
}

interface Call {
  readonly outcome: Result.Result<ModelResponse, ModelFailure>
  readonly recorded: ReadonlyArray<RecordedRequest>
}

const gatewayOf = (plan: CallPlan, origin: string): Layer.Layer<ModelGateway> =>
  OpenAiCompatible.layer({
    model: plan.spec(origin),
    apiKey: plan.apiKey ?? Option.some(Redacted.make(API_KEY)),
  }).pipe(Layer.provide((plan.client ?? (() => FetchHttpClient.layer))(origin)))

const completed = (request: ModelRequest) =>
  Effect.gen(function*() {
    const gateway = yield* ModelGateway
    return yield* gateway.complete(request)
  })

const call = (plan: CallPlan): Effect.Effect<Call> =>
  Effect.scoped(Effect.gen(function*() {
    const stub = yield* openAiStub
    yield* stub.script(plan.replies)
    const outcome = yield* Effect.result(completed(plan.request ?? actRequest)).pipe(
      Effect.provide(gatewayOf(plan, stub.origin)),
    )
    return { outcome, recorded: yield* stub.recorded }
  }))

const buildOnly = (plan: CallPlan): Effect.Effect<ReadonlyArray<RecordedRequest>> =>
  Effect.scoped(Effect.gen(function*() {
    const stub = yield* openAiStub
    yield* Effect.provide(
      ModelGateway.use(() => Effect.void),
      gatewayOf(plan, stub.origin),
    )
    return yield* stub.recorded
  }))

interface Summary {
  readonly tag: string
  readonly text: string
}

const summaryOf = (outcome: Result.Result<ModelResponse, ModelFailure>): Summary =>
  Result.match(outcome, {
    onFailure: (failure) => ({ tag: failure._tag, text: JSON.stringify(failure.evidence) }),
    onSuccess: () => ({ tag: 'Success', text: '' }),
  })

const bodyOf = (recorded: ReadonlyArray<RecordedRequest>): Option.Option<Schema.Json> =>
  Schema.decodeOption(Schema.fromJsonString(Schema.Json))(recorded[0]?.body ?? '')

interface Captured {
  readonly spans: Array<Tracer.NativeSpan>
  readonly logs: Array<string>
}

const capturing = (captured: Captured) => <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.withTracer(Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options)
        captured.spans.push(span)
        return span
      },
    })),
    Effect.provideService(HttpClient.TracerHeaderFilter, () => true),
    Effect.provide(Logger.layer([Logger.make((options) => {
      captured.logs.push(JSON.stringify([options.message, String(options.cause)]))
    })])),
  )

const spanTextOf = (span: Tracer.NativeSpan): string =>
  JSON.stringify([span.name, [...span.attributes.entries()], span.events])

const encodedOf = (outcome: Result.Result<ModelResponse, ModelFailure>): string =>
  Result.match(outcome, {
    onFailure: (failure) => JSON.stringify(Schema.encodeOption(ModelFailure)(failure)),
    onSuccess: (response) => JSON.stringify(Schema.encodeOption(ModelResponse)(response)),
  })

const keyLeakRun = Effect.gen(function*() {
  const captured: Captured = { spans: [], logs: [] }
  const calls = yield* Effect.forEach(
    [[toolCallReply], [errorBody(401, `invalid key ${API_KEY}`, 401)], [refusalReply]],
    (replies) => capturing(captured)(call({ spec: compatibleSpec, replies })),
  )
  const produced = [
    ...captured.logs,
    ...captured.spans.map(spanTextOf),
    ...calls.map((each) => encodedOf(each.outcome)),
  ]
  return {
    authorization: calls.flatMap((each) => each.recorded.map((recorded) => recorded.authorization)),
    tags: calls.map((each) => summaryOf(each.outcome).tag),
    spans: captured.spans.length,
    capturedHeader: captured.spans.some((span) => span.attributes.has('http.request.header.authorization')),
    leaks: produced.filter((text) => text.includes(API_KEY)),
  }
})

Feature('Calling a model through the OpenAI-compatible gateway')
  .withLayer(Layer.empty)
  .live('every scenario talks to a real node:http stub over a loopback socket')
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'An OpenRouter tool call decodes with its usage, provider and served model',
      Gherkin.Do.pipe(
        Given('the stub answers one tool call for 120 input and 8 output tokens')(
          'plan',
          () => Effect.succeed<CallPlan>({ spec: () => openRouterSpec, replies: [toolCallReply], client: viaStub }),
        ),
        When('an act request goes to the OpenRouter gateway')('call', ({ plan }) => call(plan)),
        Then('the response is the metered tool call, sent to OpenRouter with the key as a bearer token')((
          state,
          expect,
        ) =>
          expect({
            response: Result.map(state.call.outcome, ({ latency: _latency, ...metered }) => metered),
            sent: state.call.recorded.map(({ method, path, authorization }) => ({ method, path, authorization })),
          }).toEqual({
            response: Result.succeed({
              answer: { _tag: 'ToolCalls', calls: [{ id: 'call_1', name: 'tap', arguments: { locator: 'Greet' } }] },
              finishReason: 'tool_calls',
              usage: { input: 120, output: 8 },
              served: { provider: 'openrouter', model: 'deepseek/deepseek-flash-20261001' },
            }),
            sent: [{ method: 'POST', path: '/api/v1/chat/completions', authorization: `Bearer ${API_KEY}` }],
          })
        ),
      ),
    )

    scenario(
      'A text answer decodes as text',
      Gherkin.Do.pipe(
        When('the stub answers "done" with no tool call')(
          'call',
          () => call({ spec: compatibleSpec, replies: [textReply] }),
        ),
        Then('the answer is the text and the provider is the base URL host')((state, expect) =>
          expect(Result.map(state.call.outcome, ({ answer, finishReason, served }) => ({
            answer,
            finishReason,
            provider: served.provider.startsWith('127.0.0.1:'),
          }))).toEqual(Result.succeed({ answer: { _tag: 'Text', text: 'done' }, finishReason: 'stop', provider: true }))
        ),
      ),
    )

    scenario(
      'An act request reaches the wire in the OpenAI chat-completions shape',
      Gherkin.Do.pipe(
        When('an act request with a screenshot goes to a custom base URL')(
          'call',
          () => call({ spec: compatibleSpec, replies: [textReply] }),
        ),
        Then(
          'a POST to <baseURL>/chat/completions carries the system message first, the tools, auto choice and temperature 0',
        )((
          state,
          expect,
        ) =>
          expect({
            sent: state.call.recorded.map(({ method, path }) => ({ method, path })),
            body: bodyOf(state.call.recorded),
          }).toEqual({
            sent: [{ method: 'POST', path: '/v1/chat/completions' }],
            body: Option.some({
              model: 'deepseek/deepseek-flash-latest',
              messages: [
                { role: 'system', content: 'You are a first-time customer.' },
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: 'press Greet' },
                    { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
                  ],
                },
              ],
              tools: [{
                type: 'function',
                function: {
                  name: 'tap',
                  description: 'Tap a control',
                  parameters: { type: 'object', properties: { locator: { type: 'string' } }, required: ['locator'] },
                },
              }],
              tool_choice: 'auto',
              temperature: 0,
              max_tokens: 256,
            }),
          })
        ),
      ),
    )

    scenario(
      'A judgment forces its one tool',
      Gherkin.Do.pipe(
        When('a judgment request naming resolve_check goes out')(
          'call',
          () => call({ spec: compatibleSpec, replies: [textReply], request: judgmentRequest }),
        ),
        Then('the tool choice names resolve_check')((state, expect) =>
          expect(bodyOf(state.call.recorded)).toMatchObject({
            value: { tool_choice: { type: 'function', function: { name: 'resolve_check' } } },
          })
        ),
      ),
    )

    scenarioOutline(
      'A rejected request is a provider failure, never a product failure',
      [
        { status: 400, body: errorBody(400, 'bad request', 400) },
        { status: 401, body: errorBody(401, 'No auth credentials found', 401) },
        { status: 403, body: errorBody(403, 'key disabled', 403) },
        { status: 404, body: errorBody(404, 'no such model', 'model_not_found') },
        { status: 429, body: errorBody(429, 'rate limited', 'rate_limit_exceeded') },
        { status: 500, body: errorBody(500, 'internal error', 500) },
        { status: 502, body: { status: 502, body: '<html>Bad gateway</html>' } },
        { status: 503, body: errorBody(503, 'no provider available', 503) },
      ],
      ({ status, body }) =>
        Gherkin.Do.pipe(
          When('the stub answers that status')('call', () => call({ spec: compatibleSpec, replies: [body] })),
          Then('the call fails MODEL_PROVIDER_FAILED with the status in its evidence')((state, expect) =>
            expect(summaryOf(state.call.outcome)).toMatchObject({
              tag: 'MODEL_PROVIDER_FAILED',
              text: expect.stringContaining(`answered ${status}`),
            })
          ),
        ),
    )

    scenario(
      'An unreachable provider is a provider failure',
      Gherkin.Do.pipe(
        Given('an origin that refuses connections')('origin', () => refusedOrigin),
        When('a request goes to it')('call', ({ origin }) => call({ spec: () => compatibleSpec(origin), replies: [] })),
        Then('the call fails MODEL_PROVIDER_FAILED')((state, expect) =>
          expect(summaryOf(state.call.outcome).tag).toBe('MODEL_PROVIDER_FAILED')
        ),
      ),
    )

    scenarioOutline(
      'A 2xx answer the gateway cannot accept fails with its model failure',
      [
        { shape: 'a refusal', reply: refusalReply, tag: 'MODEL_REFUSED' },
        {
          shape: 'a content filter',
          reply: replyOf({ message: { role: 'assistant', content: '' }, finish_reason: 'content_filter' }),
          tag: 'MODEL_REFUSED',
        },
        {
          shape: 'an error finish',
          reply: replyOf({ message: { role: 'assistant', content: '' }, finish_reason: 'error' }),
          tag: 'MODEL_PROVIDER_FAILED',
        },
        {
          shape: 'undecodable tool arguments',
          reply: replyOf({
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'tap', arguments: '{not json' } }],
            },
            finish_reason: 'tool_calls',
          }),
          tag: 'MODEL_OUTPUT_INVALID',
        },
        {
          shape: 'no choices',
          reply: { status: 200, body: JSON.stringify({ model: 'm', choices: [], usage: { prompt_tokens: 1 } }) },
          tag: 'MODEL_OUTPUT_INVALID',
        },
        {
          shape: 'no usage',
          reply: {
            status: 200,
            body: JSON.stringify({
              model: 'm',
              choices: [{ message: { content: 'done' }, finish_reason: 'stop' }],
            }),
          },
          tag: 'MODEL_OUTPUT_INVALID',
        },
        {
          shape: 'neither text nor a tool call',
          reply: replyOf({ message: { role: 'assistant', content: '' }, finish_reason: 'stop' }),
          tag: 'MODEL_OUTPUT_INVALID',
        },
      ],
      ({ reply, tag }) =>
        Gherkin.Do.pipe(
          When('the stub answers that body with a 200')('call', () => call({ spec: compatibleSpec, replies: [reply] })),
          Then('the call fails with the model failure for that answer')((state, expect) =>
            expect(summaryOf(state.call.outcome).tag).toBe(tag)
          ),
        ),
    )

    scenarioOutline(
      'An oversized context is CONTEXT_OVERFLOW',
      [
        { signal: 'a 413', spec: compatibleSpec, replies: [errorBody(413, 'payload too large', 413)], sent: 1 },
        {
          signal: 'context_length_exceeded',
          spec: compatibleSpec,
          replies: [errorBody(400, 'maximum context length is 8192 tokens', 'context_length_exceeded')],
          sent: 1,
        },
        { signal: 'the configured input budget', spec: budgetedSpec, replies: [textReply], sent: 0 },
      ],
      ({ spec, replies, sent }) =>
        Gherkin.Do.pipe(
          When('a long request meets that signal')('call', () => call({ spec, replies, request: longRequest })),
          Then('the call fails CONTEXT_OVERFLOW')((state, expect) =>
            expect({ tag: summaryOf(state.call.outcome).tag, sent: state.call.recorded.length })
              .toEqual({ tag: 'CONTEXT_OVERFLOW', sent })
          ),
        ),
    )

    scenario(
      'A missing key fails the call that needed it, naming the variable, and sends nothing',
      Gherkin.Do.pipe(
        When('a request goes out with no key resolved for ACME_API_KEY')(
          'call',
          () => call({ spec: compatibleSpec, replies: [textReply], apiKey: Option.none() }),
        ),
        Then('the call fails MODEL_PROVIDER_FAILED naming ACME_API_KEY and the stub saw nothing')((state, expect) =>
          expect({ summary: summaryOf(state.call.outcome), sent: state.call.recorded.length }).toMatchObject({
            summary: { tag: 'MODEL_PROVIDER_FAILED', text: expect.stringContaining('ACME_API_KEY') },
            sent: 0,
          })
        ),
      ),
    )

    scenario(
      'A suite that never calls the model sends nothing and needs no key',
      Gherkin.Do.pipe(
        When('the gateway is built with no key and never asked to complete')(
          'recorded',
          () => buildOnly({ spec: compatibleSpec, replies: [], apiKey: Option.none() }),
        ),
        Then('the stub received zero requests')((state, expect) => expect(state.recorded).toEqual([])),
      ),
    )

    scenario(
      'The API key reaches only the Authorization header',
      Gherkin.Do.pipe(
        When('a tool call, a 401 that echoes the key, and a refusal run under a capturing tracer and logger')(
          'run',
          () => keyLeakRun,
        ),
        Then('each request carried the key as its bearer token, and no log, span, response or failure holds it')((
          state,
          expect,
        ) =>
          expect({
            authorization: state.run.authorization,
            tags: state.run.tags,
            traced: state.run.spans > 0,
            capturedHeader: state.run.capturedHeader,
            leaks: state.run.leaks,
          }).toEqual({
            authorization: [`Bearer ${API_KEY}`, `Bearer ${API_KEY}`, `Bearer ${API_KEY}`],
            tags: ['Success', 'MODEL_PROVIDER_FAILED', 'MODEL_REFUSED'],
            traced: true,
            capturedHeader: true,
            leaks: [],
          })
        ),
      ),
    )
  })
