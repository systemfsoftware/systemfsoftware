# @systemfsoftware/oxlint-plugin-effect-policy

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-policy?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-effect-policy)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-policy?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> An oxlint plugin for Effect-TS teams who want policy files that stay domain-blind decorators.

```
x @systemfsoftware/effect-policy(policy-no-error-rewriting): Effect.mapError is forbidden.
  Expected: the caller's error channel E unchanged — only Xi refusals may be added.
  Actual: a call that rewrites, swallows, or removes E.
  Fix: observe failures with Effect.tapError, or add a refusal via Effect.timeoutFail / Effect.retry.

Found 0 warnings and 1 error.
```

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-policy
```

## The Problem

A `*.policy.ts` is a rank-2 combinator that wraps any `Effect<A, E, R>` to govern only HOW it runs — serialization, rate-limiting, timeout, retry, circuit-breaking. It is domain-blind by construction: it must never touch `A`, never rewrite the caller's `E`, and never import a domain module of any cell. Add an `Effect.mapError`, a `./order.store` import, or a concrete return type and it still compiles — the file has stopped being a policy and become an executor in disguise, and no tool knows the difference.

These three rules make that convention executable. Every rule is inert on any file not named `*.policy.ts`.

## Quick Start

```ts
// oxlint.config.ts
import effectPolicy from '@systemfsoftware/oxlint-plugin-effect-policy'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-policy'],
  rules: { ...effectPolicy.configs.recommended.rules },
})
```

```bash
pnpm oxlint src
```

On a clean codebase: `Found 0 warnings and 0 errors.`

To adopt gradually, drop the spread and name rules individually as `'@systemfsoftware/oxlint-plugin-effect-policy/<rule>': 'warn'`. Entries placed after the spread override it.

## Rules

| Rule                         | Reports                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy-combinator-export`   | A `*.policy.ts` with no rank-2 combinator export — no generic function taking an `Effect`-typed first parameter, and no value annotated with a `*Policy` type. A file with no combinator has no policy in it (PO4)                                                                                                                                                                                                    |
| `policy-no-error-rewriting`  | A call to `Effect.mapError`, `Effect.mapBoth`, `Effect.orElse`, `Effect.orElseFail`, `Effect.orElseSucceed`, `Effect.orDie`, `Effect.orDieWith`, `Effect.catchAll`, `Effect.catchCause`, `Effect.catchTag`, `Effect.catchTags`, … — anything that rewrites, swallows, or removes the caller's `E`. `Effect.tapError` (observation), `Effect.retry`, `Effect.timeout`, and `Effect.timeoutFail` (adding Xi) pass (PO3) |
| `policy-no-junk-drawer-path` | A `*.policy.ts` under a junk-drawer segment after `src/`: `core`, `shell`, `utils`, `helpers`, `entities`, `components`, `hooks`, `controllers`, `jobs`, `db`, `migrations`, `service`, `manager`, `use-case`, `repository` (PO5)                                                                                                                                                                                     |

## FAQ

**Q: `Failed to parse config … Unknown plugin: '@systemfsoftware/oxlint-plugin-effect-policy'`.**
A: The name was placed in oxlint's `plugins` field, which takes built-in namespaces only. JavaScript plugins load through `jsPlugins`; their rules go in `rules`.

**Q: Installed, but nothing is reported.**
A: Every rule is filename-gated. Only `*.policy.ts` files are examined.

**Q: My stateful policy exports a factory and a Layer next to the combinator — will it be flagged?**
A: No. `policy-combinator-export` is an obligation, not a single-export rule: it requires at least one rank-2 combinator and lets the stateful factory, `Layer`, and `Xi` error classes ride along.

**Q: My policy has no refusals (`Xi = never`) and imports a sibling policy.**
A: Both pass — importing `.policy` modules is how policies compose (`andThen`), and a waiting policy that blocks for a permit needs no `TaggedError`.

## Requirements

`effect` and TypeScript 5.0+ as peers. Rules read syntax only; no type information or `tsconfig` wiring needed.

## Contributing

[AGENTS.md](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/oxlint-plugins/effect-policy/AGENTS.md)

## License

[Apache 2.0](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
