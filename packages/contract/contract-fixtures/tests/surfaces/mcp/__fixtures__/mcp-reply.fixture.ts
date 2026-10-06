import { Effect, Option, Schema } from 'effect'

export const ErrorReply = Schema.Struct({ error: Schema.Struct({ code: Schema.Finite, message: Schema.String }) })

export const ToolContent = Schema.Struct({ type: Schema.String, text: Schema.String })

export const ResultReply = Schema.Struct({
  result: Schema.Struct({
    resultType: Schema.optional(Schema.String),
    requestState: Schema.optional(Schema.String),
    content: Schema.optional(Schema.Array(ToolContent)),
  }),
})

export const ClaimsJson = Schema.fromJsonString(Schema.Struct({
  tool: Schema.String,
  digest: Schema.String,
  subject: Schema.String,
  expiresAt: Schema.Finite,
}))

export const JsonText = Schema.fromJsonString(Schema.Json)

export const UnavailableJson = Schema.TaggedStruct('Unavailable', { reason: Schema.String })

export const encodeJsonText = (value: Schema.Json): Effect.Effect<string> =>
  Effect.orDie(Schema.encodeEffect(JsonText)(value))

export const decodeJsonText = (text: string): Effect.Effect<Schema.Json> =>
  Effect.orDie(Schema.decodeEffect(JsonText)(text))

export const errorCodeOf = (json: Schema.Json): number | undefined =>
  Option.getOrUndefined(Option.map(Schema.decodeUnknownOption(ErrorReply)(json), (reply) => reply.error.code))

export const resultTypeOf = (json: Schema.Json): string | undefined =>
  Option.getOrUndefined(
    Option.flatMap(
      Schema.decodeUnknownOption(ResultReply)(json),
      (reply) => Option.fromUndefinedOr(reply.result.resultType),
    ),
  )

export const requestStateOf = (json: Schema.Json): string | undefined =>
  Option.getOrUndefined(
    Option.flatMap(
      Schema.decodeUnknownOption(ResultReply)(json),
      (reply) => Option.fromUndefinedOr(reply.result.requestState),
    ),
  )

export const textOf = (json: Schema.Json): string =>
  Option.getOrElse(
    Option.flatMap(
      Schema.decodeUnknownOption(ResultReply)(json),
      (reply) => Option.fromUndefinedOr(reply.result.content?.[0]?.text),
    ),
    () => '',
  )
