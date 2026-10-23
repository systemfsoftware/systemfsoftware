---
title: Only applications read configuration and choose Layers, once, at their composition root; libraries take plain options and declare services
applies_when:
  - reading an environment variable, a Worker binding, a secret or a Config value
  - choosing which implementation of a service runs in a deployment
  - a library needs a value that differs per deployment, such as an API key or a database id
  - writing a layerConfig, or calling Config.* inside a library
  - calling Effect.provide, Layer.provide or ManagedRuntime.make outside an application's entry file
tags: [composition, config, layers, composition-root, env, bindings]
---

## Rule

Configuration is read at an application's composition root and nowhere else. The composition root is the application's entry file (`src/main.ts`, or the Worker entry): it reads `Config`, the Worker `env` and secrets, decides which Layer provides each service, builds the Layer graph once, and interprets the program once.

- A library declares what it needs as services (`Context.Service`) and publishes lazy Layers: a pure `layer` on the service, or a parameterized `layer(options)` whose options are plain values the application passes in. A library never reads configuration in any form: no `Config.*` (so no `layerConfig` in a library), no `process.env`, `Deno.env`, `import.meta.env`, no Worker `env`, and no binding object (`D1Database`, `KVNamespace`) as a parameter or property.
- A Cloudflare resource a driver adapter library uses is declared by that library's Layer and bound through Alchemy's binding services, not passed in by the application (pack: composition, drivers-live-where-chosen.md).
- No library code and no request handler body calls `Effect.provide`, `Layer.provide` or `ManagedRuntime.make`. Request-scoped services (current user, request id) are provided once per request by edge middleware before the handler body runs.
- Which file a Layer lives in is governed by (pack: cell-architecture, service-and-layer-boundaries.md), except that its `layerConfig` in a library does not apply here; where a driver Layer lives is (pack: composition, drivers-live-where-chosen.md).

## Why

A library that reads its environment cannot be tested without faking the host, cannot run in a second deployment, and leaks its host's configuration keys into its API: a `layerConfig` naming `STRIPE_KEY` fixes the key's name for every application that uses it. With one reader, an application can rename a key, take it from a secret store, or pass a test value, without touching the library. Binding Layers in the middle of a pipeline scatters the wiring, rebuilds clients per request, and removes the one place where a substitution (a test Layer, a second vendor) is made. With one root, an unprovided service is a compile error at that root.

## Evidence

- Effect: platform implementations take options and leave `Config` to the root; `effect-smol/packages/platform-node/src/NodeFileSystem.ts:7` "this module only chooses the Node implementation" ((pack: composition, evidence/FINDINGS.md) Cycle 003, finding 5).
- Rat Stack composes by supplying Layers in its applications (`rat-stack/apps/site/src/app.ts`, `rat-stack/apps/cli/src/surfaces.ts`), and its D1 Layer takes only `{ id }` (`rat-stack/packages/database/src/d1.ts`) ((pack: composition, evidence/FINDINGS.md) Cycle 005; (pack: composition, evidence/PACK.md) rule 18).
- Conflict ruled against: Rat Stack reads `Config` in its applications (`rat-stack/apps/site/src/worker.ts`, `rat-stack/apps/infra/alchemy.run.ts`) and also in libraries (`rat-stack/packages/core/src/config-service.ts`, `rat-stack/packages/flags/src/config.ts`), and (pack: composition, evidence/PACK.md) rule 19 allows `Config` inside an adapter's `layerConfig`. This rule is stricter: a library takes plain options, so the one reader is the application.
- younna-ai: `workers/platform` is the de-facto composition root "without the rule that keeps it so" ((pack: composition, evidence/FINDINGS.md) Cycle 006, finding 6). At younna-ai `a80c7cb3b6` its Layer wiring is in `workers/platform/src/worker.ts` and `workers/platform/src/git-worker.ts`: the root exists, but no gate kept it the only one.

Upstream paths are relative to the repositories pinned in (pack: composition, evidence/SOURCES.md).

## Wrong / right

```ts
// WRONG: packages/billing/src/stripe.ts - a library reading the host
export const charge = (amount: number) =>
  Effect.provide(chargeProgram(amount), StripeClient.layer({ key: process.env.STRIPE_KEY! }))

// WRONG: packages/billing/src/Stripe.ts - Config in a library is still reading the host
export const layerConfig = Layer.unwrap(Effect.map(Config.redacted('STRIPE_KEY'), (key) => layer({ key })))

// RIGHT: packages/billing/src/Stripe.ts takes the value as an option
export const layer = (options: { key: Redacted.Redacted }) => Layer.effect(Stripe, make(options))

// RIGHT: workers/billing/src/main.ts reads Config and provides, once
const StripeLive = Layer.unwrap(Effect.map(Config.redacted('STRIPE_KEY'), (key) => Stripe.layer({ key })))
const Live = Layer.mergeAll(Billing.layer, StripeLive)
```

## Gate

Not yet run in CI: `.github/workflows/ci.yml` runs only `repo-checks single-plan`, and no workflow runs any `composition-*` check (pack: composition, gates-are-facts-or-calibrated-judges.md).

Fact-gated: `repo-checks composition-graph` (`scripts/tools/repo-checks/composition.ts`, environment facts from `composition-facts.ts`) fails a library source file that references `process.env`, `Deno.env` or `import.meta.env` (followed through aliases, namespace imports, default imports and `import { env } from 'node:process'`; a local of the same name is not the global), a parameter or property whose type the compiler resolves to Cloudflare's `Env` or to an object with Cloudflare binding classes (`KVNamespace`, `D1Database`, ...; `isCloudflareEnv`), or an `env` import from `cloudflare:workers`. A name alone never decides: when a library's dependencies are not installed the check reports it instead of guessing.

Fact-gated, oxlint plugin `@systemfsoftware/oxlint-plugin-effect-platform` (`packages/oxlint-plugin/oxlint-plugin-effect-platform/src/rules/`), run through a package's own `lint` task where its oxlint config enables the plugin: `runtime-construction-placement` reports `ManagedRuntime.make` or `Layer.provide` inside a function body and `ManagedRuntime.make` at module scope outside `main.ts`; `entrypoint-interprets-once` requires exactly one interpretation edge in `main.ts`; `entrypoint-no-exports` and `entrypoint-not-imported` keep `main.ts` an edge nothing imports.

Gate: none yet for `Config.*` in a library. It would read, from the type checker, each reference whose symbol resolves to effect's `Config` module in a file of a unit whose `unit` is `library`.

Gate: none yet for `Effect.provide` inside a library or handler body; it would read, from the type checker, each call whose callee resolves to effect's `Effect.provide`, and its file's unit kind.
