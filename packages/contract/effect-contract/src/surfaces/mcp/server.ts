import { Boolean as Bool, Effect, Layer, Match, Option, Result, Schema } from 'effect'
import { McpProtocol, McpServer } from 'effect/ai'
import { dual } from 'effect/Function'
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http'
import { Contract, Principal } from '../../mod.js'
import { type AuthChallenge, challengeOf, challengeResponse, requiredScopeOf } from './auth.js'
import { McpConfirmationKey } from './confirmation-state.js'
import { protectedResourceMetadata, protectedResourcePaths } from './protected-resource.schema.js'
import { type Capabilities, principalMetaKey, registerTools } from './toolkit.js'

export interface McpServerOptions<R> {
  readonly name?: string | undefined
  readonly version?: string | undefined
  readonly path?: HttpRouter.PathInput | undefined
  readonly protocols?: readonly [McpProtocol.ProtocolAdapter, ...ReadonlyArray<McpProtocol.ProtocolAdapter>] | undefined
  readonly allowedOrigins?: ReadonlyArray<string> | undefined
  readonly resourceUrl: string
  readonly authorizationServers?: ReadonlyArray<string> | undefined
  readonly scopesSupported?: ReadonlyArray<Contract.Scope> | undefined
  readonly resourceName?: string | undefined
  readonly resourceDocumentation?: string | undefined
  readonly provide: Layer.Layer<R | McpConfirmationKey | Principal.TokenVerifier>
}

const bearerOf = (authorization: string | undefined): Option.Option<string> =>
  Option.flatMap(
    Option.fromNullishOr(authorization),
    (header) => Option.fromNullishOr(/^\s*Bearer\s+(.+)$/i.exec(header)?.[1]),
  )

const asObject = (value: Schema.Json): Option.Option<Schema.JsonObject> =>
  Schema.decodeUnknownOption(Schema.JsonObject)(value)

const parsedBody = (body: string): Option.Option<Schema.JsonObject> =>
  Option.flatMap(Schema.decodeOption(Schema.fromJsonString(Schema.Json))(body), asObject)

const fieldOf = (object: Schema.JsonObject, key: string): Schema.Json | undefined => object[key]

const stringFieldOf = (object: Schema.JsonObject, key: string): Option.Option<string> =>
  Schema.decodeUnknownOption(Schema.String)(fieldOf(object, key) ?? null)

const toolNameOf = (body: string): Option.Option<string> =>
  Option.flatMap(parsedBody(body), (message) =>
    Option.flatMap(
      Option.filter(stringFieldOf(message, 'method'), (method) => method === 'tools/call'),
      () => Option.flatMap(asObject(fieldOf(message, 'params') ?? null), (params) => stringFieldOf(params, 'name')),
    ))

const withEntry = (object: Schema.JsonObject, key: string, value: Schema.Json): Schema.JsonObject => {
  const entries: ReadonlyArray<readonly [string, Schema.Json]> = [[key, value], ...Object.entries(object)]
  return Object.fromEntries(entries)
}

const orDefault = <A>(value: A | undefined, fallback: A): A =>
  Option.getOrElse(Option.fromUndefinedOr(value), () => fallback)

const stampedMeta = (metadata: Schema.Json | undefined, principal: Schema.Json): Schema.JsonObject =>
  withEntry(
    Option.getOrElse(Option.flatMap(Option.fromNullishOr(metadata), asObject), () => ({})),
    principalMetaKey,
    principal,
  )

const stampedBody = (body: string, principal: Schema.Json): string =>
  Option.match(parsedBody(body), {
    onNone: () => body,
    onSome: (message) =>
      Option.match(asObject(fieldOf(message, 'params') ?? null), {
        onNone: () => body,
        onSome: (params) =>
          JSON.stringify(
            withEntry(message, 'params', withEntry(params, '_meta', stampedMeta(fieldOf(params, '_meta'), principal))),
          ),
      }),
  })

const bodylessMethods: ReadonlyArray<string> = ['GET', 'HEAD']

const hasBody = (method: string): boolean => !bodylessMethods.includes(method)

const requestInitOf = (
  request: HttpServerRequest.HttpServerRequest,
  body: string,
): RequestInit =>
  Match.value(request.method).pipe(
    Match.when(hasBody, () => ({ method: request.method, headers: request.headers, body })),
    Match.orElse(() => ({ method: request.method, headers: request.headers })),
  )

const securedRequest = (
  request: HttpServerRequest.HttpServerRequest,
  principal: Principal.Principal,
): Effect.Effect<HttpServerRequest.HttpServerRequest, never> =>
  Effect.orDie(Effect.gen(function*() {
    const body = yield* request.text
    const encoded = yield* Schema.encodeUnknownEffect(Schema.toCodecJson(Principal.Principal))(principal)
    return HttpServerRequest.fromWeb(
      new Request(request.originalUrl, requestInitOf(request, stampedBody(body, encoded))),
    )
  }))

const challengeResponseOf = (challenge: AuthChallenge): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.fromWeb(challengeResponse(challenge))

const authorizeRequest = (
  contract: Contract.Any,
  principal: Principal.Principal,
): Principal.AuthorizationVerdict =>
  Result.match(
    Principal.authorizeRequest(
      new Principal.AuthorizeRequest({
        exposure: contract.exposure,
        access: contract.access,
        principal,
      }),
    ),
    { onFailure: () => new Principal.Admit(), onSuccess: (verdict) => verdict },
  )

