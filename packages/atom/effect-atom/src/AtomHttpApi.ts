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
import * as AsyncResult from './Result.js'
import { schemaCodec } from './ResultSchema.js'
// rc.108 does not expose HttpApiEndpoint.getSuccessSchemas/getErrorSchemas (added upstream
// after rc.108); replicate them against the public .success/.error schema sets.
const getSuccessSchemas = (endpoint: HttpApiEndpoint.Top): readonly [Schema.Top, ...Array<Schema.Top>] => {
  const [first, ...rest] = Array.from(endpoint.success)
  if (first === undefined) {
    return [HttpApiSchema.NoContent]
  }
  return [first, ...rest]
}
const getErrorSchemas = (endpoint: HttpApiEndpoint.Top): readonly Schema.Top[] => Array.from(endpoint.error)

const isNonNullObject = (value: unknown): value is object => {
  if (typeof value !== 'object') {
    return false
  }
  return value !== null
}

const isObjectOrFunction = (value: unknown): value is object =>
  [typeof value === 'function', isNonNullObject(value)].includes(true)

const hasGroupIdentifier = (candidate: object, group: string): boolean => {
  if (!('identifier' in candidate)) {
    return false
  }
  return candidate.identifier === group
}

const isGroupCandidate = (candidate: unknown, group: string): candidate is object => {
  if (!isObjectOrFunction(candidate)) {
    return false
  }
  return hasGroupIdentifier(candidate, group)
}

const objectOrUndefined = (value: unknown): object | undefined => {
  if (!isNonNullObject(value)) {
    return undefined
  }
  return value
}

const endpointsOf = (candidate: object): object | undefined => {
  if (!('endpoints' in candidate)) {
    return undefined
  }
  return objectOrUndefined(candidate.endpoints)
}

const isEndpointWithId = (definition: object, endpoint: string): definition is HttpApiEndpoint.Top => {
  if (!HttpApiEndpoint.isHttpApiEndpoint(definition)) {
    return false
  }
  return definition.identifier === endpoint
}

const isMatchingEndpoint = (definition: unknown, endpoint: string): definition is HttpApiEndpoint.Top => {
  if (!isObjectOrFunction(definition)) {
    return false
  }
  return isEndpointWithId(definition, endpoint)
}

const matchingEndpoint = (
  endpoints: object,
  endpoint: string,
): HttpApiEndpoint.Top | undefined => {
  const values: ReadonlyArray<unknown> = Object.values(endpoints)
  return values.find((definition): definition is HttpApiEndpoint.Top => isMatchingEndpoint(definition, endpoint))
}

const findEndpointInGroup = (
  candidate: object,
  endpoint: string,
): HttpApiEndpoint.Top | undefined => {
  const endpoints = endpointsOf(candidate)
  if (endpoints === undefined) {
    return undefined
  }
  return matchingEndpoint(endpoints, endpoint)
}

const requireEndpoint = (
  candidate: object,
  group: string,
  endpoint: string,
): HttpApiEndpoint.Top => {
  const found = findEndpointInGroup(candidate, endpoint)
  if (found === undefined) {
    throw new Error(`Unknown endpoint: ${group}.${endpoint}`)
  }
  return found
}

const endpointFor = (
  groups: ReadonlyArray<unknown>,
  group: string,
  endpoint: string,
): HttpApiEndpoint.Top => {
  const candidate = groups.find((value): value is object => isGroupCandidate(value, group))
  if (candidate === undefined) {
    throw new Error(`Unknown endpoint: ${group}.${endpoint}`)
  }
  return requireEndpoint(candidate, group, endpoint)
}

interface EndpointRequest {
  readonly params?: unknown
  readonly query?: unknown
  readonly payload?: unknown
  readonly headers?: unknown
  readonly responseMode?: HttpApiEndpoint.ClientResponseMode | undefined
}

interface EndpointCall {
  (
    request: EndpointRequest,
  ): Effect.Effect<unknown, HttpClientError.HttpClientError | Schema.SchemaError | Error, never>
}

const isEndpointCall = (u: unknown): u is EndpointCall => typeof u === 'function'

const propertyOf = (client: unknown, group: string): unknown => {
  if (!isObjectOrFunction(client)) {
    return undefined
  }
  return Reflect.get(client, group)
}

const groupEntryOf = (client: unknown, group: string): object => {
  const groupEntry = propertyOf(client, group)
  if (!isNonNullObject(groupEntry)) {
    throw new Error(`Unknown API group: ${group}`)
  }
  return groupEntry
}

const callFromGroup = (
  groupEntry: object,
  group: string,
  endpoint: string,
  request: EndpointRequest,
): Effect.Effect<unknown, HttpClientError.HttpClientError | Schema.SchemaError | Error, never> => {
  const call: unknown = Reflect.get(groupEntry, endpoint)
  if (!isEndpointCall(call)) {
    throw new Error(`Unknown endpoint: ${group}.${endpoint}`)
  }
  return call(request)
}

const callEndpoint = (
  client: unknown,
  group: string,
  endpoint: string,
  request: EndpointRequest,
): Effect.Effect<unknown, HttpClientError.HttpClientError | Schema.SchemaError | Error, never> =>
  callFromGroup(groupEntryOf(client, group), group, endpoint, request)

const isDieError = (
  e: HttpClientError.HttpClientError | Schema.SchemaError | Error,
): e is HttpClientError.HttpClientError | Schema.SchemaError => {
  if (Schema.isSchemaError(e)) {
    return true
  }
  return HttpClientError.isHttpClientError(e)
}

