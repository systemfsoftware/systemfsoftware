import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'
import * as SchemaIssue from 'effect/SchemaIssue'
import * as SchemaTransformation from 'effect/SchemaTransformation'

import { Count } from '../verdict/step-record.schema.js'
import {
  Answered,
  ContentPart,
  ImageMediaType,
  Message,
  ModelRequest,
  ProviderError,
  ReplyFinish,
  ToolCall,
  type ToolChoice,
  type ToolDefinition,
} from './model.schema.js'

const WireFunctionCall = Schema.Struct({
  id: Schema.String,
  type: Schema.optionalKey(Schema.Literal('function')),
  function: Schema.Struct({ name: Schema.String, arguments: Schema.fromJsonString(Schema.JsonObject) }),
})

export const OpenAiToolCall: Schema.Codec<ToolCall, typeof WireFunctionCall.Encoded> = WireFunctionCall.pipe(
  Schema.decodeTo(
    ToolCall,
    SchemaTransformation.transform({
      decode: (wire) => ({ id: wire.id, name: wire.function.name, arguments: wire.function.arguments }),
      encode: (call) => ({
        id: call.id,
        type: 'function' as const,
        function: { name: call.name, arguments: call.arguments },
      }),
    }),
  ),
)

const WireTextPart = Schema.Struct({ type: Schema.Literal('text'), text: Schema.String })

const WireImagePart = Schema.Struct({
  type: Schema.Literal('image_url'),
  image_url: Schema.Struct({ url: Schema.String }),
})

const WirePart = Schema.Union([WireTextPart, WireImagePart])

const DATA_URL = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/u

const NOT_A_DATA_URL = 'an image part is a base64 data URL of a png, jpeg or webp image'

const imagePartOf = (url: string): Option.Option<ContentPart> =>
  Option.fromNullishOr(DATA_URL.exec(url)).pipe(
    Option.flatMap(([, mediaType, data]) =>
      Option.map(
        Schema.decodeUnknownOption(ImageMediaType)(mediaType),
        (decoded): ContentPart => ({ _tag: 'ImagePart', mediaType: decoded, data: data ?? '' }),
      )
    ),
  )

const partOfWire = (part: typeof WirePart.Type): Option.Option<ContentPart> =>
  Match.value(part).pipe(
    Match.when({ type: 'text' }, (text): Option.Option<ContentPart> =>
      Option.some({ _tag: 'TextPart', text: text.text })),
    Match.when({ type: 'image_url' }, (image) =>
      imagePartOf(image.image_url.url)),
    Match.exhaustive,
  )

const wireOfPart = (part: ContentPart): typeof WirePart.Type =>
  Match.valueTags(part, {
    TextPart: (text): typeof WirePart.Type => ({ type: 'text', text: text.text }),
    ImagePart: (image): typeof WirePart.Type => ({
      type: 'image_url',
      image_url: { url: `data:${image.mediaType};base64,${image.data}` },
    }),
  })

export const OpenAiContentPart: Schema.Codec<ContentPart, typeof WirePart.Encoded> = WirePart.pipe(
  Schema.decodeTo(ContentPart, {
    decode: SchemaGetter.transformEffect((part) =>
      Effect.fromOption(partOfWire(part)).pipe(
        Effect.mapError(() => new SchemaIssue.InvalidValue({ message: NOT_A_DATA_URL })),
      )
    ),
    encode: SchemaGetter.transform(wireOfPart),
  }),
)

const WireUserMessage = Schema.Struct({
  role: Schema.Literal('user'),
  content: Schema.NonEmptyArray(OpenAiContentPart),
})

const WireAssistantMessage = Schema.Struct({
  role: Schema.Literal('assistant'),
  content: Schema.NullOr(Schema.String),
  tool_calls: OpenAiToolCall.pipe(Schema.NonEmptyArray, Schema.optionalKey),
})

const WireToolMessage = Schema.Struct({
  role: Schema.Literal('tool'),
  tool_call_id: Schema.String,
  content: Schema.String,
})

const WireMessage = Schema.Union([WireUserMessage, WireAssistantMessage, WireToolMessage])

