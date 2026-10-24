import {
  type ModelFailure,
  ModelGateway,
  type ModelRequest,
  type ModelResponse,
  type ModelSpec,
  OpenAiCompatible,
} from '@systemfsoftware/effect-e2e/model'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { openAiStub, type RecordedRequest, type ScriptedReply } from './__fixtures__/openai-stub.fixture.js'

const Feature = makeFeature({ it })

const API_KEY = 'sk-test-622-1c7f52a34b9e'

const spec: (origin: string) => ModelSpec = (origin) => ({
  gateway: 'openai-compatible',
  baseURL: `${origin}/v1`,
  model: 'acme/chat-1',
  apiKeyEnv: 'ACME_API_KEY',
  vision: false,
})

const TAP_CALL = { id: 'call_1', name: 'tap', arguments: { locator: 'Greet' } }

const TAP_DEFINITION = {
  name: 'tap',
  description: 'Tap a control',
  parameters: { type: 'object', properties: { locator: { type: 'string' } }, required: ['locator'] },
}

const replyOf = (finishReason: string, content: string | null): ScriptedReply => ({
  status: 200,
  body: JSON.stringify({
    id: 'chatcmpl-622',
    object: 'chat.completion',
    model: 'acme/chat-1',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
  }),
})

interface Sent {
  readonly outcome: Result.Result<ModelResponse, ModelFailure>
  readonly body: Option.Option<Schema.Json>
}

const gatewayOf = (origin: string): Layer.Layer<ModelGateway> =>
  OpenAiCompatible.layer({ model: spec(origin), apiKey: Option.some(Redacted.make(API_KEY)) }).pipe(
    Layer.provide(FetchHttpClient.layer),
  )

const sendsWith = (reply: ScriptedReply): (request: ModelRequest) => Effect.Effect<Sent> => (request) =>
  Effect.scoped(Effect.gen(function*() {
    const stub = yield* openAiStub
    yield* stub.script([reply])
    const outcome = yield* Effect.result(
      Effect.flatMap(ModelGateway, (gateway) => gateway.complete(request)),
    ).pipe(Effect.provide(gatewayOf(stub.origin)))
    const recorded: ReadonlyArray<RecordedRequest> = yield* stub.recorded
    const body = Option.flatMap(
      Option.fromNullishOr(recorded[0]),
      (first) => Schema.decodeOption(Schema.fromJsonString(Schema.Json))(first.body),
    )
    return { outcome, body }
  }))

const requestWith = (
  messages: ModelRequest['messages'],
  tools: ModelRequest['tools'],
  toolChoice: ModelRequest['toolChoice'],
): ModelRequest => ({
  model: 'acme/chat-1',
  system: 'You are a clerk.',
  messages,
  tools,
  toolChoice,
  temperature: 0,
  maxOutputTokens: 64,
})

const SYSTEM_ON_WIRE = { role: 'system', content: 'You are a clerk.' }

const TAP_ON_WIRE = {
  id: 'call_1',
  type: 'function',
  function: { name: 'tap', arguments: '{"locator":"Greet"}' },
}

const userTurn = (text: string) => [{ type: 'text', text }]

