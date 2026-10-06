import { Effect, HashSet, Match, Option, Ref, Result, Schema } from 'effect'
import { Base64 } from 'effect/encoding'
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http'
import { type ExtensionCapabilityId, ExtensionError, ExtensionResult, ServerExtensions } from './extension.schema.js'

export const SESSION_HEADER = 'mcp-session-id'

const PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion'
const CLIENT_CAPABILITIES_META_KEY = 'io.modelcontextprotocol/clientCapabilities'
const BASE64_SENTINEL_PREFIX = '=?base64?'
const BASE64_SENTINEL_SUFFIX = '?='
const HEADER_MISMATCH_ERROR_CODE = -32020
const PRINTABLE_HEADER_VALUE = /^[\t\x20-\x7e]*$/

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Match.value(Array.isArray(value) || value === null).pipe(
    Match.when(true, () => false),
    Match.orElse(() => typeof value === 'object'),
  )

const asObject = (value: Schema.Json): Option.Option<Schema.JsonObject> =>
  Option.filter(Option.some(value), isJsonObject)

const fieldOf = (object: Schema.JsonObject, key: string): Schema.Json | undefined => object[key]

const stringFieldOf = (object: Schema.JsonObject, key: string): Option.Option<string> =>
  Schema.decodeUnknownOption(Schema.String)(object[key] ?? null)

const metaOf = (params: Schema.JsonObject): Option.Option<Schema.JsonObject> =>
  Option.flatMap(Option.fromUndefinedOr(fieldOf(params, '_meta')), asObject)

const metaFieldOf = (params: Option.Option<Schema.JsonObject>, key: string): Option.Option<Schema.Json> =>
  Option.flatMap(params, (value) => Option.flatMap(metaOf(value), (meta) => Option.fromUndefinedOr(fieldOf(meta, key))))

const clientCapabilitiesOf = (params: Option.Option<Schema.JsonObject>): Option.Option<Schema.JsonObject> =>
  Option.flatMap(metaFieldOf(params, CLIENT_CAPABILITIES_META_KEY), asObject)

const protocolVersionOf = (params: Option.Option<Schema.JsonObject>): Option.Option<string> =>
  Option.flatMap(
    metaFieldOf(params, PROTOCOL_VERSION_META_KEY),
    (value) => Schema.decodeUnknownOption(Schema.String)(value ?? null),
  )

/**
 * The `Mcp-Name` source field per SEP-2243, extended with the SEP-2663 tasks
 * methods, which route on `params.taskId`.
 */
const ROUTING_NAME_KEYS: Readonly<Record<string, string>> = {
  'tools/call': 'name',
  'prompts/get': 'name',
  'resources/read': 'uri',
  'tasks/get': 'taskId',
  'tasks/update': 'taskId',
  'tasks/cancel': 'taskId',
}

const routingHeaderDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

const decodeRoutingBytes = (bytes: Uint8Array): Option.Option<string> => {
  try {
    return Option.some(routingHeaderDecoder.decode(bytes))
  } catch {
    return Option.none()
  }
}

const decodeRoutingHeader = (value: string): Option.Option<string> =>
  Match.value(value.startsWith(BASE64_SENTINEL_PREFIX) && value.endsWith(BASE64_SENTINEL_SUFFIX)).pipe(
    Match.when(true, () =>
      Result.match(
        Base64.decode(value.slice(BASE64_SENTINEL_PREFIX.length, -BASE64_SENTINEL_SUFFIX.length)),
        { onFailure: () => Option.none<string>(), onSuccess: decodeRoutingBytes },
      )),
    Match.orElse(() => (PRINTABLE_HEADER_VALUE.test(value) ? Option.some(value) : Option.none())),
  )

const routingNameOf = (method: string, params: Option.Option<Schema.JsonObject>): Option.Option<string> =>
  Option.flatMap(
    Option.fromUndefinedOr(ROUTING_NAME_KEYS[method]),
    (key) => Option.flatMap(params, (value) => stringFieldOf(value, key)),
  )

const routingHeadersMatch = (
  headers: Readonly<Record<string, string>>,
  method: string,
  params: Option.Option<Schema.JsonObject>,
): boolean =>
  headers['mcp-method'] === method &&
  Option.match(routingNameOf(method, params), {
    onNone: () => ROUTING_NAME_KEYS[method] === undefined,
    onSome: (name) =>
      Option.match(Option.fromUndefinedOr(headers['mcp-name']), {
        onNone: () => false,
        onSome: (header) =>
          Option.match(decodeRoutingHeader(header), { onNone: () => false, onSome: (decoded) => decoded === name }),
      }),
  })