const assistantTextOfWire = (content: string | null): string => content ?? ''

const toolCallsOfWire = (calls: ReadonlyArray<ToolCall> | undefined): ReadonlyArray<ToolCall> => calls ?? []

const assistantOfWire = (assistant: typeof WireAssistantMessage.Type): Message => ({
  _tag: 'AssistantMessage',
  text: assistantTextOfWire(assistant.content),
  toolCalls: toolCallsOfWire(assistant.tool_calls),
})

const messageOfWire = (wire: typeof WireMessage.Type): Message =>
  Match.value(wire).pipe(
    Match.when({ role: 'user' }, (user): Message => ({ _tag: 'UserMessage', content: user.content })),
    Match.when({ role: 'assistant' }, assistantOfWire),
    Match.when({ role: 'tool' }, (tool): Message => ({
      _tag: 'ToolMessage',
      toolCallId: tool.tool_call_id,
      content: tool.content,
    })),
    Match.exhaustive,
  )

const toolCallsOnWire = (calls: ReadonlyArray<ToolCall>) =>
  Arr.isReadonlyArrayNonEmpty(calls) ? { tool_calls: calls } : {}

const wireOfMessage = (message: Message): typeof WireMessage.Type =>
  Match.valueTags(message, {
    UserMessage: (user): typeof WireMessage.Type => ({ role: 'user', content: user.content }),
    AssistantMessage: (assistant): typeof WireMessage.Type => ({
      role: 'assistant',
      content: assistant.text,
      ...toolCallsOnWire(assistant.toolCalls),
    }),
    ToolMessage: (tool): typeof WireMessage.Type => ({
      role: 'tool',
      tool_call_id: tool.toolCallId,
      content: tool.content,
    }),
  })

export const OpenAiMessage: Schema.Codec<Message, typeof WireMessage.Encoded> = WireMessage.pipe(
  Schema.decodeTo(Message, SchemaTransformation.transform({ decode: messageOfWire, encode: wireOfMessage })),
)

const WireSystemMessage = Schema.Struct({ role: Schema.Literal('system'), content: Schema.String })

const WireTool = Schema.Struct({
  type: Schema.Literal('function'),
  function: Schema.Struct({ name: Schema.String, description: Schema.String, parameters: Schema.JsonObject }),
})

const WireToolChoice = Schema.Union([
  Schema.Literal('auto'),
  Schema.Struct({ type: Schema.Literal('function'), function: Schema.Struct({ name: Schema.String }) }),
])

const WireRequest = Schema.Struct({
  model: Schema.String,
  messages: Schema.TupleWithRest(Schema.Tuple([WireSystemMessage]), [OpenAiMessage]),
  tools: WireTool.pipe(Schema.NonEmptyArray, Schema.optionalKey),
  tool_choice: Schema.optionalKey(WireToolChoice),
  temperature: Schema.Literal(0),
  max_tokens: Schema.Int,
})

const toolOfWire = (tool: typeof WireTool.Type): ToolDefinition => ({
  name: tool.function.name,
  description: tool.function.description,
  parameters: tool.function.parameters,
})

const wireOfTool = (tool: ToolDefinition): typeof WireTool.Type => ({
  type: 'function',
  function: { name: tool.name, description: tool.description, parameters: tool.parameters },
})

const toolChoiceOfWire = (choice: typeof WireToolChoice.Type | undefined): ToolChoice =>
  Match.value(choice).pipe(
    Match.when({ type: 'function' }, (named): ToolChoice => ({ _tag: 'NamedTool', name: named.function.name })),
    Match.orElse((): ToolChoice => ({ _tag: 'AutoTool' })),
  )

const toolsOnWire = (request: ModelRequest) =>
  Arr.isReadonlyArrayNonEmpty(request.tools)
    ? { tools: Arr.map(request.tools, wireOfTool), tool_choice: 'auto' as const }
    : {}

const toolChoiceOnWire = (request: ModelRequest) =>
  Match.valueTags(request.toolChoice, {
    AutoTool: () => toolsOnWire(request),
    NamedTool: (named) => ({
      ...toolsOnWire(request),
      tool_choice: { type: 'function' as const, function: { name: named.name } },
    }),
  })

