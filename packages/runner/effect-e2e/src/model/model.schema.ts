import * as Schema from 'effect/Schema'

import { ModelRef } from '../verdict/check.schema.js'
import { ContextOverflow, ModelOutputInvalid, ModelProviderFailed, ModelRefused } from '../verdict/failure.schema.js'
import { Count, TokenUsage } from '../verdict/step-record.schema.js'

const Name = Schema.String.check(Schema.isMinLength(1, { message: 'a name has at least one character' }))

export const ToolName = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_-]{1,64}$/u, { message: 'a tool name is 1-64 letters, digits, `_` or `-`' }),
)

const PositiveTokens = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1, { message: 'a token budget is a whole number of at least 1' }),
)

export const ImageMediaType = Schema.Literals(['image/png', 'image/jpeg', 'image/webp'])
export type ImageMediaType = typeof ImageMediaType.Type

export const ContentPart = Schema.Union([
  Schema.TaggedStruct('TextPart', { text: Schema.String }),
  Schema.TaggedStruct('ImagePart', {
    mediaType: ImageMediaType,
    data: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9+/]*={0,2}$/u, { message: 'image data is base64' })),
  }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type ContentPart = typeof ContentPart.Type

export const ToolCall = Schema.Struct({ id: Name, name: ToolName, arguments: Schema.JsonObject })
export type ToolCall = typeof ToolCall.Type

export const Message = Schema.Union([
  Schema.TaggedStruct('UserMessage', { content: Schema.NonEmptyArray(ContentPart) }),
  Schema.TaggedStruct('AssistantMessage', { text: Schema.String, toolCalls: Schema.Array(ToolCall) }),
  Schema.TaggedStruct('ToolMessage', { toolCallId: Name, content: Schema.String }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type Message = typeof Message.Type

export const ToolDefinition = Schema.Struct({
  name: ToolName,
  description: Schema.String,
  parameters: Schema.JsonObject,
})
export type ToolDefinition = typeof ToolDefinition.Type

export const ToolChoice = Schema.Union([
  Schema.TaggedStruct('AutoTool', {}),
  Schema.TaggedStruct('NamedTool', { name: ToolName }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type ToolChoice = typeof ToolChoice.Type

export const ModelRequest = Schema.Struct({
  model: Name,
  system: Schema.String,
  messages: Schema.Array(Message),
  tools: Schema.Array(ToolDefinition),
  toolChoice: ToolChoice,
  temperature: Schema.Literal(0),
  maxOutputTokens: PositiveTokens,
})
export type ModelRequest = typeof ModelRequest.Type

export const FinishReason = Schema.Literals(['stop', 'length', 'tool_calls', 'other'])
export type FinishReason = typeof FinishReason.Type

export const ModelAnswer = Schema.Union([
  Schema.TaggedStruct('ToolCalls', { calls: Schema.NonEmptyArray(ToolCall) }),
  Schema.TaggedStruct('Text', { text: Name }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type ModelAnswer = typeof ModelAnswer.Type

export const ModelResponse = Schema.Struct({
  answer: ModelAnswer,
  finishReason: FinishReason,
  usage: TokenUsage,
  served: ModelRef,
  latency: Schema.Duration,
})
export type ModelResponse = typeof ModelResponse.Type

export const ModelFailure = Schema.Union([ModelProviderFailed, ModelRefused, ModelOutputInvalid, ContextOverflow])
export type ModelFailure = typeof ModelFailure.Type

export const ReplyFinish = Schema.Literals(['stop', 'length', 'tool_calls', 'content_filter', 'error', 'other'])
export type ReplyFinish = typeof ReplyFinish.Type

export const ProviderError = Schema.Struct({ code: Schema.NullOr(Schema.String), message: Schema.String })
export type ProviderError = typeof ProviderError.Type

export const Answered = Schema.TaggedStruct('Answered', {
  model: Schema.String,
  text: Schema.NullOr(Schema.String),
  refusal: Schema.NullOr(Schema.String),
  toolCalls: Schema.Array(ToolCall),
  finish: ReplyFinish,
  usage: TokenUsage,
})
export type Answered = typeof Answered.Type

export const Rejected = Schema.TaggedStruct('Rejected', { status: Count, ...ProviderError.fields })
export type Rejected = typeof Rejected.Type

export const ProviderReply = Schema.Union([Answered, Rejected]).pipe(Schema.toTaggedUnion('_tag'))
export type ProviderReply = typeof ProviderReply.Type

const BYTES_PER_TOKEN = 4

export const estimateInputTokens = (request: ModelRequest): number =>
  Math.ceil(
    new TextEncoder().encode(JSON.stringify([request.system, request.messages, request.tools])).length /
      BYTES_PER_TOKEN,
  )
