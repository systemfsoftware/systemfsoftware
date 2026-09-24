import { NodeCrypto, NodeHttpServer } from '@effect/platform-node'
import { Context, Effect, Layer, Option, Ref, Result, Schema } from 'effect'
import * as Crypto from 'effect/Crypto'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpServer from 'effect/unstable/http/HttpServer'
import type * as HttpServerError from 'effect/unstable/http/HttpServerError'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'
import * as NetAddress from 'effect/unstable/net/NetAddress'

export interface LoopbackReply {
  readonly status: number
  readonly body: Schema.Json
}

export interface RecordedRequest {
  readonly url: string
  readonly text: string
  readonly body: Schema.Json
}

type RequestRole = 'selector' | 'judge' | 'generator'

export interface QuestionKey {
  readonly role: RequestRole
  readonly contains: ReadonlyArray<string>
}

export interface ScriptedAnswer {
  readonly key: QuestionKey
  readonly reply: LoopbackReply
}

type RequestKeyOutcome = 'matched' | 'unmatched' | 'ambiguous' | 'ordered'

export interface RequestKeyRecord {
  readonly index: number
  readonly outcome: RequestKeyOutcome
  readonly key: QuestionKey | undefined
  readonly matchedCount: number
}

export interface OpenRouterLoopbackShape {
  readonly apiUrl: string
  readonly requests: Effect.Effect<ReadonlyArray<RecordedRequest>>
  readonly requestCount: Effect.Effect<number>
  readonly requestKeys: Effect.Effect<ReadonlyArray<RequestKeyRecord>>
  readonly answerWith: (replies: ReadonlyArray<LoopbackReply>) => Effect.Effect<void>
  readonly answerBy: (answers: ReadonlyArray<ScriptedAnswer>) => Effect.Effect<void>
}

export class OpenRouterLoopback extends Context.Service<OpenRouterLoopback, OpenRouterLoopbackShape>()(
  '@systemfsoftware/pack-eval/tests/__fixtures__/openrouter-loopback.fixture/OpenRouterLoopback',
) {}

const decodeJson = Schema.decodeEffect(Schema.fromJsonString(Schema.Json))

type Script =
  | Readonly<{ readonly kind: 'ordered'; readonly replies: ReadonlyArray<LoopbackReply> }>
  | Readonly<{ readonly kind: 'keyed'; readonly answers: ReadonlyArray<ScriptedAnswer> }>

const replyAt = (replies: ReadonlyArray<LoopbackReply>, index: number): LoopbackReply => {
  const last = replies.length - 1
  return replies[index <= last ? index : last] ?? { status: 500, body: { error: 'the loopback script has no replies' } }
}

const unmatchedReply: LoopbackReply = {
  status: 500,
  body: { error: 'no scripted answer matched this request' },
}

const ambiguousReply: LoopbackReply = {
  status: 500,
  body: { error: 'more than one scripted answer matched this request' },
}

const ChatRequest = Schema.Struct({
  messages: Schema.Array(Schema.Struct({
    role: Schema.String,
    content: Schema.Union([
      Schema.String,
      Schema.Array(Schema.Struct({ text: Schema.optional(Schema.String) })),
    ]),
  })),
})

const decodeChatRequest = Schema.decodeUnknownOption(ChatRequest)

const textOfContent = (
  content: string | ReadonlyArray<Readonly<{ readonly text?: string | undefined }>>,
): ReadonlyArray<string> =>
  typeof content === 'string'
    ? [content]
    : content.flatMap((part) => (part.text === undefined ? [] : [part.text]))

const promptOfBody = (body: Schema.Json): Option.Option<string> =>
  Option.map(
    decodeChatRequest(body),
    (request) => request.messages.flatMap((message) => textOfContent(message.content)).join('\n'),
  )

const judgedSectionOf = (prompt: string): string => {
  const sections = prompt.split(/(?=^Task: )/m).map((section) => section.trim()).filter((section) => section.length > 0)
  return sections[sections.length - 1] ?? prompt
}

const matchingScopeOf = (key: QuestionKey, prompt: string): string =>
  key.role === 'judge' ? judgedSectionOf(prompt) : prompt

