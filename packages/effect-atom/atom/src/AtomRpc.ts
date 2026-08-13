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
import type { Scope } from 'effect/Scope'
import * as Stream from 'effect/Stream'
import type { Mutable, NoInfer } from 'effect/Types'
import * as Headers from 'effect/unstable/http/Headers'
import * as Reactivity from 'effect/unstable/reactivity/Reactivity'
import type * as Rpc from 'effect/unstable/rpc/Rpc'
import * as RpcClient from 'effect/unstable/rpc/RpcClient'
import { RpcClientError } from 'effect/unstable/rpc/RpcClientError'
import type * as RpcGroup from 'effect/unstable/rpc/RpcGroup'
import type { RequestId } from 'effect/unstable/rpc/RpcMessage'
import * as RpcSchema from 'effect/unstable/rpc/RpcSchema'
import * as Atom from './Atom.js'
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
          | ReadonlyArray<unknown>
          | ReadonlyRecord<string, ReadonlyArray<unknown>>
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
        | ReadonlyArray<unknown>
        | ReadonlyRecord<string, ReadonlyArray<unknown>>
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
      | Layer.Layer<Exclude<NoInfer<RM>, Scope>, ER>
      | ((get: Atom.AtomContext) => Layer.Layer<Exclude<NoInfer<RM>, Scope>, ER>)
    readonly spanPrefix?: string | undefined
    readonly spanAttributes?: Record<string, unknown> | undefined
    readonly generateRequestId?: (() => RequestId) | undefined
    readonly disableTracing?: boolean | undefined
    readonly makeEffect?:
      | Effect.Effect<
        RpcClient.RpcClient.Flat<Rpcs, RpcClientError>,
        never,
        RM
      >
      | undefined
    readonly runtime?: Atom.RuntimeFactory | undefined
  },
): AtomRpcClient<Self, Id, Rpcs> => {
  const self: Mutable<AtomRpcClient<Self, Id, Rpcs>> = Context.Service<
    Self,
    RpcClient.RpcClient.Flat<Rpcs, RpcClientError>
  >()(id) as any

  const layer = Layer.effect(
    self,
    options.makeEffect ??
      (RpcClient.make(options.group, {
        ...options,
        flatten: true,
      }) as Effect.Effect<
        RpcClient.RpcClient.Flat<Rpcs, RpcClientError>,
        never,
        RM
      >),
  )
  const runtimeFactory = options.runtime ?? Atom.runtime
  self.runtime = runtimeFactory(
    typeof options.protocol === 'function'
      ? (get) =>
        Layer.provide(
          layer,
          Layer.orDie(
            (options.protocol as ((get: Atom.AtomContext) => Layer.Layer<Exclude<NoInfer<RM>, Scope>, ER>))(get),
          ),
        )
      : Layer.provide(layer, Layer.orDie(options.protocol)),
  )

  self.mutation = Atom.family(<Tag extends Rpc.Tag<Rpcs>>(tag: Tag) => {
    const rpc = options.group.requests.get(tag)! as any as Rpc.AnyWithProps
    return self.runtime.fn<{
      readonly payload: Rpc.PayloadConstructor<Rpc.ExtractTag<Rpcs, Tag>>
      readonly reactivityKeys?:
        | ReadonlyArray<unknown>
        | ReadonlyRecord<string, ReadonlyArray<unknown>>
        | undefined
      readonly headers?: Headers.Input | undefined
    }>()(
      Effect.fnUntraced(function*({ headers, payload, reactivityKeys }) {
        const client = yield* self
        const effect = client(tag, payload, { headers } as any)
        return yield* (reactivityKeys
          ? Reactivity.mutation(effect, reactivityKeys) as Effect.Effect<any>
          : effect as any as Effect.Effect<any>)
      }),
    ).pipe(
      Atom.serializable({
        key: `AtomRpc:mutation:${tag}`,
        schema: AsyncResult.Schema({
          success: rpc.successSchema,
          error: makeErrorSchema(rpc),
        }) as any,
      }),
    )
  }) as any

  const queryFamily = Atom.family(
    (key: QueryKey) => {
      const { headers, payload, reactivityKeys, tag, timeToLive } = key
      const rpc = options.group.requests.get(tag)! as any as Rpc.AnyWithProps
      const isStream = RpcSchema.isStreamSchema(rpc.successSchema)
      let atom = isStream
        ? self.runtime.pull(
          Stream.unwrap(
            self.use((client) =>
              Effect.succeed(
                client(tag, payload, { headers } as any) as any,
              )
            ),
          ),
        )
        : self.runtime.atom(
          self.use((client) => client(tag, payload, { headers } as any)) as any,
        )
      if (reactivityKeys) {
        atom = self.runtime.factory.withReactivity(reactivityKeys)(atom)
      }
      if (!isStream && key.serializationKey) {
        atom = Atom.serializable(atom, {
          key: `AtomRpc:${key.tag}:${key.serializationKey}`,
          schema: AsyncResult.Schema({
            success: rpc.successSchema,
            error: makeErrorSchema(rpc),
          }) as any,
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

  self.query = <Tag extends Rpc.Tag<Rpcs>>(
    tag: Tag,
    payload: Rpc.PayloadConstructor<Rpc.ExtractTag<Rpcs, Tag>>,
    options?: {
      readonly headers?: Headers.Input | undefined
      readonly reactivityKeys?:
        | ReadonlyArray<unknown>
        | ReadonlyRecord<string, ReadonlyArray<unknown>>
        | undefined
      readonly timeToLive?: Duration.Input | undefined
      readonly serializationKey?: string | undefined
    },
  ) => {
    const key: QueryKey = {
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
    return queryFamily(key) as any
  }

  return self as AtomRpcClient<Self, Id, Rpcs>
}

interface QueryKey {
  tag: string
  payload: any
  headers: Headers.Headers | undefined
  reactivityKeys:
    | ReadonlyArray<unknown>
    | ReadonlyRecord<string, ReadonlyArray<unknown>>
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
