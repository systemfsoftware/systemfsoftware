import { Array as Arr, Boolean as Bool, Crypto, Effect, type Layer, Option, Result, Schema } from 'effect'
import { HttpRouter, type HttpServerRequest, HttpServerResponse } from 'effect/http'
import { OpenApi } from 'effect/http-api'
import { Contract } from '../../mod.js'
import { documentedApiOf, methodOf, pathOf } from './api.js'
import { cacheHeadersOf, etagOf, matchesEtag } from './cache.js'
import { type HttpReply, replyOf } from './status.js'

const anonymous = new Contract.Anonymous({})

const asJsonText = (text: string): Option.Option<Schema.Json> =>
  Option.flatMap(
    Schema.decodeOption(Schema.fromJsonString(Schema.Unknown))(text),
    Schema.decodeUnknownOption(Schema.Json),
  )

const queryValue = (raw: string): Schema.Json => Option.getOrElse(asJsonText(raw), () => raw)

const queryValueOf = (values: ReadonlyArray<string>): Schema.Json =>
  Arr.match(values, {
    onEmpty: () => '',
    onNonEmpty: (nonEmpty) => nonEmpty.length === 1 ? queryValue(nonEmpty[0]) : Arr.map(nonEmpty, queryValue),
  })

const queryInputOf = (contract: Contract.Any, url: URL): Schema.Json =>
  Object.fromEntries(
    Arr.getSomes(
      Arr.map(Object.keys(contract.input.fields), (field) => {
        const values = url.searchParams.getAll(field)
        return values.length === 0 ? Option.none() : Option.some([field, queryValueOf(values)] as const)
      }),
    ),
  )

const bodyInputOf = (text: string): Schema.Json => {
  const trimmed = text.trim()
  return trimmed === '' ? {} : Option.getOrElse(asJsonText(trimmed), () => ({}))
}

const inputOf = (
  contract: Contract.Any,
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<Schema.Json, never> =>
  Schema.is(Contract.Read)(contract.access)
    ? Effect.succeed(queryInputOf(contract, new URL(request.url, 'http://localhost')))
    : Effect.map(Effect.orDie(request.text), bodyInputOf)

const jsonResponse = (
  status: number,
  headers: Readonly<Record<string, string>>,
  body: string,
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.text(body, { status, headers, contentType: 'application/json' })

const unavailableReply = (
  unavailable: Contract.Unavailable,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never> =>
  Effect.map(
    Effect.orDie(Schema.encodeUnknownEffect(Contract.Unavailable)(unavailable)),
    (body) => jsonResponse(503, { 'cache-control': 'no-store' }, JSON.stringify(body)),
  )

const responseOf = (
  reply: HttpReply,
  headers: Readonly<Record<string, string>>,
): HttpServerResponse.HttpServerResponse => jsonResponse(reply.status, { ...headers, ...reply.headers }, reply.body)

const answerHeaders = (contract: Contract.Any, status: number): Readonly<Record<string, string>> =>
  Bool.every([Schema.is(Contract.Read)(contract.access), status === 200])
    ? cacheHeadersOf({ access: contract.access, exposure: contract.exposure })
    : { 'cache-control': 'no-store' }

const completedRead = (contract: Contract.Any, status: number): boolean =>
  Bool.every([Schema.is(Contract.Read)(contract.access), status === 200])

const respondWithValidator = (
  reply: HttpReply,
  headers: Readonly<Record<string, string>>,
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, Crypto.Crypto> =>
  Effect.gen(function*() {
    const etag = yield* Effect.orDie(etagOf(reply.body))
    const tagged = { ...headers, etag }
    return yield* matchesEtag({ ifNoneMatch: request.headers['if-none-match'], etag })
      ? Effect.succeed(HttpServerResponse.empty({ status: 304, headers: tagged }))
      : Effect.succeed(jsonResponse(reply.status, tagged, reply.body))
  })

const finalized = (
  reply: HttpReply,
  headers: Readonly<Record<string, string>>,
  request: HttpServerRequest.HttpServerRequest,
  contract: Contract.Any,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, Crypto.Crypto> =>
  completedRead(contract, reply.status)
    ? respondWithValidator(reply, headers, request)
    : Effect.succeed(responseOf(reply, headers))

const answerReply = (
  contract: Contract.Any,
  request: HttpServerRequest.HttpServerRequest,
  answer: Contract.Answer,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, Crypto.Crypto> =>
  Effect.gen(function*() {
    const reply = yield* Effect.orDie(replyOf({ contract, answer }))
    return yield* finalized(reply, answerHeaders(contract, reply.status), request, contract)
  })

const respond = <R>(
  contract: Contract.Any,
  cell: {
    readonly run: (
      invocation: Contract.Invocation,
    ) => Effect.Effect<Contract.Answer, Contract.Unavailable, R>
  },
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, R | Crypto.Crypto> =>
  Effect.gen(function*() {
    const input = yield* inputOf(contract, request)
    const result = yield* Effect.result(cell.run({ input, principal: anonymous }))
    return yield* Result.match(result, {
      onFailure: unavailableReply,
      onSuccess: (answer) => answerReply(contract, request, answer),
    })
  })

export interface MountableCapability<R = never> {
  readonly contract: Contract.Any
  readonly cell: Contract.CellOf<Contract.Any, R>
}

export const mount = <R = never>(registry: Readonly<Record<string, MountableCapability<R>>>): {
  readonly document: OpenApi.OpenAPISpec
  readonly layer: Layer.Layer<
    never,
    never,
    HttpRouter.HttpRouter | HttpRouter.Request.From<'Requires', R | Crypto.Crypto>
  >
} => {
  const document = OpenApi.fromApi(documentedApiOf(registry))
  return {
    document,
    layer: HttpRouter.use((router) =>
      Effect.all([
        router.add('GET', '/openapi.json', HttpServerResponse.jsonUnsafe(document)),
        Effect.forEach(Object.values(registry), (capability) => {
          const path = pathOf(capability.contract.name)
          const documented = router.add(methodOf(capability.contract.access), path, (request) =>
            respond(capability.contract, capability.cell, request))
          return Schema.is(Contract.Read)(capability.contract.access)
            ? Effect.all([
              documented,
              router.add('POST', path, () =>
                Effect.succeed(HttpServerResponse.empty({ status: 405 }))),
            ], { discard: true })
            : documented
        }),
      ], { discard: true })
    ),
  }
}
