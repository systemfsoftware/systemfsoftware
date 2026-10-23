---
title: Runtime- and framework-neutral logic lives in a core library; each framework binding is its own adapter library, and a runtime difference is an export condition on ".", never a subpath or a runtime if
applies_when:
  - code needs a Worker, browser, Node or Deno-specific API
  - adding React, Astro or another framework binding to shared logic
  - the same capability must run in more than one runtime
  - writing an if on the runtime (typeof window, navigator.userAgent, process.versions) inside shared code
  - adding effect, react or another framework to a library's dependencies
tags: [composition, core, adapter, export-conditions, runtime, workerd, framework, peer-dependencies]
---

## Rule

A capability's decisions live in a core library that value-imports no runtime and no framework: no Node builtin, no `cloudflare:*` or `@cloudflare/*` module, no React, Astro, Vite or similar. It marks itself with `"layer": "core"` in `package.json`. Type-only imports are erased and allowed.

- **A framework binding** (React hooks, an Astro integration) is its own adapter library that depends on the core and peers on the framework. Never a `./react` subpath of the core.
- **A small runtime difference** (one function that differs on `workerd` and `node`) is an export condition on `.` pointing at separate per-runtime files that export the same names and types. The bundler picks one file; the other never enters the Worker bundle.
- **A platform's whole set of services shared by several applications** (a Workers or Node implementation of every platform service) is its own adapter library, one per runtime. A single application's runtime-specific implementation of one service follows (pack: composition, drivers-live-where-chosen.md) instead.
- **Never a runtime `if` in a shared file**: Workers bundle the dead branch and its `node:` imports.
- **Singletons are peers.** Every library declares `effect`, and any framework it binds (`react`, `react-dom`), in `peerDependencies`, never in `dependencies`, so an application holds one copy. Two copies of React break hooks; two copies of `effect` split `Context` tags, so a service provided by one copy is missing in the other.

That each condition branch exposes the same names and types is governed by (pack: package-topology, condition-branch-agreement.md).

## Why

A decision chained to a runtime cannot be tested or reused outside it, and once core imports one framework or vendor, every consumer inherits that runtime, bundle and credentials. Cloudflare Workers are a distinct runtime: a shared file that branches at run time still ships the Node branch to the Worker.

## Evidence

- TanStack: `start-client-core` and `start-server-core` contain zero files importing `react`; `react-start-*` are the adapters ((pack: composition, evidence/FINDINGS.md) Cycle 000, finding 1). `router/packages/router-core/package.json` `./isServer` maps conditions `development`, `workerd`, `worker`, `browser`, `deno`, `node`, `bun` to separate files from `src/isServer/{client,server,development}.ts` (finding 3).
- Effect: one package per runtime (`platform-node`, `platform-bun`, `platform-browser`) over a shared contract, because the implementations differ wholesale ((pack: composition, evidence/FINDINGS.md) Cycle 003, finding 6); conflict and ruling: (pack: composition, evidence/PACK.md) Part 3, row 10.
- Singletons: Effect and Vitest peer on `effect` and `vitest`; TanStack's `query/packages/react-query/package.json` peers on `react` (with `react-dom` only a dev dependency); Stead builds its shared libraries once behind an import map ((pack: composition, evidence/PACK.md) rule 15).
- Rat Stack `noCoreAdapters`: "Core cannot import HTTP clients or adapters. Provide a domain port from the composition root instead." (`rat-stack/scripts/oxlint-plugin-boundaries.ts:945`).

Upstream paths are relative to the repositories pinned in (pack: composition, evidence/SOURCES.md).

## Wrong / right

```ts
// WRONG: packages/ledger/src/clock.ts - a runtime branch in shared code
export const now = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers'
  ? () => Date.now()
  : () => Number(process.hrtime.bigint() / 1_000_000n)

// RIGHT: one specifier, two files, chosen by condition
// package.json: ".": { "workerd": "./src/clock.workerd.ts", "node": "./src/clock.node.ts", "default": "./src/clock.workerd.ts" }
```

## Gate

Not yet run in CI: `.github/workflows/ci.yml` runs only `repo-checks single-plan`, and no workflow runs any `composition-*` check (pack: composition, gates-are-facts-or-calibrated-judges.md).

Fact-gated: `repo-checks composition-graph` (`scripts/tools/repo-checks/composition.ts`) fails a library with `"layer": "core"` whose source value-imports a runtime or framework module (`isRuntimeModule` in `composition-facts.ts`: Node builtins, `cloudflare:*`, `@cloudflare/*`, `react`, `react-dom`, `astro`, `vite`, `next`, `vue`, `svelte`, `solid-js`, `preact`).

Judge-gated, `core-adapter-split`: `repo-checks composition-core-adapters` sends each non-core library that imports runtime modules (with how many files do, which runtime conditions its exports declare, and its dependents' kinds) to the two-model panel and asks whether it should split into core and adapters. Calibration (`scripts/tools/repo-checks/calibration/kappas.json`): kappa 0.419 over 23 cases, below the 0.7 needed to fail, so it reports only and never fails CI.

Gate: none yet for runtime `if`s in shared files; it would read, from the type checker, references to `navigator`, `process.versions` or `globalThis` runtime probes in files of a library that declares runtime export conditions.

Gate: none yet for singleton peers. It would read each library's `package.json` and fail `effect`, `react` or `react-dom` listed in `dependencies` rather than `peerDependencies`, and, from a built application, more than one resolved copy of each in its lockfile resolution or bundle.
