<div align="center">

# systemfsoftware

_Effect-TS libraries and developer tooling for functional software architecture_

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/systemfsoftware/systemfsoftware/release.yml?branch=main&style=flat-square&label=CI)](https://github.com/systemfsoftware/systemfsoftware/actions)

</div>

A workspace of modular [Effect-TS](https://effect.website) libraries, testing utilities, and linters designed around pure functional cores and verifiable boundaries.

## Packages

| Package                                                                                     | Purpose                                                                               |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`@systemfsoftware/effect-gherkin-spec`](packages/testing/specs/gherkin/effect)             | BDD `feature`/`scenario` specifications composed as typed Effect workflows.           |
| [`@systemfsoftware/effect-daemon-spec`](packages/core/effect/daemon-spec)                   | Supervision tree daemon primitives, leader election, and health monitors.             |
| [`@systemfsoftware/effect-schema-law`](packages/core/effect/schema/law)                     | The Rule of Schemas as a property test: round-trip identity and encode stability.     |
| [`@systemfsoftware/effect-schema-refutation`](packages/core/effect/schema/refutation)       | What a schema rejects — refusal properties plus an adequacy check over its own AST.   |
| [`@systemfsoftware/effect-schema-bounded-union`](packages/core/effect/schema/bounded-union) | A recursive schema union whose generated values terminate; decoding is unchanged.     |
| [`@systemfsoftware/rx-effect`](packages/core/effect/rx/rx-effect)                           | Bidirectional bridge between RxJS Observables and backpressured Effect Streams.       |
| [`@systemfsoftware/oxlint-plugin`](packages/lint/oxlint/plugins/meta/core)                  | Fast Oxlint rules enforcing functional purity, schema invariants, and test placement. |
| [`@systemfsoftware/omp-agent-discipline`](omp/plugins/omp-agent-discipline)                 | Guardrails and dispatch interception for Oh My Pi coding agents.                      |
| [`@systemfsoftware/omp-claude-compat`](omp/plugins/omp-claude-compat)                       | Claude Code settings and hook compatibility extension for Oh My Pi.                   |

## Quick Start

Install packages directly using your preferred package manager:

```bash
pnpm add @systemfsoftware/effect-gherkin-spec
```

```bash
pnpm add -D @systemfsoftware/oxlint-plugin
```

## Contributing

Development setup and developer commands are documented in [AGENTS.md](AGENTS.md).

## License

Licensed under [Apache 2.0](LICENSE).
