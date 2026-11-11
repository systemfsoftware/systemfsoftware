# systemfsoftware

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/systemfsoftware/systemfsoftware/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/systemfsoftware/systemfsoftware/actions)

This monorepo holds the TypeScript packages that System F Software builds on Effect: typed contracts for a pure decision core wrapped in a thin I/O shell, Effect Schema property tests, Oxlint rules that enforce the architecture, and spec harnesses for Effect code.

Every package is `@systemfsoftware/*` and is built on Effect v4 (`effect` `^4.1.2`).

## Install a package

Install `@systemfsoftware` packages from **https://nix.systemfsoftware.com**, the registry for this organization's packages, through a Nix flake. Do not install them with `npm install` or `pnpm add`: the npm copies on the public registry are older builds that this repository no longer publishes.

Add this repository as a flake input, and give your flake the registry as a substituter:

```nix
{
  nixConfig = {
    extra-substituters = "https://nix.systemfsoftware.com";
    extra-trusted-public-keys = "nix-cache-1:wXA8I4DayNW9q6enUyQA/P/nT38pGSTLt374t3gsn7M=";
    fallback = true;
  };

  inputs = {
    producer.url = "github:systemfsoftware/systemfsoftware/<rev>";
    nixpkgs.follows = "producer/nixpkgs";
    pnpm-release-management.url = "github:systemfsoftware/pnpm-release-management";
  };
}
```

Then take the producer's tarballs and a pnpm store built from them with `lib.mkProducerTarballs` and `lib.mkPnpmConsumerStore` from `pnpm-release-management`. The full consumer route, including the `files.".deps"` wiring, is in [Distribution through Nix](https://github.com/systemfsoftware/pnpm-release-management#distribution-through-nix).

Third-party peers install from npm as usual. For example, `effect` is `^4.1.2`:

```bash
pnpm add 'effect@^4'
```

## Packages

### Core architecture

| Package                                                                 | What it is                                                                                                |
| :---------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| [`@systemfsoftware/effect-cell-types`](packages/effect-cell-types)      | Type contracts for the cell taxonomy: branded `Workflow` types, the `Sandwich` stage builder, and `Cell`. |
| [`@systemfsoftware/effect-atom`](packages/atom/effect-atom)             | Reactive toolkit for Effect, forked from `tim-smart/effect-atom`.                                         |
| [`@systemfsoftware/effect-atom-react`](packages/atom/effect-atom-react) | React bindings for `effect-atom`.                                                                         |

### Schema and property laws

| Package                                                                                             | What it is                                                                                              |
| :-------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| [`@systemfsoftware/effect-schema-law`](packages/schema/effect-schema-law)                           | Turns an Effect Schema's codec laws (round-trip identity, encode stability) into Vitest property tests. |
| [`@systemfsoftware/effect-schema-vite`](packages/schema/effect-schema-vite)                         | Vite plugin that discovers Schema exports and injects the law tests.                                    |
| [`@systemfsoftware/effect-schema-discovery`](packages/schema/effect-schema-discovery)               | Source-discovery walk for the Vite law plugin.                                                          |
| [`@systemfsoftware/effect-schema-recursion-budget`](packages/schema/effect-schema-recursion-budget) | `recursionBudget` annotations for recursive Schema unions.                                              |

### Specs and simulation

| Package                                                                        | What it is                                                                          |
| :----------------------------------------------------------------------------- | :---------------------------------------------------------------------------------- |
| [`@systemfsoftware/effect-gherkin-spec`](packages/gherkin/effect-gherkin-spec) | Gherkin Given/When/Then steps that run as Effects under Vitest.                     |
| [`@systemfsoftware/storybook-gherkin`](packages/gherkin/storybook-gherkin)     | Gherkin scenarios that run as Storybook play functions.                             |
| [`@systemfsoftware/effect-spec-runtime`](packages/effect-spec-runtime)         | Registrar core behind the Effect spec harnesses.                                    |
| [`@systemfsoftware/trace-spec`](packages/trace/trace-spec)                     | Trace contracts as executable specs, checked against an in-memory exporter.         |
| [`@systemfsoftware/trace-taxonomy`](packages/trace/trace-taxonomy)             | Declared spans with typed required attributes.                                      |
| [`@systemfsoftware/differential-spec`](packages/sim/differential-spec)         | Differential testing of candidate code against a reference implementation.          |
| [`@systemfsoftware/conformance-spec`](packages/sim/conformance-spec)           | Concurrency conformance checks: linearizability against a pure model.               |
| [`@systemfsoftware/effect-sim-kernel`](packages/sim/effect-sim-kernel)         | Deterministic simulation kernel with a controlled scheduler and deadlock detection. |

### Test and build tooling

