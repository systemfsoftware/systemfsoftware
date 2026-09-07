/**
 * Connects typed `HttpApi` clients to atoms.
 *
 * The service created here exposes the generated HTTP API client plus
 * atom-based query and mutation helpers. Query atoms call endpoints and track
 * their asynchronous result, while mutations run endpoint calls that can
 * invalidate reactivity keys after a successful request. Query atoms can also be
 * cached, serialized for hydration, and kept alive with a time-to-live.
 *
 * @since 4.0.0
 */
import * as Context from 'effect/Context'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import type { ReadonlyRecord } from 'effect/Record'
import * as Schema from 'effect/Schema'
import type { Simplify } from 'effect/Types'
import type * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpClientError from 'effect/unstable/http/HttpClientError'
import type { HttpClientResponse } from 'effect/unstable/http/HttpClientResponse'
import type * as HttpApi from 'effect/unstable/httpapi/HttpApi'
import * as HttpApiClient from 'effect/unstable/httpapi/HttpApiClient'
import * as HttpApiEndpoint from 'effect/unstable/httpapi/HttpApiEndpoint'
import type * as HttpApiGroup from 'effect/unstable/httpapi/HttpApiGroup'
import type * as HttpApiMiddleware from 'effect/unstable/httpapi/HttpApiMiddleware'
import * as HttpApiSchema from 'effect/unstable/httpapi/HttpApiSchema'
import * as Reactivity from 'effect/unstable/reactivity/Reactivity'
import * as Atom from './Atom.js'
import { UnknownApiGroupError, UnknownEndpointError, type UnknownHttpApiError } from './AtomHttpApi.schema.js'
import * as AsyncResult from './Result.js'
import { schemaCodec } from './ResultSchema.js'
// rc.108 does not expose HttpApiEndpoint.getSuccessSchemas/getErrorSchemas (added upstream
// after rc.108); replicate them against the public .success/.error schema sets.
const getSuccessSchemas = (endpoint: HttpApiEndpoint.Top): readonly [Schema.Top, ...Array<Schema.Top>] => {
  const [first, ...rest] = Array.from(endpoint.success)
  return Match.value(first).pipe(
    Match.when(undefined, (): readonly [Schema.Top, ...Array<Schema.Top>] => [HttpApiSchema.NoContent]),
    Match.orElse((head): readonly [Schema.Top, ...Array<Schema.Top>] => [head, ...rest]),
  )
}
const getErrorSchemas = (endpoint: HttpApiEndpoint.Top): readonly Schema.Top[] => Array.from(endpoint.error)

/**
 * A `Context.Service` for an HTTP API client integrated with atom reactivity.
 *
 * **Details**
 *
 * It exposes the generated HTTP API client, an atom runtime, mutation helpers that
 * return `AtomResultFn`s, and query helpers that return atoms of endpoint results.
 *
 * @category services
 * @since 4.0.0
 */
