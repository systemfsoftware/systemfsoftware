import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'

import {
  type ContentPart,
  FinishReason,
  ImageMediaType,
  type Message,
  ModelAnswer,
  ModelRequest,
  ToolCall,
  ToolChoice,
  ToolDefinition,
} from '../model/model.schema.js'
import { ModelRef } from '../verdict/check.schema.js'
import { Count, StepId, TokenUsage } from '../verdict/step-record.schema.js'

export const TracedContentPart = Schema.Union([
  Schema.TaggedStruct('TextPart', { text: Schema.String }),
  Schema.TaggedStruct('ImagePart', { mediaType: ImageMediaType, bytes: Count }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type TracedContentPart = typeof TracedContentPart.Type

export const TracedMessage = Schema.Union([
  Schema.TaggedStruct('UserMessage', { content: Schema.NonEmptyArray(TracedContentPart) }),
  Schema.TaggedStruct('AssistantMessage', { text: Schema.String, toolCalls: Schema.Array(ToolCall) }),
  Schema.TaggedStruct('ToolMessage', { toolCallId: ToolCall.fields.id, content: Schema.String }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type TracedMessage = typeof TracedMessage.Type

export const TracedRequest = Schema.Struct({
  model: ModelRequest.fields.model,
  system: ModelRequest.fields.system,
  messages: Schema.Array(TracedMessage),
  tools: Schema.Array(ToolDefinition),
  toolChoice: ToolChoice,
  maxOutputTokens: ModelRequest.fields.maxOutputTokens,
})
export type TracedRequest = typeof TracedRequest.Type

const LatencyMillis = Schema.Finite.check(
  Schema.isGreaterThanOrEqualTo(0, { message: 'a latency is zero or more milliseconds' }),
)

const Answered = Schema.TaggedStruct('Answered', {
  answer: ModelAnswer,
  finishReason: FinishReason,
  usage: TokenUsage,
  served: ModelRef,
  latencyMillis: LatencyMillis,
})

const FailureCode = Schema.Literals([
  'MODEL_PROVIDER_FAILED',
  'MODEL_REFUSED',
  'MODEL_OUTPUT_INVALID',
  'CONTEXT_OVERFLOW',
])

const Failed = Schema.TaggedStruct('Failed', { code: FailureCode, message: Schema.String })

const Interrupted = Schema.TaggedStruct('Interrupted', {})

const Died = Schema.TaggedStruct('Died', { cause: Schema.String })

export const CallOutcome = Schema.Union([Answered, Failed, Interrupted, Died]).pipe(Schema.toTaggedUnion('_tag'))
export type CallOutcome = typeof CallOutcome.Type

export const ModelCall = Schema.Struct({ step: StepId, request: TracedRequest, outcome: CallOutcome })
export type ModelCall = typeof ModelCall.Type

/**
 * The `ai-trace.json` document of one try (design §13.3): every model call it made, per step, with an image
 * recorded as its byte count and every string left for the writer to mask.
 */
export const AiTrace = Schema.Struct({
  schema: Schema.Literal('ai-trace-1'),
  test: Schema.Struct({ id: Schema.String, title: Schema.String }),
  target: Schema.String,
  agent: Schema.String,
  retry: Count,
  calls: Schema.Array(ModelCall),
})
export type AiTrace = typeof AiTrace.Type

const BASE64_QUAD = 4
const BASE64_QUAD_BYTES = 3

/** A base64 quad carries three bytes, and its trailing `=` padding carries none; nothing is decoded. */
const decodedByteLengthOf = (base64: string): number => {
  const padding = base64.length - base64.replace(/=+$/u, '').length
  return (base64.length / BASE64_QUAD) * BASE64_QUAD_BYTES - padding
}

const tracedContentPartOf = (part: ContentPart): TracedContentPart =>
  Match.valueTags(part, {
    TextPart: ({ text }): TracedContentPart => ({ _tag: 'TextPart', text }),
    ImagePart: ({ mediaType, data }): TracedContentPart => ({
      _tag: 'ImagePart',
      mediaType,
      bytes: decodedByteLengthOf(data),
    }),
  })

const tracedMessageOf = (message: Message): TracedMessage =>
  Match.valueTags(message, {
    UserMessage: ({ content }): TracedMessage => ({
      _tag: 'UserMessage',
      content: Arr.map(content, tracedContentPartOf),
    }),
    AssistantMessage: ({ text, toolCalls }): TracedMessage => ({ _tag: 'AssistantMessage', text, toolCalls }),
    ToolMessage: ({ toolCallId, content }): TracedMessage => ({ _tag: 'ToolMessage', toolCallId, content }),
  })

export const tracedRequestOf = (request: ModelRequest): TracedRequest => ({
  model: request.model,
  system: request.system,
  messages: Arr.map(request.messages, tracedMessageOf),
  tools: request.tools,
  toolChoice: request.toolChoice,
  maxOutputTokens: request.maxOutputTokens,
})
