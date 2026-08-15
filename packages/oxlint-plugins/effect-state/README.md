# @systemfsoftware/oxlint-plugin-effect-state

> An oxlint plugin for Effect-TS teams who want escaping live state quarantined behind a domain-typed surface.

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-state
```

## The Problem

A `*.state.ts` is the quarantine for escaping live state — the one place a `Map<K, Deferred<V>>`, a `Ref`, or a `Semaphore` may outlive the operation that created it. Without a gate, the map lands in an executor, the raw `Ref` gets exported for callers to poke, a second `Context.Tag` spawns a competing instance, or the file turns out to hold no state at all.

These rules make the quarantine executable. Every rule is inert on any file not named `*.state.ts`.

## Quick Start

```ts
// oxlint.config.ts
import effectState from '@systemfsoftware/oxlint-plugin-effect-state'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-state'],
  rules: { ...effectState.configs.recommended.rules },
})
```

## Rules

| Rule                             | Reports                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `state-quarantine-holds-state`   | A `*.state.ts` that constructs no escaping coordination primitive at module scope — a misnamed service or empty shell                      |
| `state-no-raw-primitive-exports` | An exported `Map`/`Set`/`Ref`/`Deferred`/`Semaphore`/`TRef` — the surface must be domain-typed (`withLock`, `joinInFlight`, `ask`, `tell`) |
| `state-single-tag-export`        | Zero or more than one exported `Context.Tag` — the Tag is the cell's identity; competing Tags defeat the quarantine                        |

Two constraints stay review-gated and out of mechanical reach for this package: how an importing pure cell depends on the state surface (owned by that cell), and the `*.state.ts` suffix itself (owned by `cell-taxonomy`).

[Apache 2.0](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
