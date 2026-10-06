import {
  type DurableObjectNamespaceLike,
  type EgressGatewayCtx,
  type EgressGatewayEnv,
  egressGatewayFetch,
  type Fetcher,
  layer as sandboxHost,
  ToolCall,
  type ToolDispatcherCtx,
  type WorkerLoaderLike,
} from '@systemfsoftware/agent-front-door/sandbox'
import { fixtureLedgerLayer, type FixtureRequirement, registry } from '@systemfsoftware/contract-fixtures'
import { Contract, Operations, Sandbox } from '@systemfsoftware/effect-contract'
import { mount } from '@systemfsoftware/effect-contract/http'
import { serve } from '@systemfsoftware/effect-contract/rpc'
import { WorkerEntrypoint } from 'cloudflare:workers'
import { Crypto, Effect, Layer, Match, Option, Schema } from 'effect'
import { HttpRouter } from 'effect/http'
import * as Result from 'effect/Result'
import { CATALOG_VERSION, contractSandboxRegistry } from './contract-sandbox.fixture.js'

const cryptoLayer: Layer.Layer<Crypto.Crypto> = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
    digest: (algorithm, data) =>
      Effect.map(
        Effect.promise(() => crypto.subtle.digest(algorithm, new Uint8Array(data))),
        (buffer) => new Uint8Array(buffer),
      ),
  }),
)

const fixtureEnvironment: Layer.Layer<FixtureRequirement> = Layer.merge(
  Operations.operationsMemoryLayer.pipe(Layer.provide(cryptoLayer)),
  fixtureLedgerLayer,
)

const tools: Readonly<Record<string, Contract.Capability<Contract.Any, FixtureRequirement>>> = registry

const toJson = <A>(value: A): Schema.Json =>
  Option.getOrThrowWith(
    Schema.decodeUnknownOption(Schema.Json)(value),
    () => new Error('a capability census encoded outside Schema.Json'),
  )

const unavailableJson = (reason: string): Schema.Json => ({ _tag: 'Unavailable', reason })

/**
 * The code-mode tool stub answers the capability's census, as the generated declarations promise. The
 * sandbox program runtime unwraps a `Completed` answer to its `output`, so the census travels under one
 * `Completed` envelope and the program returns the census itself.
 */
const dispatchTool = (props: ToolDispatcherCtx['props'], request: Request): Promise<Response> =>
  Effect.runPromise(
    Effect.orDie(
      Effect.gen(function*() {
        const text = yield* Effect.promise(() => request.text())
        const tool = yield* Schema.decodeEffect(Schema.fromJsonString(ToolCall))(text)
        const principal = yield* Schema.decodeEffect(Contract.Principal)(props.principal)
        const census = yield* Option.match(Option.fromUndefinedOr(tools[tool.capability]), {
          onNone: () => Effect.succeed(unavailableJson(`no capability named ${tool.capability}`)),
          onSome: (capability) =>
            Effect.gen(function*() {
              const result = yield* Effect.result(
                capability.cell.run({ input: tool.input, principal }).pipe(Effect.provide(fixtureEnvironment)),
              )
              return yield* Result.match(result, {
                onFailure: (unavailable) => Effect.succeed(unavailableJson(unavailable.reason)),
                onSuccess: (answer) =>
                  Effect.map(
                    Effect.orDie(Schema.encodeEffect(Schema.toCodecJson(capability.contract.answer))(answer)),
                    toJson,
                  ),
              })
            }),
        })
        return Response.json({ _tag: 'Completed', output: census })
      }),
    ),
  )

const unusedSupervisor: DurableObjectNamespaceLike = {
  idFromName: () => ({}),
  get: () => ({ fetch: () => Promise.resolve(Response.json({})) }),
}

const unusedState: Fetcher = { fetch: () => Promise.resolve(Response.json({})) }

interface SandboxEnv {
  readonly LOADER: WorkerLoaderLike
}

interface SandboxExports {
  readonly EgressGateway: (options: { readonly props: EgressGatewayCtx['props'] }) => Fetcher
  readonly ToolDispatcher: (options: { readonly props: ToolDispatcherCtx['props'] }) => Fetcher
}

interface SandboxCtx {
  readonly exports: SandboxExports
}

const sandboxLayerOf = (env: SandboxEnv, ctx: SandboxCtx): Layer.Layer<Sandbox.Sandbox> =>
  sandboxHost({
    loader: env.LOADER,
    supervisor: unusedSupervisor,
    egress: (allow) => ctx.exports.EgressGateway({ props: { allow } }),
    tools: (programId, principal) => ctx.exports.ToolDispatcher({ props: { programId, principal } }),
    state: () => unusedState,
    allow: [],
    catalogVersion: CATALOG_VERSION,
    principal: new Contract.Anonymous({}),
    timeoutMs: 5_000,
    cpuMs: 1_000,
  })

export class EgressGateway extends WorkerEntrypoint<EgressGatewayEnv, EgressGatewayCtx['props']> {
  fetch(request: Request): Promise<Response> {
    return egressGatewayFetch({ ctx: { props: this.ctx.props }, env: this.env, request })
  }
}

export class ToolDispatcher extends WorkerEntrypoint<Record<string, never>, ToolDispatcherCtx['props']> {
  fetch(request: Request): Promise<Response> {
    return dispatchTool(this.ctx.props, request)
  }
}

/**
 * One workerd fixture serves both the RPC target the CLI drives and the HTTP routes the generated client
 * drives, so the code-mode `execute` capability is exercised through the same sandbox host on both paths.
 */
interface Handlers {
  readonly rpc: (request: Request) => Promise<Response>
  readonly http: (request: Request) => Promise<Response>
}

const handlersByEnv = new WeakMap<SandboxEnv, Handlers>()

const handlersOf = (env: SandboxEnv, ctx: SandboxCtx): Handlers =>
  Option.getOrElse(Option.fromNullishOr(handlersByEnv.get(env)), () => {
    const environment = Layer.mergeAll(fixtureEnvironment, cryptoLayer, sandboxLayerOf(env, ctx))
    const rpc = serve(contractSandboxRegistry, { provide: environment }).handler
    const { handler: http } = HttpRouter.toWebHandler(
      HttpRouter.provideRequest(environment)(mount(contractSandboxRegistry).layer),
    )
    const handlers: Handlers = { rpc, http }
    handlersByEnv.set(env, handlers)
    return handlers
  })

export default {
  fetch(request: Request, env: SandboxEnv, ctx: SandboxCtx): Promise<Response> {
    const handlers = handlersOf(env, ctx)
    const path = new URL(request.url).pathname.replace(/\/+$/, '')
    return Match.value(path).pipe(
      Match.when('/rpc', () => handlers.rpc(request)),
      Match.orElse(() => handlers.http(request)),
    )
  },
}