const matchingAnswersOf = (
  answers: ReadonlyArray<ScriptedAnswer>,
  prompt: string,
): ReadonlyArray<ScriptedAnswer> =>
  answers.filter((answer) => answer.key.contains.every((value) => matchingScopeOf(answer.key, prompt).includes(value)))

interface ReplyOutcome {
  readonly reply: LoopbackReply
  readonly record: RequestKeyRecord
}

const keyedOutcomeOf = (
  answers: ReadonlyArray<ScriptedAnswer>,
  index: number,
  prompt: string,
): ReplyOutcome => {
  const matched = matchingAnswersOf(answers, prompt)
  const [first] = matched
  if (matched.length === 1 && first !== undefined) {
    return { reply: first.reply, record: { index, outcome: 'matched', key: first.key, matchedCount: 1 } }
  }
  return {
    reply: matched.length === 0 ? unmatchedReply : ambiguousReply,
    record: {
      index,
      outcome: matched.length === 0 ? 'unmatched' : 'ambiguous',
      key: undefined,
      matchedCount: matched.length,
    },
  }
}

const answering = (
  script: Ref.Ref<Script>,
  requests: Ref.Ref<ReadonlyArray<RecordedRequest>>,
  keys: Ref.Ref<ReadonlyArray<RequestKeyRecord>>,
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  HttpServerError.HttpServerError | Schema.SchemaError,
  HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function*() {
    const currentScript = yield* Ref.get(script)
    const request = yield* HttpServerRequest.HttpServerRequest
    const text = yield* request.text
    const body = yield* decodeJson(text)
    const index = yield* Ref.modify(requests, (all) => [
      all.length,
      [...all, { url: request.url, text, body }],
    ])
    const current = currentScript
    const outcome: ReplyOutcome = current.kind === 'ordered'
      ? {
        reply: replyAt(current.replies, index),
        record: { index, outcome: 'ordered', key: undefined, matchedCount: 0 },
      }
      : keyedOutcomeOf(
        current.answers,
        index,
        Option.getOrElse(promptOfBody(body), () => text),
      )
    yield* Ref.update(keys, (all) => [...all, outcome.record])
    return HttpServerResponse.setStatus(HttpServerResponse.jsonUnsafe(outcome.reply.body), outcome.reply.status)
  })

const baseUrlOf = (address: NetAddress.InetAddress): string => {
  const url = Result.getOrThrow(NetAddress.toUrl(address))
  if (NetAddress.isUnspecified(address.address)) {
    url.hostname = NetAddress.formatIp(NetAddress.ipv4Loopback)
  }
  return url.origin
}

const serving = Layer.effect(
  OpenRouterLoopback,
  Effect.gen(function*() {
    const server = yield* HttpServer.HttpServer
    const script = yield* Ref.make<Script>({ kind: 'ordered', replies: [] })
    const requests = yield* Ref.make<ReadonlyArray<RecordedRequest>>([])
    const keys = yield* Ref.make<ReadonlyArray<RequestKeyRecord>>([])
    yield* server.serve(answering(script, requests, keys))
    if (NetAddress.isUnixPathAddress(server.address)) {
      return yield* Effect.die(new Error('the loopback provider listened on a unix socket'))
    }
    return {
      apiUrl: `${baseUrlOf(server.address)}/api/v1`,
      requests: Ref.get(requests),
      requestCount: Effect.map(Ref.get(requests), (all) => all.length),
      requestKeys: Ref.get(keys),
      answerWith: (replies: ReadonlyArray<LoopbackReply>) => Ref.set(script, { kind: 'ordered', replies }),
      answerBy: (answers: ReadonlyArray<ScriptedAnswer>) => Ref.set(script, { kind: 'keyed', answers }),
    }
  }),
)

export const openRouterLoopback: Layer.Layer<
  OpenRouterLoopback | Crypto.Crypto | FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
> = Layer.orDie(Layer.provideMerge(serving, Layer.mergeAll(NodeHttpServer.layerTest, NodeCrypto.layer)))
