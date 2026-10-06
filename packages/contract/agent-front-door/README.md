# @systemfsoftware/agent-front-door

The agent front door: the surfaces from `@systemfsoftware/effect-contract` served as one Worker, with the Dynamic Worker sandbox host that runs agent programs under an egress allow-list.

This package currently ships the `./sandbox` entry. The front door router, discovery documents and the operation store follow in later changes.

## `./sandbox`

The sandbox host implements the contract kernel's `Sandbox` service. It loads each program through the Worker Loader, gives it only a `TOOLS` stub (plus a `STATE` stub when the program's lifetime is a `Session`), and confines every `fetch`/`connect` to an allow-list.

```ts
import { layer } from '@systemfsoftware/agent-front-door/sandbox'
import { Sandbox } from '@systemfsoftware/effect-contract'
import { Effect, Layer } from 'effect'

const host: Layer.Layer<Sandbox.Sandbox> = layer({
  loader: env.LOADER,
  supervisor: env.SUPERVISOR,
  egress: (allow) => ctx.exports.EgressGateway({ props: { allow } }),
  tools: (programId, principal) => ctx.exports.ToolDispatcher({ props: { programId, principal } }),
  state: (programId) => ctx.exports.ProgramState({ props: { programId } }),
  allow: [],
  catalogVersion: 'catalog-1',
  principal: { _tag: 'Anonymous' },
  timeoutMs: 5_000,
  cpuMs: 1_000,
})
```

The host runs inside a Worker. Because workerd entrypoints are classes the composition root exports, the package ships the behavior and the root declares the thin classes:

```ts
import {
  egressGatewayFetch,
  programSupervisorAlarm,
  programSupervisorFacet,
  programSupervisorPrepare,
  toolDispatcherOf,
} from '@systemfsoftware/agent-front-door/sandbox'
import { WorkerEntrypoint } from 'cloudflare:workers'

export class EgressGateway extends WorkerEntrypoint {
  fetch(request: Request) {
    return egressGatewayFetch({ ctx: { props: this.ctx.props }, env: this.env, request })
  }
}

export class ToolDispatcher extends WorkerEntrypoint {
  fetch(request: Request) {
    return dispatch({ props: this.ctx.props }, request)
  }
}

export class ProgramState extends WorkerEntrypoint {
  fetch(request: Request) {
    return this.env.SUPERVISOR.get(this.env.SUPERVISOR.idFromName(this.ctx.props.programId)).fetch(request)
  }
}

export class ProgramSupervisor {
  fetch(request: Request) {
    return new URL(request.url).pathname === '/prepare'
      ? programSupervisorPrepare({ ctx: this.ctx, env: this.env, request })
      : programSupervisorFacet({ ctx: this.ctx, env: this.env, request })
  }

  alarm() {
    return programSupervisorAlarm({ ctx: this.ctx })
  }
}
```

### How a program runs

- The isolate id is a SHA-256 over the program, the catalog version, the allow-list, the program id and the principal's subject, so a cached isolate is only reused for the exact same inputs.
- The program module shadows `fetch` and `connect`: a host outside the allow-list rejects with a typed `SandboxEgressDenied` before any network call, and a `WorkerEntrypoint` bound as `globalOutbound` is the deny-by-default backstop.
- A `Session` program gets a Durable Object Facet named after its program id, owned by `ProgramSupervisor`. Its `ttlSeconds` schedules the alarm that deletes the facet, so the next run starts empty.
- `cpuMs`, a wall timeout and the runtime's own hang detection answer `SandboxTimeout`; an uncaught program error answers `SandboxThrew`.

### Testing

The workerd suite bundles `tests/__fixtures__/sandbox.worker.ts` and runs it under `@systemfsoftware/effect-workerd-harness`.