const challengeFor = (
  contract: Contract.Any,
  verdict: Principal.TokenVerdict,
  principal: Principal.Principal,
  resourceMetadata: string,
): Option.Option<AuthChallenge> =>
  Match.value(authorizeRequest(contract, principal)).pipe(
    Match.tag('Admit', () => Option.none<AuthChallenge>()),
    Match.tag('Unauthenticated', () => Option.some(challengeOf(verdict, { resourceMetadata }))),
    Match.tag('Forbidden', () =>
      Option.some(challengeOf(verdict, {
        resourceMetadata,
        requiredScope: Option.getOrUndefined(requiredScopeOf(contract.access)),
      }))),
    Match.exhaustive,
  )

const authorize = <R>(
  registry: Capabilities<R>,
  body: string,
  verdict: Principal.TokenVerdict,
  principal: Principal.Principal,
  resourceMetadata: string,
): Option.Option<AuthChallenge> =>
  Option.flatMap(
    toolNameOf(body),
    (name) =>
      Option.flatMap(Option.fromNullishOr(registry[name]), (capability) =>
        challengeFor(capability.contract, verdict, principal, resourceMetadata)),
  )

const handleAuthorized = <R, E>(
  registry: Capabilities<R>,
  resourceMetadata: string,
  verdict: Principal.TokenVerdict,
  principal: Principal.Principal,
  httpEffect: Effect.Effect<HttpServerResponse.HttpServerResponse, E>,
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<HttpServerResponse.HttpServerResponse, E> =>
  Effect.gen(function*() {
    const body = yield* Effect.orDie(request.text)
    return yield* Option.match(authorize(registry, body, verdict, principal, resourceMetadata), {
      onNone: () =>
        Option.match(toolNameOf(body), {
          onNone: () => Effect.provideService(httpEffect, HttpServerRequest.HttpServerRequest, request),
          onSome: () =>
            Effect.flatMap(
              securedRequest(request, principal),
              (rebuilt) => Effect.provideService(httpEffect, HttpServerRequest.HttpServerRequest, rebuilt),
            ),
        }),
      onSome: (challenge) => Effect.succeed(challengeResponseOf(challenge)),
    })
  })

const authenticatedOrChallenge = (
  verdict: Principal.TokenVerdict,
  tokenPresent: boolean,
  resourceMetadata: string,
): Result.Result<Principal.Principal, AuthChallenge> =>
  Bool.every([tokenPresent, Bool.not(Schema.is(Principal.TokenVerified)(verdict))])
    ? Result.fail(challengeOf(verdict, { resourceMetadata }))
    : Result.succeed(Principal.toPrincipal(verdict))

const authMiddleware = <R>(registry: Capabilities<R>, resourceMetadata: string) =>
  HttpRouter.middleware(
    Effect.gen(function*() {
      const verifier = yield* Principal.TokenVerifier
      return (httpEffect) =>
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const token = bearerOf(request.headers['authorization'])
          const verified = yield* Effect.result(verifier.verify(Option.getOrUndefined(token)))
          return yield* Result.match(verified, {
            onFailure: () => Effect.succeed(HttpServerResponse.empty({ status: 503 })),
            onSuccess: (verdict) =>
              Result.match(authenticatedOrChallenge(verdict, Option.isSome(token), resourceMetadata), {
                onFailure: (challenge) => Effect.succeed(challengeResponseOf(challenge)),
                onSuccess: (principal) =>
                  handleAuthorized(registry, resourceMetadata, verdict, principal, httpEffect, request),
              }),
          })
        })
    }),
  )

const nonEmptyProtocols = (
  protocols: readonly [McpProtocol.ProtocolAdapter, ...ReadonlyArray<McpProtocol.ProtocolAdapter>] | undefined,
): readonly [McpProtocol.ProtocolAdapter, ...ReadonlyArray<McpProtocol.ProtocolAdapter>] =>
  Option.getOrElse(
    Option.fromUndefinedOr(protocols),
    (): readonly [
      McpProtocol.ProtocolAdapter,
      ...ReadonlyArray<McpProtocol.ProtocolAdapter>,
    ] => [McpProtocol.v2026_07_28],
  )

const metadataOf = <R>(options: McpServerOptions<R>) =>
  protectedResourceMetadata({
    resource: options.resourceUrl,
    authorizationServers: orDefault(options.authorizationServers, []),
    scopes: orDefault(options.scopesSupported, []),
    name: orDefault(options.resourceName, 'contract'),
    documentation: options.resourceDocumentation,
  })

const httpOptionsOf = <R>(options: McpServerOptions<R>) => ({
  name: orDefault(options.name, 'contract'),
  version: orDefault(options.version, '0.1.0'),
  path: orDefault(options.path, '/mcp'),
  protocols: nonEmptyProtocols(options.protocols),
  allowedOrigins: options.allowedOrigins,
})

export interface McpLayer {
  <R>(registry: Capabilities<R>, options: McpServerOptions<R>): Layer.Layer<never, never, HttpRouter.HttpRouter>
  <R>(options: McpServerOptions<R>): (registry: Capabilities<R>) => Layer.Layer<never, never, HttpRouter.HttpRouter>
}

export const layer: McpLayer = dual(2, <R>(
  registry: Capabilities<R>,
  options: McpServerOptions<R>,
): Layer.Layer<never, never, HttpRouter.HttpRouter> => {
  const metadata = metadataOf(options)
  const routerLayer = Layer.orDie(
    McpServer.layerHttp(httpOptionsOf(options)).pipe(
      Layer.provide(Layer.provide(authMiddleware(registry, options.resourceUrl).layer, options.provide)),
    ),
  )
  const registration = Layer.provide(Layer.effectDiscard(registerTools(registry)), routerLayer)
  const routes = Layer.mergeAll(
    registration,
    ...protectedResourcePaths('mcp').map((path) =>
      HttpRouter.add('GET', path, HttpServerResponse.jsonUnsafe(metadata))
    ),
  )
  return Layer.provide(routes, options.provide)
})