const decodeRequestBody = (text: string): Option.Option<Schema.JsonObject> =>
  Schema.decodeOption(Schema.fromJsonString(Schema.JsonObject))(text)

interface JsonRpcRequest {
  readonly method: string
  readonly id: string | number
  readonly params: Option.Option<Schema.JsonObject>
}

const jsonRpcRequestOf = (body: Schema.JsonObject): Option.Option<JsonRpcRequest> => {
  const method = fieldOf(body, 'method')
  return Option.flatMap(
    Schema.decodeUnknownOption(Schema.Union([Schema.String, Schema.Finite]))(fieldOf(body, 'id') ?? null),
    (id): Option.Option<JsonRpcRequest> =>
      typeof method === 'string'
        ? Option.some({
          method,
          id,
          params: Option.flatMap(Option.fromUndefinedOr(fieldOf(body, 'params')), asObject),
        })
        : Option.none(),
  )
}

/**
 * A capability an extension advertises under `capabilities.extensions`; SEP-2133
 * places the settings object inline under the identifier, with no envelope.
 */
export interface McpExtensionCapability {
  readonly id: ExtensionCapabilityId
  readonly settings: Schema.JsonObject
}

export const ExtensionResponseTag = { _tag: 'ExtensionResponse' } as const
export type ExtensionResponseTag = typeof ExtensionResponseTag

/** A reply the extension already framed, such as an SSE stream. */
export interface ExtensionResponse extends ExtensionResponseTag {
  readonly response: HttpServerResponse.HttpServerResponse
}

export type McpExtensionReply =
  | Schema.Schema.Type<typeof ExtensionResult>
  | Schema.Schema.Type<typeof ExtensionError>
  | ExtensionResponse

/** The decoded JSON-RPC request an extension is offered. */
export interface McpExtensionRequest {
  readonly method: string
  readonly id: string | number
  readonly params: Option.Option<Schema.JsonObject>
  readonly clientCapabilities: Option.Option<Schema.JsonObject>
  readonly protocolVersion: Option.Option<string>
  readonly sessionId: Option.Option<string>
  readonly headers: Readonly<Record<string, string>>
}

/**
 * Protocol support an extension adds alongside the MCP surface: the capability
 * it advertises, and a handler for the requests it owns. `None` delegates to
 * the `effect/ai` runtime, so an extension only shadows what it implements.
 */
export interface McpExtension {
  readonly capability?: McpExtensionCapability | undefined
  readonly handle: (request: McpExtensionRequest) => Effect.Effect<Option.Option<McpExtensionReply>, never>
}

const extensionRequestOf = (
  request: HttpServerRequest.HttpServerRequest,
  rpc: JsonRpcRequest,
): McpExtensionRequest => ({
  method: rpc.method,
  id: rpc.id,
  params: rpc.params,
  clientCapabilities: clientCapabilitiesOf(rpc.params),
  protocolVersion: protocolVersionOf(rpc.params),
  sessionId: Option.fromUndefinedOr(request.headers[SESSION_HEADER]),
  headers: request.headers,
})

const offerToExtensions = (
  request: HttpServerRequest.HttpServerRequest,
  rpc: JsonRpcRequest,
  extensions: ReadonlyArray<McpExtension>,
): Effect.Effect<Option.Option<McpExtensionReply>, never> =>
  Effect.reduce(
    extensions,
    () => Option.none<McpExtensionReply>(),
    (found, extension) =>
      Option.isSome(found) ? Effect.succeed(found) : extension.handle(extensionRequestOf(request, rpc)),
  )

interface ClaimedRequest {
  readonly rpc: JsonRpcRequest
  readonly reply: McpExtensionReply
}

const claimRequest = (
  request: HttpServerRequest.HttpServerRequest,
  extensions: ReadonlyArray<McpExtension>,
): Effect.Effect<Option.Option<ClaimedRequest>, never> =>
  Effect.gen(function*() {
    const text = yield* Effect.orDie(request.text)
    const decoded = Option.flatMap(decodeRequestBody(text), jsonRpcRequestOf)
    return yield* Option.match(decoded, {
      onNone: () => Effect.succeed(Option.none<ClaimedRequest>()),
      onSome: (rpc) =>
        Effect.map(
          offerToExtensions(request, rpc, extensions),
          Option.map((reply): ClaimedRequest => ({ rpc, reply })),
        ),
    })
  })

