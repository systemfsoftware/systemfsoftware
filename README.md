<div align="center">

# systemfsoftware

_Effect-TS libraries and the lint plugin that enforces the [constitution](https://systemfsoftware.com/constitution)_

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/systemfsoftware/systemfsoftware/release.yml?branch=main&style=flat-square&label=CI)](https://github.com/systemfsoftware/systemfsoftware/actions)
[![Constitution](https://img.shields.io/badge/built%20to-the%20constitution-black?style=flat-square)](https://systemfsoftware.com/constitution)

</div>

A pnpm monorepo of [Effect-TS](https://effect.website) packages — pure functional cores behind thin imperative shells, property-tested and mutation-gated. The `oxlint-plugin` enforces the [System F Software constitution](https://systemfsoftware.com/constitution); the monorepo lints itself with it.

## Packages

| Package                                                         | npm                                         | What it does                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`effect-gherkin-spec`](packages/effect-gherkin-spec)           | `@systemfsoftware/effect-gherkin-spec`      | `feature`/`scenario`/`outline` DSL for Gherkin-style behaviour tests composed as Effects, with Scenario Outline expansion and typed step errors.                                                                 |
| [`effect-daemon-spec`](packages/effect-daemon-spec)             | `@systemfsoftware/effect-daemon-spec`       | A typed supervision-tree daemon for Effect — leader election, lock primitives, restart-intensity windows, dynamic children, and health latches.                                                                  |
| [`oxlint-plugin`](packages/oxlint-plugin)                       | `@systemfsoftware/oxlint-plugin`            | 24 [oxlint](https://oxc.rs) rules enforcing the constitution: ban classes and string errors, forbid native timers/`Promise`/`Date` inside Effect, require pipeable composition, keep tests off the I/O boundary. |
| [`effect-schema-law`](packages/effect-schema-law)               | `@systemfsoftware/effect-schema-law`        | One call asserts the codec laws of any Effect `Schema` as Vitest property tests — decode∘encode is identity, and encoding is stable under a decode round-trip.                                                   |
| [`stryker-plugins`](packages/stryker-plugins)                   | `@systemfsoftware/stryker-plugins`          | Stryker mutation-testing plugins for Effect — `effect-schema-ignorer` skips equivalent mutants on Effect `Schema` declarations so the score reflects behaviour, not data.                                        |
| [`rx-effect`](packages/rx-effect)                               | `@systemfsoftware/rx-effect`                | Bridge RxJS and Effect — turn an Observable into a typed Effect `Stream` with backpressure and proper interruption.                                                                                              |
| [`effect-schema-extensions`](packages/effect-schema-extensions) | `@systemfsoftware/effect-schema-extensions` | Extra Effect `Schema` codecs — branded hex-string schemas with decode/encode and arbitraries.                                                                                                                    |

Supporting internal packages (`tsconfig`, `oxlint-config`, `vitest-config`) are not published.

## Install

```bash
pnpm add @systemfsoftware/effect-gherkin-spec
pnpm add @systemfsoftware/effect-daemon-spec
pnpm add -D @systemfsoftware/oxlint-plugin
```

Each package's README has a usage example and API reference.

> `effect` is a peer dependency of every published package. `effect-gherkin-spec` also peers `@effect/vitest` and `vitest`.

## Contributing

Development setup, build, test, and lint commands: [AGENTS.md](AGENTS.md).

Read the [constitution](https://systemfsoftware.com/constitution) and [`CONSTITUTION.md`](CONSTITUTION.md) before contributing. The constitution is vendored from [systemfsoftware/constitution](https://github.com/systemfsoftware/constitution) as a subtree.

## License

Licensed under [MIT](LICENSE).