export interface AtomHttpApiClient<Self, Id extends string, Groups extends HttpApiGroup.Constraint>
  extends Context.Service<Self, HttpApiClient.Client<Groups, never, never>>
{
  new(_: never): Context.ServiceClass.Shape<Id, HttpApiClient.Client<Groups, never, never>>

  readonly runtime: Atom.AtomRuntime<Self>

  readonly mutation: <
    GroupIdentifier extends HttpApiGroup.Identifier<Groups>,
    EndpointIdentifier extends HttpApiEndpoint.Identifier<HttpApiGroup.Endpoints<Group>>,
    Group extends HttpApiGroup.WithIdentifier<Groups, GroupIdentifier> = HttpApiGroup.WithIdentifier<
      Groups,
      GroupIdentifier
    >,
    Endpoint extends HttpApiEndpoint.WithIdentifier<
      HttpApiGroup.Endpoints<Group>,
      EndpointIdentifier
    > = HttpApiEndpoint.WithIdentifier<
      HttpApiGroup.Endpoints<Group>,
      EndpointIdentifier
    >,
    const ResponseMode extends HttpApiEndpoint.ClientResponseMode = HttpApiEndpoint.ClientResponseMode,
  >(
    group: GroupIdentifier,
    endpoint: EndpointIdentifier,
    options?: {
      readonly responseMode?: ResponseMode | undefined
    },
  ) => [Endpoint] extends [
    HttpApiEndpoint.HttpApiEndpoint<
      infer _Identifier,
      infer _Method,
      infer _Path,
      infer _Params,
      infer _Query,
      infer _Payload,
      infer _Headers,
      infer _Success,
      infer _Error,
      infer _Middleware,
      infer _RE
    >,
  ] ? Atom.AtomResultFn<
      Simplify<
        HttpApiEndpoint.ClientRequest<_Params, _Query, _Payload, _Headers, 'decoded-only'> & {
          readonly reactivityKeys?: readonly unknown[] | ReadonlyRecord<string, readonly unknown[]> | undefined
        }
      >,
      ResponseByMode<Extract<_Success, Schema.Top>['Type'], ResponseMode>,
      ErrorByMode<_Error, _Middleware, ResponseMode>
    >
    : never

  readonly query: <
    GroupIdentifier extends HttpApiGroup.Identifier<Groups>,
    EndpointIdentifier extends HttpApiEndpoint.Identifier<HttpApiGroup.Endpoints<Group>>,
    Group extends HttpApiGroup.WithIdentifier<Groups, GroupIdentifier> = HttpApiGroup.WithIdentifier<
      Groups,
      GroupIdentifier
    >,
    Endpoint extends HttpApiEndpoint.WithIdentifier<
      HttpApiGroup.Endpoints<Group>,
      EndpointIdentifier
    > = HttpApiEndpoint.WithIdentifier<
      HttpApiGroup.Endpoints<Group>,
      EndpointIdentifier
    >,
    const ResponseMode extends HttpApiEndpoint.ClientResponseMode = 'decoded-only',
  >(
    group: GroupIdentifier,
    endpoint: EndpointIdentifier,
    request: [Endpoint] extends [
      HttpApiEndpoint.HttpApiEndpoint<
        infer _Identifier,
        infer _Method,
        infer _Path,
        infer _Params,
        infer _Query,
        infer _Payload,
        infer _Headers,
        infer _Success,
        infer _Error,
        infer _R,
        infer _RE
      >,
    ] ? Simplify<
        HttpApiEndpoint.ClientRequest<_Params, _Query, _Payload, _Headers, ResponseMode> & {
          readonly reactivityKeys?:
            | readonly unknown[]
            | ReadonlyRecord<string, readonly unknown[]>
            | undefined
          readonly timeToLive?: Duration.Input | undefined
          readonly serializationKey?: string | undefined
        }
      >
      : never,
  ) => [Endpoint] extends [
    HttpApiEndpoint.HttpApiEndpoint<
      infer _Identifier,
      infer _Method,
      infer _Path,
      infer _Params,
      infer _Query,
      infer _Payload,
      infer _Headers,
      infer _Success,
      infer _Error,
      infer _Middleware,
      infer _RE
    >,
  ] ? Atom.Atom<
      AsyncResult.Result<
        ResponseByMode<Extract<_Success, Schema.Top>['Type'], ResponseMode>,
        ErrorByMode<_Error, _Middleware, ResponseMode>
      >
    >
    : never
}

declare global {
  interface ErrorConstructor {
    stackTraceLimit: number
  }
}

