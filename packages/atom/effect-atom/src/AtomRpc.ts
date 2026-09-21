/**
 * Connects typed RPC clients to atoms.
 *
 * The service created here exposes a flattened RPC client plus atom-based query
 * and mutation helpers. Query atoms call RPCs and track asynchronous or
 * streaming results, while mutations run RPC calls that can invalidate
 * reactivity keys after success. Query atoms can also use request headers,
 * time-to-live settings, and serialization keys for hydration.
 *
 * @since 4.0.0
 */
import * as Context from 'effect/Context'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type { ReadonlyRecord } from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import type { NoInfer } from 'effect/Types'
import * as Headers from 'effect/unstable/http/Headers'
import * as Reactivity from 'effect/unstable/reactivity/Reactivity'
import type * as Rpc from 'effect/unstable/rpc/Rpc'
import * as RpcClient from 'effect/unstable/rpc/RpcClient'
import { RpcClientError } from 'effect/unstable/rpc/RpcClientError'
import type * as RpcGroup from 'effect/unstable/rpc/RpcGroup'
import type { RequestId } from 'effect/unstable/rpc/RpcMessage'
import * as RpcSchema from 'effect/unstable/rpc/RpcSchema'
import type { SetParameterType, SetReturnType } from 'type-fest'
import * as Atom from './Atom.js'
import * as AsyncResult from './Result.js'
import { schemaCodec } from './ResultSchema.js'

type AnyAtom<A = unknown> = Atom.Atom<A>
type ReactivityKey<K = unknown> = readonly K[] | ReadonlyRecord<string, readonly K[]>
type AnyRecord<V = unknown> = Record<string, V>
interface QueryOptions {
  readonly headers?: Headers.Input | undefined
  readonly reactivityKeys?: ReactivityKey | undefined
  readonly timeToLive?: Duration.Input | undefined
  readonly serializationKey?: string | undefined
}

interface QueryKey<Rpcs extends Rpc.Any> {
  tag: Rpc.Tag<Rpcs>
  payload: Rpc.PayloadConstructor<Rpcs>
  headers: Headers.Headers | undefined
  reactivityKeys: ReactivityKey | undefined
  timeToLive: Duration.Duration | undefined
  serializationKey: string | undefined
}

const orDefined = <A>(value: A | undefined, fallback: A): A => {
  if (value === undefined) {
    return fallback
  }
  return value
}

const orElse = <A>(value: A | undefined, fallback: () => A): A => {
  if (value === undefined) {
    return fallback()
  }
  return value
}

const isObject = (u: unknown): u is object => {
  if (typeof u !== 'object') {
    return false
  }
  return u !== null
}

const isRecordLike = (u: unknown): u is object => {
  if (typeof u === 'function') {
    return true
  }
  return isObject(u)
}

const hasRpcSchemas = (u: object): boolean =>
  ['payloadSchema' in u, 'successSchema' in u, 'errorSchema' in u].includes(false) === false

const isAnyWithProps = (u: unknown): u is Rpc.AnyWithProps => {
  if (!isRecordLike(u)) {
    return false
  }
  return hasRpcSchemas(u)
}

const requireRpc = <R = unknown, T = unknown>(rpc: R, tag: T): Rpc.AnyWithProps => {
  if (isAnyWithProps(rpc)) {
    return rpc
  }
  throw new Error(`Unknown RPC tag: ${String(tag)}`)
}

const headersFromInput = (
  headers: Headers.Input | undefined,
): Headers.Headers | undefined => {
  if (headers === undefined) {
    return undefined
  }
  return Headers.fromInput(headers)
}

const headersFromQueryOptions = (
  options: QueryOptions | undefined,
): Headers.Headers | undefined => {
  if (options === undefined) {
    return undefined
  }
  return headersFromInput(options.headers)
}

const reactivityKeysFromQueryOptions = (
  options: QueryOptions | undefined,
): QueryOptions['reactivityKeys'] => {
  if (options === undefined) {
    return undefined
  }
  return options.reactivityKeys
}

const durationFromInput = (
  timeToLive: Duration.Input | undefined,
): Duration.Duration | undefined => {
  if (timeToLive === undefined) {
    return undefined
  }
  return Duration.fromInputUnsafe(timeToLive)
}