const catchError = (
  e: HttpClientError.HttpClientError | Schema.SchemaError | Error,
): Effect.Effect<never, Error> => {
  if (isDieError(e)) {
    return Effect.die(e)
  }
  return Effect.fail(e)
}

const catchErrors = Effect.catch(catchError)

const runtimeFactoryOf = (runtime: Atom.RuntimeFactory | undefined): Atom.RuntimeFactory => {
  if (runtime === undefined) {
    return Atom.runtime
  }
  return runtime
}

const responseModeOrDecoded = (
  responseMode: HttpApiEndpoint.ClientResponseMode | undefined,
): HttpApiEndpoint.ClientResponseMode => {
  if (responseMode === undefined) {
    return 'decoded-only'
  }
  return responseMode
}

const responseModeFromOptions = (
  options?: {
    readonly responseMode?: HttpApiEndpoint.ClientResponseMode | undefined
  },
): HttpApiEndpoint.ClientResponseMode => {
  if (options === undefined) {
    return 'decoded-only'
  }
  return responseModeOrDecoded(options.responseMode)
}

type ReactivityKeys = readonly unknown[] | ReadonlyRecord<string, readonly unknown[]>

const withReactivityKeys = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  reactivityKeys: ReactivityKeys | undefined,
): Effect.Effect<A, E, R | Reactivity.Reactivity> => {
  if (reactivityKeys === undefined) {
    return effect
  }
  return Reactivity.mutation(effect, reactivityKeys)
}

const hasSerializationKey = (key: string | undefined): key is string => {
  if (key === undefined) {
    return false
  }
  return key !== ''
}

const durationFromInput = (timeToLive: Duration.Input | undefined): Duration.Duration | undefined => {
  if (timeToLive === undefined) {
    return undefined
  }
  return Duration.fromInputUnsafe(timeToLive)
}

const applyQueryTtl = <A>(atom: Atom.Atom<A>, timeToLive: Duration.Duration): Atom.Atom<A> => {
  if (Duration.isFinite(timeToLive)) {
    return Atom.setIdleTTL(atom, timeToLive)
  }
  return Atom.keepAlive(atom)
}

const withQueryTtl = <A>(atom: Atom.Atom<A>, timeToLive: Duration.Duration | undefined): Atom.Atom<A> => {
  if (timeToLive === undefined) {
    return atom
  }
  return applyQueryTtl(atom, timeToLive)
}

/**
 * A `Context.Service` for an HTTP API client integrated with atom reactivity.
 *
 * **Details**
 *
 * It exposes the generated HTTP API client, an atom runtime, mutation helpers that
 * return `AtomResultFn`s, and query helpers that return atoms of endpoint results.
 *
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

    const clientLayer = (
      httpClient: typeof options.httpClient,
    ) => {
      if (typeof httpClient === 'function') {
        return (get: Atom.AtomContext) => Layer.provide(layer, httpClient(get))
      }
      return Layer.provide(layer, httpClient)
    }

    const runtime = runtimeFactoryOf(options.runtime)(clientLayer(options.httpClient))

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
          return yield* withReactivityKeys(effect, opts.reactivityKeys)
        }),
      )
      if (responseMode !== 'decoded-only') {
        return fnAtom
      }
      const definition = endpointFor(Object.values(options.api.groups), group, endpoint)
      return Atom.serializable(fnAtom, {
        key: `AtomHttpApi:mutation:${group}:${endpoint}`,
        schema: schemaCodec(
          Schema.Union(getSuccessSchemas(definition)),
          Schema.Union(getErrorSchemas(definition)),
        ),
      })
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
        responseMode: responseModeFromOptions(options),
      })
    }

    const withQueryReactivity = <A extends Atom.Atom<unknown>>(
      atom: A,
      reactivityKeys: ReactivityKeys | undefined,
    ): A => {
      if (reactivityKeys === undefined) {
        return atom
      }
      return runtime.factory.withReactivity(reactivityKeys)(atom)
    }

    const serializeIfKeyed = (
      atom: Atom.Atom<unknown>,
      opts: QueryKey,
    ): Atom.Atom<unknown> => {
      const serializationKey = opts.serializationKey
      if (!hasSerializationKey(serializationKey)) {
        return atom
      }
      const endpoint = endpointFor(Object.values(options.api.groups), opts.group, opts.endpoint)
      return Atom.serializable(atom, {
        key: `AtomHttpApi:${opts.group}:${opts.endpoint}:${serializationKey}`,
        schema: schemaCodec(
          Schema.Union(getSuccessSchemas(endpoint)),
          Schema.Union(getErrorSchemas(endpoint)),
        ),
      })
    }

    const withQuerySerialization = (
      atom: Atom.Atom<unknown>,
      opts: QueryKey,
    ): Atom.Atom<unknown> => {
      if (opts.responseMode !== 'decoded-only') {
        return atom
      }
      return serializeIfKeyed(atom, opts)
    }

    const queryFamily = Atom.family((opts: QueryKey) =>
      withQueryTtl(
        withQuerySerialization(
          withQueryReactivity(
            runtime.atom(
              service.use((client) => catchErrors(callEndpoint(client, opts.group, opts.endpoint, opts))),
            ),
            opts.reactivityKeys,
          ),
          opts,
        ),
        opts.timeToLive,
      )
    )

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
        responseMode: responseModeOrDecoded(request.responseMode),
        reactivityKeys: request.reactivityKeys,
        timeToLive: durationFromInput(request.timeToLive),
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