/**
 * Creates a `Context.Service` class for an HTTP API client backed by an atom
 * runtime.
 *
 * **Details**
 *
 * The options provide the API definition, HTTP client layer, optional client and
 * response transforms, base URL, and runtime factory used by the query and
 * mutation helpers.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Service =
  <Self>() =>
  <const Id extends string, ApiId extends string, Groups extends HttpApiGroup.Constraint>(
    id: Id,
    options: {
      readonly api: HttpApi.HttpApi<ApiId, Groups>
      readonly httpClient:
        | Layer.Layer<
          | HttpApiGroup.ClientServices<Groups>
          | HttpApiGroup.MiddlewareClient<Groups>
          | HttpClient.HttpClient
        >
        | ((get: Atom.AtomContext) => Layer.Layer<
          | HttpApiGroup.ClientServices<Groups>
          | HttpApiGroup.MiddlewareClient<Groups>
          | HttpClient.HttpClient
        >)
      readonly transformClient?: ((client: HttpClient.HttpClient) => HttpClient.HttpClient) | undefined
      readonly transformResponse?:
        | ((effect: Effect.Effect<unknown, unknown, unknown>) => Effect.Effect<unknown, unknown, unknown>)
        | undefined
      readonly baseUrl?: URL | string | undefined
      readonly runtime?: Atom.RuntimeFactory | undefined
    },
  ): AtomHttpApiClient<Self, Id, Groups> => {
    const service = Context.Service<
      Self,
      HttpApiClient.Client<Groups, never, never>
    >()(id)

    const layer = Layer.effect(
      service,
      HttpApiClient.make(options.api, options),
    )
    const httpClient = options.httpClient
    const runtime = (options.runtime ?? Atom.runtime)(
      Match.value(httpClient).pipe(
        Match.when(
          (
            candidate: typeof httpClient,
          ): candidate is (get: Atom.AtomContext) => Layer.Layer<
            HttpApiGroup.ClientServices<Groups> | HttpApiGroup.MiddlewareClient<Groups> | HttpClient.HttpClient
          > => typeof candidate === 'function',
          (dynamic) => (get: Atom.AtomContext) => Layer.provide(layer, dynamic(get)),
        ),
        Match.orElse((staticClient) => Layer.provide(layer, staticClient)),
      ),
    )

    const catchErrors = Effect.catch(
      (e: HttpClientError.HttpClientError | Schema.SchemaError | UnknownHttpApiError) =>
        Match.value(Schema.isSchemaError(e) || HttpClientError.isHttpClientError(e)).pipe(
          Match.when(true, () => Effect.die(e)),
          Match.when(false, () => Effect.fail(e)),
          Match.exhaustive,
        ),
    )

    interface EndpointCall {
      (request: {
        readonly params?: unknown
        readonly query?: unknown
        readonly payload?: unknown
        readonly headers?: unknown
        readonly responseMode?: HttpApiEndpoint.ClientResponseMode | undefined
      }): Effect.Effect<unknown, HttpClientError.HttpClientError | Schema.SchemaError | UnknownHttpApiError, never>
    }
    const isEndpointCall = (u: unknown): u is EndpointCall => typeof u === 'function'

    const endpointFor = (group: string, endpoint: string): HttpApiEndpoint.Top | undefined => {
      for (const candidate of Object.values(options.api.groups)) {
        if (
          (typeof candidate !== 'object' || candidate === null) && typeof candidate !== 'function' ||
          'identifier' in candidate === false || candidate.identifier !== group
        ) {
          continue
        }
        if (!('endpoints' in candidate) || typeof candidate.endpoints !== 'object' || candidate.endpoints === null) {
          break
        }
        for (const definition of Object.values(candidate.endpoints)) {
          if (
            (typeof definition === 'object' && definition !== null || typeof definition === 'function') &&
            HttpApiEndpoint.isHttpApiEndpoint(definition) && definition.identifier === endpoint
          ) {
            return definition
          }
        }
        break
      }
      return undefined
    }

    const callEndpoint = (
      client: HttpApiClient.Client<Groups, never, never>,
      group: string,
      endpoint: string,
      request: {
        readonly params?: unknown
        readonly query?: unknown
        readonly payload?: unknown
        readonly headers?: unknown
        readonly responseMode?: HttpApiEndpoint.ClientResponseMode | undefined
      },
    ): Effect.Effect<unknown, HttpClientError.HttpClientError | Schema.SchemaError | UnknownHttpApiError, never> => {
      let groupEntry: unknown
      if ((typeof client === 'object' && client !== null) || typeof client === 'function') {
        groupEntry = Reflect.get(client, group)
      } else {
        groupEntry = undefined
      }
      if (typeof groupEntry !== 'object' || groupEntry === null) {
        return Effect.fail(UnknownApiGroupError.make({ group }))
      }
      const call: unknown = Reflect.get(groupEntry, endpoint)
      if (!isEndpointCall(call)) {
        return Effect.fail(UnknownEndpointError.make({ group, endpoint }))
      }
      return call(request)
    }

    const resultSchema = schemaCodec

    const mutationFamily = Atom.family(({ endpoint, group, responseMode }: MutationKey) => {
      const fnAtom = runtime.fn<{
        params: unknown
        query: unknown
        headers: unknown
        payload: unknown
        reactivityKeys?: readonly unknown[] | ReadonlyRecord<string, readonly unknown[]> | undefined
      }>()(
        Effect.fnUntraced(function*(opts) {
          const client = yield* service
          const effect = catchErrors(callEndpoint(client, group, endpoint, {
            ...opts,
            responseMode,
          }))
          return yield* Match.value(opts.reactivityKeys).pipe(
            Match.when(undefined, () => effect),
            Match.orElse((keys) => Reactivity.mutation(effect, keys)),
          )
        }),
      )
      if (responseMode === 'decoded-only') {
        const definition = endpointFor(group, endpoint)
        if (definition !== undefined) {
          return Atom.serializable(fnAtom, {
            key: `AtomHttpApi:mutation:${group}:${endpoint}`,
            schema: resultSchema(
              Schema.Union(getSuccessSchemas(definition)),
              Schema.Union(getErrorSchemas(definition)),
            ),
          })
        }
      }
      return fnAtom
    })

    type MutationReturn<
      Endpoint extends HttpApiEndpoint.Constraint,
      ResponseMode extends HttpApiEndpoint.ClientResponseMode,
    > = [Endpoint] extends [
      HttpApiEndpoint.HttpApiEndpoint<
        infer _Identifier,
        infer _Method,
        infer _Path,
        infer _Params,
        infer _Query,
        infer _Payload,
        infer _Headers,
        infer _Success,
        infer _Error,
        infer _Middleware,
        infer _RE
      >,
    ] ? Atom.AtomResultFn<
        Simplify<
          HttpApiEndpoint.ClientRequest<_Params, _Query, _Payload, _Headers, 'decoded-only'> & {
            readonly reactivityKeys?:
              | readonly unknown[]
              | ReadonlyRecord<string, readonly unknown[]>
              | undefined
          }
        >,
        ResponseByMode<Extract<_Success, Schema.Top>['Type'], ResponseMode>,
        ErrorByMode<_Error, _Middleware, ResponseMode>
      >
      : never

    function mutation<
      GroupIdentifier extends HttpApiGroup.Identifier<Groups>,
      EndpointIdentifier extends HttpApiEndpoint.Identifier<HttpApiGroup.Endpoints<Group>>,
      Group extends HttpApiGroup.WithIdentifier<Groups, GroupIdentifier> = HttpApiGroup.WithIdentifier<
        Groups,
        GroupIdentifier
      >,
      Endpoint extends HttpApiEndpoint.WithIdentifier<
        HttpApiGroup.Endpoints<Group>,
        EndpointIdentifier
      > = HttpApiEndpoint.WithIdentifier<
        HttpApiGroup.Endpoints<Group>,
        EndpointIdentifier
      >,
      const ResponseMode extends HttpApiEndpoint.ClientResponseMode = HttpApiEndpoint.ClientResponseMode,
    >(
      group: GroupIdentifier,
      endpoint: EndpointIdentifier,
      options?: {
        readonly responseMode?: ResponseMode | undefined
      },
    ): MutationReturn<Endpoint, ResponseMode>
    function mutation(
      group: string,
      endpoint: string,
      options?: {
        readonly responseMode?: HttpApiEndpoint.ClientResponseMode | undefined
      },
    ): Atom.Atom<unknown> {
      return mutationFamily({
        group,
        endpoint,
        responseMode: options?.responseMode ?? 'decoded-only',
      })
    }

    const queryFamily = Atom.family((opts: QueryKey) => {
      let atom = runtime.atom(
        service.use((client) => catchErrors(callEndpoint(client, opts.group, opts.endpoint, opts))),
      )
      if (opts.reactivityKeys) {
        atom = runtime.factory.withReactivity(opts.reactivityKeys)(atom)
      }
      if (opts.responseMode === 'decoded-only' && opts.serializationKey !== undefined) {
        const endpoint = endpointFor(opts.group, opts.endpoint)
        if (endpoint !== undefined) {
          atom = Atom.serializable(atom, {
            key: `AtomHttpApi:${opts.group}:${opts.endpoint}:${opts.serializationKey}`,
            schema: resultSchema(
              Schema.Union(getSuccessSchemas(endpoint)),
              Schema.Union(getErrorSchemas(endpoint)),
            ),
          })
        }
      }
      if (opts.timeToLive) {
        const timeToLive = opts.timeToLive
        atom = Match.value(Duration.isFinite(timeToLive)).pipe(
          Match.when(true, () => Atom.setIdleTTL(atom, timeToLive)),
          Match.when(false, () => Atom.keepAlive(atom)),
          Match.exhaustive,
        )
      }
      return atom
    })

    type QueryRequest<
      Endpoint extends HttpApiEndpoint.Constraint,
      ResponseMode extends HttpApiEndpoint.ClientResponseMode,
    > = [Endpoint] extends [
      HttpApiEndpoint.HttpApiEndpoint<
        infer _Identifier,
        infer _Method,
        infer _Path,
        infer _Params,
        infer _Query,
        infer _Payload,
        infer _Headers,
        infer _Success,
        infer _Error,
        infer _R,
        infer _RE
      >,
    ] ? Simplify<
        HttpApiEndpoint.ClientRequest<_Params, _Query, _Payload, _Headers, ResponseMode> & {
          readonly reactivityKeys?:
            | readonly unknown[]
            | ReadonlyRecord<string, readonly unknown[]>
            | undefined
          readonly timeToLive?: Duration.Input | undefined
          readonly serializationKey?: string | undefined
        }
      >
      : never

    type QueryReturn<
      Endpoint extends HttpApiEndpoint.Constraint,
      ResponseMode extends HttpApiEndpoint.ClientResponseMode,
    > = [Endpoint] extends [
      HttpApiEndpoint.HttpApiEndpoint<
        infer _Identifier,
        infer _Method,
        infer _Path,
        infer _Params,
        infer _Query,
        infer _Payload,
        infer _Headers,
        infer _Success,
        infer _Error,
        infer _Middleware,
        infer _RE
      >,
    ] ? Atom.Atom<
        AsyncResult.Result<
          ResponseByMode<Extract<_Success, Schema.Top>['Type'], ResponseMode>,
          ErrorByMode<_Error, _Middleware, ResponseMode>
        >
      >
      : never

    function query<
      GroupIdentifier extends HttpApiGroup.Identifier<Groups>,
      EndpointIdentifier extends HttpApiEndpoint.Identifier<HttpApiGroup.Endpoints<Group>>,
      Group extends HttpApiGroup.WithIdentifier<Groups, GroupIdentifier> = HttpApiGroup.WithIdentifier<
        Groups,
        GroupIdentifier
      >,
      Endpoint extends HttpApiEndpoint.WithIdentifier<
        HttpApiGroup.Endpoints<Group>,
        EndpointIdentifier
      > = HttpApiEndpoint.WithIdentifier<
        HttpApiGroup.Endpoints<Group>,
        EndpointIdentifier
      >,
      const ResponseMode extends HttpApiEndpoint.ClientResponseMode = 'decoded-only',
    >(
      group: GroupIdentifier,
      endpoint: EndpointIdentifier,
      request: QueryRequest<Endpoint, ResponseMode>,
    ): QueryReturn<Endpoint, ResponseMode>
    function query(
      group: string,
      endpoint: string,
      request: {
        readonly params?: unknown
        readonly query?: unknown
        readonly payload?: unknown
        readonly headers?: unknown
        readonly responseMode?: HttpApiEndpoint.ClientResponseMode | undefined
        readonly reactivityKeys?:
          | readonly unknown[]
          | ReadonlyRecord<string, readonly unknown[]>
          | undefined
        readonly timeToLive?: Duration.Input | undefined
        readonly serializationKey?: string | undefined
      },
    ): Atom.Atom<unknown> {
      const key: QueryKey = {
        group,
        endpoint,
        params: request.params,
        query: request.query,
        payload: request.payload,
        headers: request.headers,
        responseMode: request.responseMode ?? 'decoded-only',
        reactivityKeys: request.reactivityKeys,
        timeToLive: Match.value(request.timeToLive).pipe(
          Match.when(undefined, () => undefined),
          Match.orElse((timeToLive) => Duration.fromInputUnsafe(timeToLive)),
        ),
        serializationKey: request.serializationKey,
      }
      return queryFamily(key)
    }

    const client: AtomHttpApiClient<Self, Id, Groups> = Object.assign(service, {
      runtime,
      mutation,
      query,
    })
    return client
  }

interface MutationKey {
  group: string
  endpoint: string
  responseMode: HttpApiEndpoint.ClientResponseMode
}

interface QueryKey {
  group: string
  endpoint: string
  params: unknown
  query: unknown
  headers: unknown
  payload: unknown
  responseMode: HttpApiEndpoint.ClientResponseMode
  reactivityKeys: readonly unknown[] | ReadonlyRecord<string, readonly unknown[]> | undefined
  timeToLive: Duration.Duration | undefined
  serializationKey: string | undefined
}

type ResponseByMode<Success, ResponseMode extends HttpApiEndpoint.ClientResponseMode> = [ResponseMode] extends
  ['decoded-and-response'] ? [Success, HttpClientResponse]
  : [ResponseMode] extends ['response-only'] ? HttpClientResponse
  : Success

type ErrorByMode<
  Error extends Schema.Constraint,
  Middleware,
  ResponseMode extends HttpApiEndpoint.ClientResponseMode,
> =
  | HttpApiMiddleware.Error<Middleware>
  | HttpApiMiddleware.ClientError<Middleware>
  | ([ResponseMode] extends ['response-only'] ? never : Error['Type'])