const timeToLiveFromQueryOptions = (
  options: QueryOptions | undefined,
): Duration.Duration | undefined => {
  if (options === undefined) {
    return undefined
  }
  return durationFromInput(options.timeToLive)
}

const serializationKeyFromQueryOptions = (
  options: QueryOptions | undefined,
): string | undefined => {
  if (options === undefined) {
    return undefined
  }
  return options.serializationKey
}

const makeQueryKey = <Rpcs extends Rpc.Any>(
  tag: Rpc.Tag<Rpcs>,
  payload: Rpc.PayloadConstructor<Rpcs>,
  options: QueryOptions | undefined,
): QueryKey<Rpcs> => ({
  tag,
  payload,
  headers: headersFromQueryOptions(options),
  reactivityKeys: reactivityKeysFromQueryOptions(options),
  timeToLive: timeToLiveFromQueryOptions(options),
  serializationKey: serializationKeyFromQueryOptions(options),
})

const hasSerializationKey = (key: string | undefined): key is string => {
  if (key === undefined) {
    return false
  }
  return key !== ''
}

const applyFiniteOrKeepAlive = <A extends AnyAtom>(
  atom: A,
  timeToLive: Duration.Duration,
): A => {
  if (Duration.isFinite(timeToLive)) {
    return Atom.setIdleTTL(atom, timeToLive)
  }
  return Atom.keepAlive(atom)
}

const applyQueryTtl = <A extends AnyAtom>(
  atom: A,
  timeToLive: Duration.Duration | undefined,
): A => {
  if (timeToLive === undefined) {
    return atom
  }
  return applyFiniteOrKeepAlive(atom, timeToLive)
}

/**
 * A `Context.Service` for a flattened RPC client integrated with atom reactivity.
 *
 * **Details**
 *
 * It exposes the RPC client, an atom runtime, mutation helpers that return `AtomResultFn`s, and query helpers that
 * return atoms or pull atoms for RPC results.
 *
 * @since 4.0.0
 */
