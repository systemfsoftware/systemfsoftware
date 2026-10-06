import {
  type DurableObjectNamespaceLike,
  type EgressGatewayCtx,
  type EgressGatewayEnv,
  egressGatewayFetch,
  type Fetcher,
  layer,
  type PrincipalEncoded,
  programSupervisorAlarm,
  programSupervisorFacet,
  programSupervisorPrepare,
  type SupervisorCtx,
  type SupervisorEnv,
  type ToolDispatcherCtx,
  toolDispatcherOf,
  type WorkerLoaderLike,
} from '@systemfsoftware/agent-front-door/sandbox'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Contract, Sandbox } from '@systemfsoftware/effect-contract'
import { WorkerEntrypoint } from 'cloudflare:workers'
import { Effect, Layer, Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const principalKey = (principal: Contract.Principal): string =>
  Match.value(principal).pipe(
    Match.tag('Anonymous', () => 'anonymous'),
    Match.tag('Person', (person) => person.subject),
    Match.exhaustive,
  )

const whoamiContract = Contract.make({
  name: 'whoami',
  description: 'Answers the principal a sandboxed program runs as.',
  input: Schema.Struct({}),
  output: Schema.Struct({ principal: Schema.String }),
  refusals: Schema.Never,
  access: new Contract.Read({ cache: new Contract.Revalidate({}) }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

const whoamiCell: Contract.CellOf<typeof whoamiContract> = Cell.map(
  Cell.id<Contract.Invocation>(),
  (invocation) => ({ _tag: 'Completed', output: { principal: principalKey(invocation.principal) }, next: [] } as const),
)

const refuseContract = Contract.make({
  name: 'refuse',
  description: 'Refuses every call with a declared domain refusal.',
  input: Schema.Struct({}),
  output: Schema.Struct({}),
  refusals: Schema.Union([Schema.TaggedStruct('NotAllowed', { reason: Schema.String })]),
  access: new Contract.Write({ risk: 'MinimalImpact' }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

const refuseCell: Contract.CellOf<typeof refuseContract> = Cell.succeed(
  {
    _tag: 'Refused',
    refusal: { _tag: 'NotAllowed', reason: 'the fixture always refuses' },
    next: [],
  } as const,
)

const capabilities = {
  whoami: Contract.implement(whoamiContract, whoamiCell),
  refuse: Contract.implement(refuseContract, refuseCell),
}

const dispatch = toolDispatcherOf({ capabilities, provide: Layer.empty })

export class ToolDispatcher extends WorkerEntrypoint<
  Record<string, never>,
  ToolDispatcherCtx['props']
> {
  fetch(request: Request): Promise<Response> {
    return dispatch({ props: this.ctx.props }, request)
  }
}

export class EgressGateway extends WorkerEntrypoint<
  EgressGatewayEnv,
  EgressGatewayCtx['props']
> {
  fetch(request: Request): Promise<Response> {
    return egressGatewayFetch({ ctx: { props: this.ctx.props }, env: this.env, request })
  }
}

interface StateEnv {
  readonly SUPERVISOR: DurableObjectNamespaceLike
}

export class ProgramState extends WorkerEntrypoint<StateEnv, { readonly programId: string }> {
  fetch(request: Request): Promise<Response> {
    const supervisor = this.env.SUPERVISOR
    return supervisor.get(supervisor.idFromName(this.ctx.props.programId)).fetch(request)
  }
}

export class ProgramSupervisor {
  constructor(private readonly ctx: SupervisorCtx, private readonly env: SupervisorEnv) {}

  fetch(request: Request): Promise<Response> {
    return Match.value(new URL(request.url).pathname).pipe(
      Match.when('/prepare', () => programSupervisorPrepare({ ctx: this.ctx, env: this.env, request })),
      Match.orElse(() => programSupervisorFacet({ ctx: this.ctx, env: this.env, request })),
    )
  }

  alarm(): Promise<void> {
    return programSupervisorAlarm({ ctx: this.ctx })
  }
}

const RunRequest = Schema.Struct({
  program: Schema.String,
  programId: Sandbox.ProgramId,
  lifetime: Sandbox.Lifetime,
  allow: Schema.Array(Contract.Host),
  principal: Contract.Principal,
  catalogVersion: Schema.String,
  timeoutMs: Schema.Int,
  cpuMs: Schema.Int,
})

interface FixtureExports {
  readonly EgressGateway: (options: { readonly props: EgressGatewayCtx['props'] }) => Fetcher
  readonly ToolDispatcher: (options: { readonly props: ToolDispatcherCtx['props'] }) => Fetcher
  readonly ProgramState: (options: { readonly props: { readonly programId: string } }) => Fetcher
}

interface FixtureCtx {
  readonly exports: FixtureExports
}

interface FixtureEnv {
  readonly LOADER: WorkerLoaderLike
  readonly SUPERVISOR: DurableObjectNamespaceLike
}

const encodedAnswer = (result: Result.Result<Schema.Json, Sandbox.SandboxError>): Response =>
  Result.match(result, {
    onFailure: (error) =>
      Response.json(
        Match.value(error).pipe(
          Match.tag('SandboxEgressDenied', (denied) => ({ _tag: 'SandboxEgressDenied', host: denied.host })),
          Match.tag('SandboxTimeout', () => ({ _tag: 'SandboxTimeout' })),
          Match.tag('SandboxThrew', (threw) => ({ _tag: 'SandboxThrew', message: threw.message })),
          Match.exhaustive,
        ),
      ),
    onSuccess: (value) => Response.json({ _tag: 'Completed', value }),
  })

const reject = (issue: string): Response => Response.json({ _tag: 'Rejected', issue }, { status: 400 })

const runProgram = (env: FixtureEnv, ctx: FixtureCtx, request: Request): Promise<Response> =>
  Effect.runPromise(
    Effect.gen(function*() {
      const text = yield* Effect.promise(() => request.text())
      const input = yield* Schema.decodeEffect(Schema.fromJsonString(RunRequest))(text)
      const result = yield* Effect.result(
        Effect.flatMap(Sandbox.Sandbox, (sandbox) =>
          sandbox.run({ program: input.program, programId: input.programId, lifetime: input.lifetime })).pipe(
            Effect.provide(
              layer({
                loader: env.LOADER,
                supervisor: env.SUPERVISOR,
                egress: (allow) =>
                  ctx.exports.EgressGateway({ props: { allow } }),
                tools: (programId, principal: PrincipalEncoded) =>
                  ctx.exports.ToolDispatcher({ props: { programId, principal } }),
                state: (programId) => ctx.exports.ProgramState({ props: { programId } }),
                allow: input.allow,
                catalogVersion: input.catalogVersion,
                principal: input.principal,
                timeoutMs: input.timeoutMs,
                cpuMs: input.cpuMs,
              }),
            ),
          ),
      )
      return encodedAnswer(result)
    }).pipe(Effect.catchTag('SchemaError', () => Effect.succeed(reject('the run request is not well formed')))),
  )

export default {
  fetch(request: Request, env: FixtureEnv, ctx: FixtureCtx): Promise<Response> {
    return Match.value(new URL(request.url).pathname).pipe(
      Match.when('/run', () => runProgram(env, ctx, request)),
      Match.orElse(() => Promise.resolve(new Response('sandbox fixture', { status: 404 }))),
    )
  },
}
