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
import { schemaCodec } from './internal/ResultSchema.js'
import * as AsyncResult from './Result.js'

/**
 * A `Context.Service` for a flattened RPC client integrated with atom reactivity.
 *
 * **Details**
 *
 * It exposes the RPC client, an atom runtime, mutation helpers that return `AtomResultFn`s, and query helpers that
 * return atoms or pull atoms for RPC results.
 *
 * @category services
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
        readonly reactivityKeys?:
          | readonly unknown[]
          | ReadonlyRecord<string, readonly unknown[]>
          | undefined
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
      readonly reactivityKeys?:
        | readonly unknown[]
        | ReadonlyRecord<string, readonly unknown[]>
        | undefined
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
 * @category constructors
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
    readonly spanAttributes?: Record<string, unknown> | undefined
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
    options.makeEffect ??
      RpcClient.make(options.group, {
        ...options,
        flatten: true,
      }),
  )
  const protocol = options.protocol

  const runtime = (options.runtime ?? Atom.runtime)(
    typeof protocol === 'function'
      ? (get) =>
        Layer.provide(
          layer,
          Layer.orDie(protocol(get)),
        )
      : Layer.provide(layer, Layer.orDie(protocol)),
  )

  const isAnyWithProps = (u: unknown): u is Rpc.AnyWithProps =>
    (typeof u === 'object' && u !== null || typeof u === 'function') &&
    'payloadSchema' in u && 'successSchema' in u && 'errorSchema' in u

  const getRpc = (tag: Rpc.Tag<Rpcs>): Rpc.AnyWithProps => {
    const rpc = options.group.requests.get(tag)
    if (rpc === undefined || !isAnyWithProps(rpc)) {
      throw new Error(`Unknown RPC tag: ${tag}`)
    }
    return rpc
  }

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
      readonly reactivityKeys?:
        | readonly unknown[]
        | ReadonlyRecord<string, readonly unknown[]>
        | undefined
      readonly headers?: Headers.Input | undefined
    }>()(
      Effect.fnUntraced(function*({ headers, payload, reactivityKeys }) {
        const client = yield* service
        const effect = callFlat(client, tag, payload, headers, 'effect')
        return yield* (reactivityKeys
          ? Reactivity.mutation(effect, reactivityKeys)
          : effect)
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
        readonly reactivityKeys?:
          | readonly unknown[]
          | ReadonlyRecord<string, readonly unknown[]>
          | undefined
        readonly headers?: Headers.Input | undefined
      },
      _Success['Type'],
      _Error['Type'] | RpcClientError | _Middleware['error']['Type']
    >
    : never

  function mutation<Tag extends Rpc.Tag<Rpcs>>(arg: Tag): MutationReturn<Tag>
  function mutation(arg: Rpc.Tag<Rpcs>): Atom.Atom<unknown> {
    return mutationFamily(arg)
  }

  const queryFamily = Atom.family(
    (key: QueryKey<Rpcs>) => {
      const { headers, payload, reactivityKeys, tag, timeToLive } = key
      const rpc = getRpc(tag)
      const isStream = RpcSchema.isStreamSchema(rpc.successSchema)
      let atom = isStream
        ? runtime.pull(
          Stream.unwrap(
            service.use((client) =>
              Effect.succeed(
                callFlat(client, tag, payload, headers, 'stream'),
              )
            ),
          ),
        )
        : runtime.atom(
          service.use((client) => callFlat(client, tag, payload, headers, 'effect')),
        )
      if (reactivityKeys) {
        atom = runtime.factory.withReactivity(reactivityKeys)(atom)
      }
      if (!isStream && key.serializationKey) {
        atom = Atom.serializable(atom, {
          key: `AtomRpc:${key.tag}:${key.serializationKey}`,
          schema: resultSchema(rpc.successSchema, makeErrorSchema(rpc)),
        })
      }
      if (timeToLive) {
        atom = Duration.isFinite(timeToLive)
          ? Atom.setIdleTTL(atom, timeToLive)
          : Atom.keepAlive(atom)
      }
      return atom
    },
  )

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
      readonly reactivityKeys?:
        | readonly unknown[]
        | ReadonlyRecord<string, readonly unknown[]>
        | undefined
      readonly timeToLive?: Duration.Input | undefined
      readonly serializationKey?: string | undefined
    },
  ): QueryReturn<Tag>
  function query(
    tag: Rpc.Tag<Rpcs>,
    payload: Rpc.PayloadConstructor<Rpcs>,
    options?: {
      readonly headers?: Headers.Input | undefined
      readonly reactivityKeys?:
        | readonly unknown[]
        | ReadonlyRecord<string, readonly unknown[]>
        | undefined
      readonly timeToLive?: Duration.Input | undefined
      readonly serializationKey?: string | undefined
    },
  ): Atom.Atom<unknown> {
    const key: QueryKey<Rpcs> = {
      tag,
      payload,
      headers: options?.headers
        ? Headers.fromInput(options.headers)
        : undefined,
      reactivityKeys: options?.reactivityKeys,
      timeToLive: options?.timeToLive
        ? Duration.fromInputUnsafe(options.timeToLive)
        : undefined,
      serializationKey: options?.serializationKey,
    }
    return queryFamily(key)
  }

  return Object.assign(service, {
    runtime,
    mutation,
    query,
  })
}

interface QueryKey<Rpcs extends Rpc.Any> {
  tag: Rpc.Tag<Rpcs>
  payload: Rpc.PayloadConstructor<Rpcs>
  headers: Headers.Headers | undefined
  reactivityKeys:
    | readonly unknown[]
    | ReadonlyRecord<string, readonly unknown[]>
    | undefined
  timeToLive: Duration.Duration | undefined
  serializationKey: string | undefined
}

const makeErrorSchema = (rpc: Rpc.AnyWithProps): Schema.Top =>
  Schema.Union([
    rpc.errorSchema,
    ...Array.from(rpc.middlewares, (middleware) => middleware.error),
    RpcClientError,
  ])