const requestOfWire = (wire: typeof WireRequest.Type): typeof ModelRequest.Encoded => {
  const [system, ...messages] = wire.messages
  return {
    model: wire.model,
    system: system.content,
    messages,
    tools: Arr.map(wire.tools ?? [], toolOfWire),
    toolChoice: toolChoiceOfWire(wire.tool_choice),
    temperature: wire.temperature,
    maxOutputTokens: wire.max_tokens,
  }
}

const wireOfRequest = (request: ModelRequest): typeof WireRequest.Type => ({
  model: request.model,
  messages: [{ role: 'system', content: request.system }, ...request.messages],
  ...toolChoiceOnWire(request),
  temperature: request.temperature,
  max_tokens: request.maxOutputTokens,
})

export const ChatCompletionRequest: Schema.Codec<ModelRequest, typeof WireRequest.Encoded> = WireRequest.pipe(
  Schema.decodeTo(ModelRequest, SchemaTransformation.transform({ decode: requestOfWire, encode: wireOfRequest })),
)

const WireChoice = Schema.Struct({
  message: Schema.Struct({
    content: Schema.String.pipe(Schema.NullOr, Schema.optionalKey),
    refusal: Schema.String.pipe(Schema.NullOr, Schema.optionalKey),
    tool_calls: OpenAiToolCall.pipe(Schema.Array, Schema.optionalKey),
  }),
  finish_reason: Schema.NullOr(Schema.String),
})

const WireReply = Schema.Struct({
  model: Schema.String,
  choices: Schema.NonEmptyArray(WireChoice),
  usage: Schema.Struct({ prompt_tokens: Count, completion_tokens: Count }),
})

const finishOfWire = (reason: string | null): ReplyFinish =>
  Option.getOrElse(Schema.decodeUnknownOption(ReplyFinish)(reason), (): ReplyFinish => 'other')

const presentOrNull = (value: string | null | undefined): string | null => value ?? null

const answeredOfWire = (wire: typeof WireReply.Type): Answered => ({
  _tag: 'Answered',
  model: wire.model,
  text: presentOrNull(wire.choices[0].message.content),
  refusal: presentOrNull(wire.choices[0].message.refusal),
  toolCalls: toolCallsOfWire(wire.choices[0].message.tool_calls),
  finish: finishOfWire(wire.choices[0].finish_reason),
  usage: { input: wire.usage.prompt_tokens, output: wire.usage.completion_tokens },
})

const wireOfAnswered = (answered: Answered): typeof WireReply.Type => ({
  model: answered.model,
  choices: [{
    message: { content: answered.text, refusal: answered.refusal, tool_calls: answered.toolCalls },
    finish_reason: answered.finish,
  }],
  usage: { prompt_tokens: answered.usage.input, completion_tokens: answered.usage.output },
})

export const ChatCompletionReply: Schema.Codec<Answered, typeof WireReply.Encoded> = WireReply.pipe(
  Schema.decodeTo(Answered, SchemaTransformation.transform({ decode: answeredOfWire, encode: wireOfAnswered })),
)

const WireErrorBody = Schema.Struct({
  error: Schema.Struct({
    message: Schema.String,
    code: Schema.Union([Schema.String, Schema.Finite]).pipe(Schema.NullOr, Schema.optionalKey),
  }),
})

const codeOfWire = (code: string | number | null | undefined): string | null =>
  Match.value(code).pipe(
    Match.when(Match.number, (numeric) => String(numeric)),
    Match.when(Match.string, (text) => text),
    Match.orElse(() => null),
  )

export const ProviderErrorBody: Schema.Codec<ProviderError, typeof WireErrorBody.Encoded> = WireErrorBody.pipe(
  Schema.decodeTo(
    ProviderError,
    SchemaTransformation.transform({
      decode: (wire) => ({ code: codeOfWire(wire.error.code), message: wire.error.message }),
      encode: (error) => ({ error: { message: error.message, code: error.code } }),
    }),
  ),
)