Feature('Talking to an OpenAI-compatible model service with a tool-carrying conversation')
  .withLayer(Layer.empty)
  .live('every scenario talks to a real node:http stub over a loopback socket')
  .body(({ scenario }) => {
    scenario(
      'An assistant turn that only called a tool is sent as empty text',
      Gherkin.Do.pipe(
        Given('the conversation carries an assistant turn with no text and one tool call')(
          'request',
          () =>
            Effect.succeed(requestWith(
              [{ _tag: 'AssistantMessage', text: '', toolCalls: [TAP_CALL] }],
              [TAP_DEFINITION],
              { _tag: 'AutoTool' },
            )),
        ),
        When('the conversation is sent to the model service')(
          'sent',
          ({ request }) => sendsWith(replyOf('stop', 'done'))(request),
        ),
        Then('the service receives the turn as empty text beside its tool call')((state, expect) =>
          expect(Option.getOrThrow(state.sent.body)).toEqual({
            model: 'acme/chat-1',
            messages: [SYSTEM_ON_WIRE, { role: 'assistant', content: '', tool_calls: [TAP_ON_WIRE] }],
            tools: [{ type: 'function', function: TAP_DEFINITION }],
            tool_choice: 'auto',
            temperature: 0,
            max_tokens: 64,
          })
        ),
      ),
    )

    scenario(
      'An automatic tool choice is left out when no tools travel with it',
      Gherkin.Do.pipe(
        Given('the conversation continues with no tools offered')(
          'request',
          () =>
            Effect.succeed(requestWith(
              [{ _tag: 'UserMessage', content: [{ _tag: 'TextPart', text: 'continue' }] }],
              [],
              { _tag: 'AutoTool' },
            )),
        ),
        When('the conversation is sent to the model service')(
          'sent',
          ({ request }) => sendsWith(replyOf('stop', 'done'))(request),
        ),
        Then('the service receives the conversation with neither tools nor a tool choice')((state, expect) =>
          expect({
            body: Option.getOrThrow(state.sent.body),
            outcome: state.sent.outcome._tag,
          }).toEqual({
            body: {
              model: 'acme/chat-1',
              messages: [SYSTEM_ON_WIRE, { role: 'user', content: userTurn('continue') }],
              temperature: 0,
              max_tokens: 64,
            },
            outcome: 'Success',
          })
        ),
      ),
    )

    scenario(
      'An automatic tool choice travels beside its tools',
      Gherkin.Do.pipe(
        Given('the conversation offers one tool and lets the model choose it')(
          'request',
          () =>
            Effect.succeed(requestWith(
              [{ _tag: 'UserMessage', content: [{ _tag: 'TextPart', text: 'continue' }] }],
              [TAP_DEFINITION],
              { _tag: 'AutoTool' },
            )),
        ),
        When('the conversation is sent to the model service')(
          'sent',
          ({ request }) => sendsWith(replyOf('stop', 'done'))(request),
        ),
        Then('the service receives the tools marked as chosen automatically')((state, expect) =>
          expect(Option.getOrThrow(state.sent.body)).toEqual({
            model: 'acme/chat-1',
            messages: [SYSTEM_ON_WIRE, { role: 'user', content: userTurn('continue') }],
            tools: [{ type: 'function', function: TAP_DEFINITION }],
            tool_choice: 'auto',
            temperature: 0,
            max_tokens: 64,
          })
        ),
      ),
    )

    scenario(
      'A named tool choice travels without tools',
      Gherkin.Do.pipe(
        Given('the conversation insists on one named check even though no tools are offered')(
          'request',
          () =>
            Effect.succeed(requestWith(
              [{ _tag: 'UserMessage', content: [{ _tag: 'TextPart', text: 'settle this' }] }],
              [],
              { _tag: 'NamedTool', name: 'resolve_check' },
            )),
        ),
        When('the conversation is sent to the model service')(
          'sent',
          ({ request }) => sendsWith(replyOf('stop', 'done'))(request),
        ),
        Then('the service receives the named check as the tool choice')((state, expect) =>
          expect(Option.getOrThrow(state.sent.body)).toEqual({
            model: 'acme/chat-1',
            messages: [SYSTEM_ON_WIRE, { role: 'user', content: userTurn('settle this') }],
            tool_choice: { type: 'function', function: { name: 'resolve_check' } },
            temperature: 0,
            max_tokens: 64,
          })
        ),
      ),
    )

    scenario(
      'A finish reason the service did not name is treated as any other',
      Gherkin.Do.pipe(
        Given('the conversation carries one user turn')(
          'request',
          () =>
            Effect.succeed(requestWith(
              [{ _tag: 'UserMessage', content: [{ _tag: 'TextPart', text: 'go on' }] }],
              [],
              { _tag: 'AutoTool' },
            )),
        ),
        When('the service answers with a finish reason of "mystery"')(
          'sent',
          ({ request }) => sendsWith(replyOf('mystery', 'done'))(request),
        ),
        Then('the answer finishes as any other finish')((state, expect) =>
          expect(Result.map(state.sent.outcome, ({ answer, finishReason }) => ({ answer, finishReason }))).toEqual(
            Result.succeed({ answer: { _tag: 'Text', text: 'done' }, finishReason: 'other' }),
          )
        ),
      ),
    )
  })