export interface AtomRpcClient<Self, Id extends string, Rpcs extends Rpc.Any> extends
  Context.Service<
    Self,
    RpcClient.RpcClient.Flat<Rpcs, RpcClientError>
  >
{
  new(_: never): Context.ServiceClass.Shape<
    Id,
    RpcClient.RpcClient.Flat<Rpcs, RpcClientError>
  >

  readonly runtime: Atom.AtomRuntime<Self>

  readonly mutation: <Tag extends Rpc.Tag<Rpcs>>(
    arg: Tag,
  ) => Rpc.ExtractTag<Rpcs, Tag> extends Rpc.Rpc<
    infer _Tag,
    infer _Payload,
    infer _Success,
    infer _Error,
    infer _Middleware,
    infer _Requires
  > ? [_Success] extends [RpcSchema.Stream<infer _A, infer _E>] ? never
    : Atom.AtomResultFn<
      {
        readonly payload: Rpc.PayloadConstructor<Rpc.ExtractTag<Rpcs, Tag>>
        readonly reactivityKeys?: ReactivityKey | undefined
        readonly headers?: Headers.Input | undefined
      },
      _Success['Type'],
      _Error['Type'] | RpcClientError | _Middleware['error']['Type']
    >
    : never

  readonly query: <Tag extends Rpc.Tag<Rpcs>>(
    tag: Tag,
    payload: Rpc.PayloadConstructor<Rpc.ExtractTag<Rpcs, Tag>>,
    options?: {
      readonly headers?: Headers.Input | undefined
      readonly reactivityKeys?: ReactivityKey | undefined
      readonly timeToLive?: Duration.Input | undefined
      readonly serializationKey?: string | undefined
    },
  ) => Rpc.ExtractTag<Rpcs, Tag> extends Rpc.Rpc<
    infer _Tag,
    infer _Payload,
    infer _Success,
    infer _Error,
    infer _Middleware
  > ? [_Success] extends [RpcSchema.Stream<infer _A, infer _E>] ? Atom.Writable<
        Atom.PullResult<
          _A['Type'],
          _E['Type'] | _Error['Type'] | RpcClientError | _Middleware['error']['Type']
        >,
        void
      >
    : Atom.Atom<
      AsyncResult.Result<
        _Success['Type'],
        _Error['Type'] | RpcClientError | _Middleware['error']['Type']
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
 * Creates a `Context.Service` class for an RPC client backed by an atom runtime.
 *
 * **Details**
 *
 * The options provide the RPC group, protocol layer, tracing options, request id generation, optional custom client
 * effect, and runtime factory used by the query and mutation helpers.
 *
 * @since 4.0.0
 */
export const Service = <Self>() =>
<
  const Id extends string,
  Rpcs extends Rpc.Any,
  ER,
  RM =
    | RpcClient.Protocol
    | Rpc.MiddlewareClient<NoInfer<Rpcs>>
    | Rpc.ServicesClient<NoInfer<Rpcs>>,
>(
  id: Id,
  options: {
    readonly group: RpcGroup.RpcGroup<Rpcs>
    readonly protocol:
      | Layer.Layer<Exclude<NoInfer<RM>, Scope.Scope>, ER>
      | ((get: Atom.AtomContext) => Layer.Layer<Exclude<NoInfer<RM>, Scope.Scope>, ER>)
    readonly spanPrefix?: string | undefined
    readonly spanAttributes?: AnyRecord | undefined
    readonly generateRequestId?: (() => RequestId) | undefined
    readonly disableTracing?: boolean | undefined
    readonly makeEffect?:
      | Effect.Effect<
        RpcClient.RpcClient.Flat<Rpcs, RpcClientError>,
        never,
        | RM
        | RpcClient.Protocol
        | Rpc.MiddlewareClient<Rpcs>
        | Scope.Scope
      >
      | undefined
    readonly runtime?: Atom.RuntimeFactory | undefined
  },
): AtomRpcClient<Self, Id, Rpcs> => {
  const service = Context.Service<
    Self,
    RpcClient.RpcClient.Flat<Rpcs, RpcClientError>
  >()(id)

  const layer = Layer.effect(
    service,
    orElse(options.makeEffect, () =>
      RpcClient.make(options.group, {
        ...options,
        flatten: true,
      })),
  )

  const protocolFnToLayer = (
    protocol: (get: Atom.AtomContext) => Layer.Layer<Exclude<NoInfer<RM>, Scope.Scope>, ER>,
  ) =>
  (get: Atom.AtomContext) => Layer.provide(layer, Layer.orDie(protocol(get)))

  const protocolToLayer = (protocol: typeof options.protocol) => {
    if (typeof protocol === 'function') {
      return protocolFnToLayer(protocol)
    }
    return Layer.provide(layer, Layer.orDie(protocol))
  }

  const runtime = orDefined(options.runtime, Atom.runtime)(
    protocolToLayer(options.protocol),
  )

  const getRpc = (tag: Rpc.Tag<Rpcs>): Rpc.AnyWithProps => requireRpc(options.group.requests.get(tag), tag)

  /** Every payload constructor any RPC in this group accepts. */
  type AnyPayload = Rpc.PayloadConstructor<Rpcs>

  /** Every value any RPC in this group succeeds with - a stream for a streaming one. */
  type AnySuccess = Rpc.Success<Rpcs>

  /** Every error any RPC in this group fails with, plus the client's own transport error. */
  type AnyError = Rpc.Error<Rpcs> | RpcClientError

  /** What a request-shaped call returns once the tag is the whole tag union. */
  type AnyRequestResult = Effect.Effect<AnySuccess, AnyError, never>

  /** What a streaming call returns: the chunk types and exit errors of the streaming RPCs. */
  type AnyStreamResult = Stream.Stream<Rpc.SuccessChunk<Rpcs>, Rpc.ErrorExit<Rpcs> | RpcClientError, never>

  /**
   * `Flat`'s call with the two parameters that cannot resolve here replaced, and
   * its per-tag return collapsed to the two shapes a tag can select. This service
   * dispatches on a tag that only exists at runtime - `Atom.family` fixes one
   * `Arg` per family, so the tag arrives inside a cache key - and `Flat` computes
   * the payload constructor, an options object that differs for streaming
   * requests, and the return from it. Deriving the type from `Flat` rather than
   * restating it keeps the tag parameter exact and makes a change to `Flat`'s
   * parameters break here.
   */
  type ErasedFlatCall = SetParameterType<
    SetReturnType<RpcClient.RpcClient.Flat<Rpcs, RpcClientError>, AnyRequestResult | AnyStreamResult>,
    { 1: AnyPayload; 2: { readonly headers?: Headers.Input | undefined } }
  >

  /** `Flat` is a callable, so this narrowing is a check rather than a claim. */
  const isErasedFlatCall = (client: unknown): client is ErasedFlatCall => typeof client === 'function'

  /**
   * Calls the flat client for a tag known only at runtime.
   *
   * The two declarations state what the compiler cannot derive: which of the two
   * shapes the tag selects, and that the requirement channel is empty - the
   * client discharged its own requirements before `service` yielded it, while
   * `Flat` still reports the schemas' encoding and decoding services for a tag it
   * cannot resolve.
   */
  function callFlat(
    client: RpcClient.RpcClient.Flat<Rpcs, RpcClientError>,
    tag: Rpc.Tag<Rpcs>,
    payload: AnyPayload,
    headers: Headers.Input | undefined,
    shape: 'effect',
  ): AnyRequestResult
  function callFlat(
    client: RpcClient.RpcClient.Flat<Rpcs, RpcClientError>,
    tag: Rpc.Tag<Rpcs>,
    payload: AnyPayload,
    headers: Headers.Input | undefined,
    shape: 'stream',
  ): AnyStreamResult
  function callFlat(
    client: RpcClient.RpcClient.Flat<Rpcs, RpcClientError>,
    tag: Rpc.Tag<Rpcs>,
    payload: AnyPayload,
    headers: Headers.Input | undefined,
    _shape: 'effect' | 'stream',
  ): AnyRequestResult | AnyStreamResult {
    if (!isErasedFlatCall(client)) {
      throw new Error(`RpcClient.Flat is not callable for tag: ${tag}`)
    }
    return client(tag, payload, { headers })
  }

  const resultSchema = schemaCodec

  const mutationFamily = Atom.family(<Tag extends Rpc.Tag<Rpcs>>(tag: Tag) => {
    const rpc = getRpc(tag)
    const fnAtom = runtime.fn<{
      readonly payload: Rpc.PayloadConstructor<Rpc.ExtractTag<Rpcs, Tag>>
      readonly reactivityKeys?: ReactivityKey | undefined
      readonly headers?: Headers.Input | undefined
    }>()(
      Effect.fnUntraced(function*({ headers, payload, reactivityKeys }) {
        const client = yield* service
        const effect = callFlat(client, tag, payload, headers, 'effect')
        if (reactivityKeys === undefined) {
          return yield* effect
        }
        return yield* Reactivity.mutation(effect, reactivityKeys)
      }),
    )
    return Atom.serializable(fnAtom, {
      key: `AtomRpc:mutation:${tag}`,
      schema: resultSchema(rpc.successSchema, makeErrorSchema(rpc)),
    })
  })

  type MutationReturn<Tag extends Rpc.Tag<Rpcs>> = Rpc.ExtractTag<Rpcs, Tag> extends Rpc.Rpc<
    infer _Tag,
    infer _Payload,
    infer _Success,
    infer _Error,
    infer _Middleware,
    infer _Requires
  > ? [_Success] extends [RpcSchema.Stream<infer _A, infer _E>] ? never
    : Atom.AtomResultFn<
      {
        readonly payload: Rpc.PayloadConstructor<Rpc.ExtractTag<Rpcs, Tag>>
        readonly reactivityKeys?: ReactivityKey | undefined
        readonly headers?: Headers.Input | undefined
      },
      _Success['Type'],
      _Error['Type'] | RpcClientError | _Middleware['error']['Type']
    >
    : never

  function mutation<Tag extends Rpc.Tag<Rpcs>>(arg: Tag): MutationReturn<Tag>
  function mutation(arg: Rpc.Tag<Rpcs>): AnyAtom {
    return mutationFamily(arg)
  }

  const makeStreamQueryAtom = (key: QueryKey<Rpcs>): AnyAtom =>
    runtime.pull(
      Stream.unwrap(
        service.use((client) =>
          Effect.succeed(
            callFlat(client, key.tag, key.payload, key.headers, 'stream'),
          )
        ),
      ),
    )

  const makeEffectQueryAtom = (key: QueryKey<Rpcs>): AnyAtom =>
    runtime.atom(
      service.use((client) => callFlat(client, key.tag, key.payload, key.headers, 'effect')),
    )

  const makeQueryAtom = (key: QueryKey<Rpcs>): AnyAtom => {
    const rpc = getRpc(key.tag)
    if (RpcSchema.isStreamSchema(rpc.successSchema)) {
      return makeStreamQueryAtom(key)
    }
    return makeEffectQueryAtom(key)
  }

  const withQueryReactivity = <A extends AnyAtom>(
    atom: A,
    reactivityKeys: QueryKey<Rpcs>['reactivityKeys'],
  ): A => {
    if (reactivityKeys === undefined) {
      return atom
    }
    return runtime.factory.withReactivity(reactivityKeys)(atom)
  }

  const serializeNonStreamQueryAtom = <A extends AnyAtom>(
    atom: A,
    key: QueryKey<Rpcs>,
    rpc: Rpc.AnyWithProps,
  ): A => {
    if (hasSerializationKey(key.serializationKey)) {
      return Atom.serializable(atom, {
        key: `AtomRpc:${key.tag}:${key.serializationKey}`,
        schema: resultSchema(rpc.successSchema, makeErrorSchema(rpc)),
      })
    }
    return atom
  }

  const serializeQueryAtom = <A extends AnyAtom>(
    atom: A,
    key: QueryKey<Rpcs>,
  ): A => {
    const rpc = getRpc(key.tag)
    if (RpcSchema.isStreamSchema(rpc.successSchema)) {
      return atom
    }
    return serializeNonStreamQueryAtom(atom, key, rpc)
  }

  const decorateQueryAtom = <A extends AnyAtom>(
    atom: A,
    key: QueryKey<Rpcs>,
  ): A =>
    applyQueryTtl(
      serializeQueryAtom(withQueryReactivity(atom, key.reactivityKeys), key),
      key.timeToLive,
    )

  const queryFamily = Atom.family((key: QueryKey<Rpcs>) => decorateQueryAtom(makeQueryAtom(key), key))

  type QueryReturn<Tag extends Rpc.Tag<Rpcs>> = Rpc.ExtractTag<Rpcs, Tag> extends Rpc.Rpc<
    infer _Tag,
    infer _Payload,
    infer _Success,
    infer _Error,
    infer _Middleware
  > ? [_Success] extends [RpcSchema.Stream<infer _A, infer _E>] ? Atom.Writable<
        Atom.PullResult<
          _A['Type'],
          _E['Type'] | _Error['Type'] | RpcClientError | _Middleware['error']['Type']
        >,
        void
      >
    : Atom.Atom<
      AsyncResult.Result<
        _Success['Type'],
        _Error['Type'] | RpcClientError | _Middleware['error']['Type']
      >
    >
    : never

  function query<Tag extends Rpc.Tag<Rpcs>>(
    tag: Tag,
    payload: Rpc.PayloadConstructor<Rpc.ExtractTag<Rpcs, Tag>>,
    options?: {
      readonly headers?: Headers.Input | undefined
      readonly reactivityKeys?: ReactivityKey | undefined
      readonly timeToLive?: Duration.Input | undefined
      readonly serializationKey?: string | undefined
    },
  ): QueryReturn<Tag>
  function query(
    tag: Rpc.Tag<Rpcs>,
    payload: Rpc.PayloadConstructor<Rpcs>,
    options?: {
      readonly headers?: Headers.Input | undefined
      readonly reactivityKeys?: ReactivityKey | undefined
      readonly timeToLive?: Duration.Input | undefined
      readonly serializationKey?: string | undefined
    },
  ): AnyAtom {
    return queryFamily(makeQueryKey(tag, payload, options))
  }

  return Object.assign(service, {
    runtime,
    mutation,
    query,
  })
}

const makeErrorSchema = (rpc: Rpc.AnyWithProps): Schema.Top =>
  Schema.Union([
    rpc.errorSchema,
    ...Array.from(rpc.middlewares, (middleware) => middleware.error),
    RpcClientError,
  ])