| Package                                                                | What it is                                                 |
| :--------------------------------------------------------------------- | :--------------------------------------------------------- |
| [`@systemfsoftware/vitest`](packages/runner/vitest)                    | Fork of `@effect/vitest` whose defaults suit Effect tests. |
| [`@systemfsoftware/tsconfig`](packages/toolchain/tsconfig)             | Shared TypeScript base configs.                            |
| [`@systemfsoftware/vitest-config`](packages/toolchain/vitest-config)   | Shared Vitest configuration.                               |
| [`@systemfsoftware/tsdown-config`](packages/toolchain/tsdown-config)   | Shared tsdown build configuration.                         |
| [`@systemfsoftware/stryker-config`](packages/toolchain/stryker-config) | Shared Stryker mutation-testing configuration.             |

### Oxlint rules and presets

| Package                                                                                                       | What it is                                                                       |
| :------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------- |
| [`@systemfsoftware/oxlint-plugin-cell-architecture`](packages/oxlint-plugin/oxlint-plugin-cell-architecture)  | Rules for cell boundary isolation, tag discipline and export structure.          |
| [`@systemfsoftware/oxlint-plugin-dmmf-workflow`](packages/oxlint-plugin/oxlint-plugin-dmmf-workflow)          | Purity, exhaustiveness and complexity rules for a `Workflow.make` decision body. |
| [`@systemfsoftware/oxlint-plugin-effect-platform`](packages/oxlint-plugin/oxlint-plugin-effect-platform)      | Effect Platform entrypoint, I/O boundary and native-global rules.                |
| [`@systemfsoftware/oxlint-plugin-effect-schema`](packages/oxlint-plugin/oxlint-plugin-effect-schema)          | Rules for Effect Schema declarations: tagged errors and schema file shape.       |
| [`@systemfsoftware/oxlint-plugin-test-discipline`](packages/oxlint-plugin/oxlint-plugin-test-discipline)      | Rules for property-test laws, test placement and test naming.                    |
| [`@systemfsoftware/oxlint-config-recommended`](packages/oxlint-presets/oxlint-config-recommended)             | Preset combining the rule sets below.                                            |
| [`@systemfsoftware/oxlint-config-cell-architecture`](packages/oxlint-presets/oxlint-config-cell-architecture) | Preset for cell boundaries.                                                      |
| [`@systemfsoftware/oxlint-config-dmmf`](packages/oxlint-presets/oxlint-config-dmmf)                           | Preset for workflow purity and schema boundaries.                                |
| [`@systemfsoftware/oxlint-config-rule-authoring`](packages/oxlint-presets/oxlint-config-rule-authoring)       | Preset for authoring custom Oxlint AST plugins.                                  |

### In their own repositories

These packages left this repository. Each one is built, tested and versioned in its own `systemfsoftware/<repo>`:

| Repository         | Packages                                                                                 |
| :----------------- | :--------------------------------------------------------------------------------------- |
| `effect-readiness` | `@systemfsoftware/effect-readiness`                                                      |
| `effect-daemon`    | `@systemfsoftware/effect-daemon-spec`, `-conformance`, `-process`, `-socket`, `-cluster` |
| `effect-microvm`   | `@systemfsoftware/effect-microsandbox`, `@systemfsoftware/effect-daemon-microvm`         |
| `effect-e2e`       | `@systemfsoftware/effect-e2e`, `-web`, `-cli`                                            |
| `hex-schema`       | `@systemfsoftware/hex-schema`, `@systemfsoftware/effect-schema-extensions`               |
| `discern`          | `@systemfsoftware/discern`                                                               |
| `effect-memfs`     | `@systemfsoftware/effect-memfs`                                                          |
| `npm-package`      | `@systemfsoftware/npm-package`                                                           |
| `rx-effect`        | `@systemfsoftware/rx-effect`                                                             |

## Example

The cell architecture's worked example is the [Effect Endgame Starter Kit](https://github.com/systemfsoftware/effect-endgame-starter-kit): one Cloudflare Worker whose guestbook feature runs a pure `Workflow.make` decision over Effect RPC and D1, with its property laws, browser journeys and removal steps.

Start a project from it with:

```bash
gh repo create <name> --template systemfsoftware/effect-endgame-starter-kit
```

## Documentation

- [Cell Architecture](compound-packs/cell-architecture): file kinds, services and layers, and how cells compose.
- [Schema Modelling](compound-packs/schema-modelling): how Effect Schema declares invariants and wire shapes.
- [Testing](compound-packs/testing) and [Property Testing](compound-packs/property-testing): what a behaviour test proves, and what makes a property real.
- [Package Surface](compound-packs/package-surface): what a workspace package exposes through its `exports` map.
- [CONCEPTS.md](CONCEPTS.md): the domain vocabulary and verification gates.

The other packs under [`compound-packs/`](compound-packs) cover configuration, UI state and testing, design system, page accessibility, CI workflows and public-repository rules.

## Contributing

Local setup, Nix flakes, the commit convention and the pre-delivery check are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

effect-e2e rebuilds [TesterArmy's e2e](https://github.com/tester-army/e2e) (commit `72abddd`, npm `e2e` 0.21.2, Apache-2.0). See [NOTICE](NOTICE).

## License

Apache 2.0. See [LICENSE](LICENSE).
