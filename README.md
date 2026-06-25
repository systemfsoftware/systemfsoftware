<div align="center">

# systemfsoftware

_Effect-TS libraries and the lint plugin that enforces the [constitution](https://systemfsoftware.com/constitution) — from [System F Software](https://systemfsoftware.com)_

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Constitution](https://img.shields.io/badge/built%20to-the%20constitution-black?style=flat-square)](https://systemfsoftware.com/constitution)
[![System F Software](https://img.shields.io/badge/systemfsoftware.com-black?style=flat-square)](https://systemfsoftware.com)

[Packages](#packages) • [Install](#install) • [Develop](#develop)

</div>

A pnpm monorepo of [Effect-TS](https://effect.website) packages, each built as a **pure functional core behind a thin imperative shell** and gated by property tests and a 100% mutation score — the discipline the [System F Software constitution](https://systemfsoftware.com/constitution) codifies. One of the packages, `oxlint-plugin`, is the linter that enforces that discipline; the monorepo lints itself with it.

## Packages

| Package                                                         | npm                                         | What it does                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`effect-gherkin-spec`](packages/effect-gherkin-spec)           | `@systemfsoftware/effect-gherkin-spec`      | Write Vitest specs as Effect-native Gherkin features — `Given`/`When`/`Then` steps that compose as Effects, with Scenario Outline expansion and typed step errors.                                               |
| [`effect-daemon-spec`](packages/effect-daemon-spec)             | `@systemfsoftware/effect-daemon-spec`       | A typed supervision-tree daemon for Effect — leader election, lock primitives, restart-intensity windows, dynamic children, and health latches.                                                                  |
| [`oxlint-plugin`](packages/oxlint-plugin)                       | `@systemfsoftware/oxlint-plugin`            | 25 [oxlint](https://oxc.rs) rules enforcing the constitution: ban classes and string errors, forbid native timers/`Promise`/`Date` inside Effect, require pipeable composition, keep tests off the I/O boundary. |
| [`effect-schema-law`](packages/effect-schema-law)               | `@systemfsoftware/effect-schema-law`        | One call asserts the codec laws of any Effect `Schema` as Vitest property tests — decode∘encode is identity, and encoding is stable under a decode round-trip.                                                   |
| [`stryker-plugins`](packages/stryker-plugins)                   | `@systemfsoftware/stryker-plugins`          | Stryker mutation-testing plugins for Effect — `effect-schema-ignorer` skips equivalent mutants on Effect `Schema` declarations so the score reflects behaviour, not data.                                        |
| [`rx-effect`](packages/rx-effect)                               | `@systemfsoftware/rx-effect`                | Bridge RxJS and Effect — turn an Observable into a typed Effect `Stream` with backpressure and proper interruption.                                                                                              |
| [`effect-schema-extensions`](packages/effect-schema-extensions) | `@systemfsoftware/effect-schema-extensions` | Extra Effect `Schema` codecs — branded hex-string schemas with decode/encode and arbitraries.                                                                                                                    |

Supporting internal tooling (`tsconfig`, `oxlint-config`, `vitest-config`) lives under [`packages/`](packages) and is not published.

## Install

```bash
pnpm add @systemfsoftware/effect-gherkin-spec
pnpm add @systemfsoftware/effect-daemon-spec
pnpm add -D @systemfsoftware/oxlint-plugin
```

> [!NOTE]
> `effect` is a peer dependency. `effect-gherkin-spec` also peers `@effect/vitest` and `vitest`.

## Develop

```bash
pnpm install
pnpm build        # tsdown, in dependency order (turbo)
pnpm typecheck    # tsgo (TypeScript 7) + tsc
pnpm test         # vitest — property + composition suites
pnpm lint         # dprint check + oxlint (self-hosted plugin)
pnpm --filter @systemfsoftware/effect-daemon-spec mutation   # stryker, 100% gate
```

> [!IMPORTANT]
> Read [`CONSTITUTION.md`](CONSTITUTION.md) (the design law) and [`AGENTS.md`](AGENTS.md) (workspace invariants) before contributing. The constitution is vendored from [systemfsoftware/constitution](https://github.com/systemfsoftware/constitution) as a subtree.
