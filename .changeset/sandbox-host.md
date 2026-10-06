---
"@systemfsoftware/agent-front-door": minor
---

Add `@systemfsoftware/agent-front-door` and its `./sandbox` entry.

`layer(options)` provides the contract kernel's `Sandbox` service. Each program loads through the Worker Loader with an environment holding only its `TOOLS` stub and, for a `Session` program, a `STATE` stub. Every `fetch` and `connect` outside the capability's allow-list rejects with a typed `SandboxEgressDenied`. A `Session` program's Durable Object Facet is named after its program id and deleted when its `ttlSeconds` elapses, so a later run under the same id starts empty. A `cpuMs` budget, a wall timeout and the runtime's hang detection answer `SandboxTimeout`; an uncaught error answers `SandboxThrew`.

The entry also exports the behavior a Worker's entrypoint classes delegate to: `egressGatewayFetch`, `toolDispatcherOf`, and `programSupervisorPrepare` / `programSupervisorFacet` / `programSupervisorAlarm`.