const routingSatisfied = (request: HttpServerRequest.HttpServerRequest, rpc: JsonRpcRequest): boolean =>
  Match.value(Option.isSome(protocolVersionOf(rpc.params))).pipe(
    Match.when(true, () => routingHeadersMatch(request.headers, rpc.method, rpc.params)),
    Match.orElse(() => true),
  )

const errorBodyOf = (
  id: string | number,
  code: number,
  message: string,
  data: Schema.Json | undefined,
): Schema.JsonObject => ({
  jsonrpc: '2.0',
  id,
  error: { code, message, ...(data === undefined ? {} : { data }) },
})

const replyResponse = (
  id: string | number,
  reply: McpExtensionReply,
): HttpServerResponse.HttpServerResponse =>
  Match.value(reply).pipe(
    Match.tag(
      'ExtensionResult',
      (value) => HttpServerResponse.jsonUnsafe({ jsonrpc: '2.0', id, result: value.result }),
    ),
    Match.tag(
      'ExtensionError',
      (value) => HttpServerResponse.jsonUnsafe(errorBodyOf(id, value.code, value.message, value.data)),
    ),
    Match.tag('ExtensionResponse', (value) => value.response),
    Match.exhaustive,
  )

/**
 * Terminates a session on `DELETE` and answers 404 for any later request bearing
 * that session id, which is the streamable-HTTP session lifecycle.
 */
export const sessionLifecycleMiddleware = () =>
  HttpRouter.middleware(
    Effect.gen(function*() {
      const terminated = yield* Ref.make(HashSet.empty<string>())
      return (httpEffect) =>
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const sessionId = Option.fromUndefinedOr(request.headers[SESSION_HEADER])
          const deleteRequest = Match.value(request.method).pipe(
            Match.when('DELETE', () => sessionId),
            Match.orElse(() => Option.none<string>()),
          )
          return yield* Option.match(deleteRequest, {
            onSome: (id) =>
              Effect.as(Ref.update(terminated, HashSet.add(id)), HttpServerResponse.empty({ status: 204 })),
            onNone: () =>
              Effect.flatMap(Ref.get(terminated), (sessions) =>
                Option.match(sessionId, {
                  onNone: () => httpEffect,
                  onSome: (id) =>
                    HashSet.has(sessions, id)
                      ? Effect.succeed(HttpServerResponse.empty({ status: 404 }))
                      : httpEffect,
                })),
          })
        })
    }),
  )

/** Offers each POST to the extensions and frames whatever one of them claims. */
export const extensionMiddleware = (extensions: ReadonlyArray<McpExtension>) =>
  HttpRouter.middleware(
    Effect.succeed((httpEffect) =>
      Effect.gen(function*() {
        const request = yield* HttpServerRequest.HttpServerRequest
        const claimed = yield* Match.value(request.method).pipe(
          Match.when('POST', () => claimRequest(request, extensions)),
          Match.orElse(() => Effect.succeed(Option.none<ClaimedRequest>())),
        )
        return yield* Option.match(claimed, {
          onNone: () => httpEffect,
          onSome: (value) =>
            Match.value(routingSatisfied(request, value.rpc)).pipe(
              Match.when(true, () => Effect.succeed(replyResponse(value.rpc.id, value.reply))),
              Match.orElse(() =>
                Effect.succeed(
                  HttpServerResponse.jsonUnsafe(
                    errorBodyOf(
                      value.rpc.id,
                      HEADER_MISMATCH_ERROR_CODE,
                      'Mcp-Method/Mcp-Name header does not match the request',
                      undefined,
                    ),
                    { status: 400 },
                  ),
                )
              ),
            ),
        })
      })
    ),
  )

/** The advertised `capabilities.extensions` map, or `None` when unauthored. */
export const extensionsOf = (
  extensions: ReadonlyArray<McpExtension> | undefined,
): Option.Option<ServerExtensions> =>
  Option.flatMap(Option.fromUndefinedOr(extensions), (list) =>
    Option.filter(
      Schema.decodeOption(ServerExtensions)(
        Object.fromEntries(
          list.flatMap((extension) =>
            Option.match(Option.fromUndefinedOr(extension.capability), {
              onNone: (): ReadonlyArray<readonly [string, Schema.JsonObject]> => [],
              onSome: (capability) => [[capability.id, capability.settings] as const],
            })
          ),
        ),
      ),
      (declared) => Object.keys(declared).length > 0,
    ))
