# Debt ledger

Scanned 1742 files across channels: opt-ins, oxlint, pnpm-patch, preset-narrowing, rust, stryker, tsconfig, typescript, vitest.

## Totals

| Kind | Count |
| --- | --- |
| InlineDirective | 0 |
| RustAttribute | 0 |
| SkippedTest | 0 |
| Marker | 0 |
| ConfigSeverity | 2 |
| PresetNarrowing | 5 |
| Grant | 43 |
| Patch | 2 |

| Status | Count |
| --- | --- |
| Declared | 52 |
| Undeclared | 0 |
| Stale | 0 |

## InlineDirective

| Location | Detail | Status |
| --- | --- | --- |

## RustAttribute

| Location | Detail | Status |
| --- | --- | --- |

## SkippedTest

| Location | Detail | Status |
| --- | --- | --- |

## Marker

| Location | Detail | Status |
| --- | --- | --- |

## ConfigSeverity

| Location | Detail | Status |
| --- | --- | --- |
| `packages/debt-ledger/tsconfig.app.json` | strictEffectProvide=off | Declared @ryanleecode — cli-provides-node-services: src/cli.ts is the bin entry point: it provides the Node services layer to the diagrams program once, at the process edge, which is where strictEffectProvide allows Effect.provide. |
| `packages/transition-diagram/tsconfig.app.json` | strictEffectProvide=off | Declared @ryanleecode — cli-provides-node-services: src/cli.ts is the bin entry point: it provides the Node services layer to the diagrams program once, at the process edge, which is where strictEffectProvide allows Effect.provide. |

## PresetNarrowing

| Location | Detail | Status |
| --- | --- | --- |
| `packages/oxlint-plugin/oxlint-plugin-effect-platform` | no-restricted-imports (**/__fixtures__/**, **/fixtures/**, **/testResources/**) | Declared @ryanleecode — node-restricted-imports-skips-fixtures: Compile-fixture and testResource trees hold the deliberate Node-builtin imports the rule forbids in production source, so no-restricted-imports is withheld from them; the override files already leave build-config files out of the rule. |
| `packages/oxlint-presets/oxlint-config-dmmf` | complexity (**/*.test.ts, **/*.spec.ts, **/__tests__/**, **/tests/**) | Declared @ryanleecode — complexity-skips-tests: The src complexity ceiling is a production-code budget: a test body arranges fixtures and asserts a sequence, which no small threshold admits, so complexity is withheld from test files instead of being switched off there. |
| `packages/oxlint-presets/oxlint-config-dmmf` | vitest/no-standalone-expect (option only) | Declared @ryanleecode — gherkin-steps-are-test-blocks: The preset runs the repo's Gherkin registrars (Given/When/Then/And/But) and the fork's prop/law/layer/flakyTest, so vitest/no-standalone-expect must treat those names as test blocks or it reports every step that asserts. |
| `packages/oxlint-presets/oxlint-config-recommended` | effecttsgo/node-builtin-import (**/src/**) | Declared @ryanleecode — node-builtin-import-is-source-only: effecttsgo/node-builtin-import is a production-source rule: build-config files (vitest.config.ts, tsdown.config.ts) and scripts legitimately import node:path and friends, so the rule is enabled only under **/src/**. |
| `packages/oxlint-presets/oxlint-config-rule-authoring` | vitest/no-standalone-expect (option only) | Declared @ryanleecode — gherkin-steps-are-test-blocks: This configuration runs the repo's Gherkin registrars (Given/When/Then/And/But) and the fork's prop/law/layer/flakyTest, so vitest/no-standalone-expect must treat those names as test blocks or it reports every step that asserts. |

## Grant

| Location | Detail | Status |
| --- | --- | --- |
| `examples/inventory-fulfillment` | unstable-platform-node (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-platform-node: the example runs on and tests with NodeHttpClient/NodeHttpServer; @effect/platform-node is @stability unstable in the Effect 4.0.1 ecosystem. |
| `examples/inventory-fulfillment` | unstable-rpc (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-rpc: the example serves RPC over HTTP: src and tests build Rpc, RpcGroup, RpcClient and RpcServer values, all @stability unstable in Effect 4.0.1. |
| `examples/inventory-fulfillment` | unstable-sql-pglite (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-sql-pglite: the example persists through PgliteClient in src and tests; @effect/sql-pglite is @stability unstable in the Effect 4.0.1 ecosystem. |
| `opt-ins.ts` | patch-drizzle-orm-effect-sql-specifiers (ThirdPartyPatch) @ryanleecode | Declared @ryanleecode — patch-drizzle-orm-effect-sql-specifiers: drizzle-orm 1.0.0-rc.5-5935859 declarations still import `effect/unstable/sql`, which Effect 4 flattened to `effect/sql`; the patch rewrites those specifiers so a drizzle-orm importer typechecks. From #571. |
| `opt-ins.ts` | patch-rolldown-dts-export-marker (ThirdPartyPatch) @ryanleecode | Declared @ryanleecode — patch-rolldown-dts-export-marker: rolldown-plugin-dts 0.28.6 is patched to emit the `export {}` marker on module .d.ts chunks: without it a published declaration re-exports every local type, so a chunk no longer exports only what it declares. From #624. |
| `opt-ins.ts` | type-refusal-fixtures-declare-their-own-errors (TypeRefusalFixtures) @ryanleecode | Declared @ryanleecode — type-refusal-fixtures-declare-their-own-errors: Compile-refusal fixtures prove a shape is rejected by holding a deliberate type error under @ts-expect-error. Their scope is excluded from the debt scan in debt-ledger.config.ts; this opt-in records the owner and reason for that exclusion so it is a declared decision, not a silent omission. |
| `packages/atom/effect-atom` | unstable-http-api (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-http-api: effect-atom models HTTP API atoms: src and tests build HttpApi, HttpApiGroup and HttpApiEndpoint values, all @stability unstable in Effect 4.0.1. |
| `packages/atom/effect-atom` | unstable-persistence (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-persistence: effect-atom backs atoms with KeyValueStore in src and tests; Effect 4.0.1 tags effect/persistence unstable and no stable replacement exists. |
| `packages/atom/effect-atom` | unstable-reactivity (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-reactivity: effect-atom keys atom reads on Reactivity in shipped src; Effect 4.0.1 tags effect/reactivity unstable and the atom runtime cannot avoid it. |
| `packages/atom/effect-atom` | unstable-rpc (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-rpc: effect-atom models RPC atoms: src and tests build Rpc, RpcGroup, RpcClient and RpcSerialization values, all @stability unstable in Effect 4.0.1. |
| `packages/daemon/effect-daemon-cluster` | unstable-cluster (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-cluster: effect-daemon-cluster drives effect/cluster: src and tests build Sharding, SingleRunner and MessageStorage values, all @stability unstable in Effect 4.0.1. |
| `packages/daemon/effect-daemon-cluster` | unstable-sql-pglite (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-sql-pglite: effect-daemon-cluster tests a cluster backed by PgliteClient; @effect/sql-pglite is @stability unstable in the Effect 4.0.1 ecosystem. |
| `packages/daemon/effect-daemon-process` | unstable-process (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-process: effect-daemon-process supervises child processes: src and tests build ChildProcess and ChildProcessSpawner values, both @stability unstable in Effect 4.0.1. |
| `packages/daemon/effect-daemon-socket` | unstable-net (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-net: effect-daemon-socket addresses peers by NetAddress in shipped src; Effect 4.0.1 tags effect/net unstable and no stable address type exists. |
| `packages/daemon/effect-daemon-socket` | unstable-socket (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-socket: effect-daemon-socket speaks the socket protocol: src and tests build Socket, SocketError and SocketServer values, all @stability unstable in Effect 4.0.1. |
| `packages/debt-ledger` | cli-provides-node-services (DiagnosticExclusion) @ryanleecode | Declared @ryanleecode — cli-provides-node-services: src/cli.ts is the bin entry point: it provides the Node services layer to the ledger program once, at the process edge, which is where strictEffectProvide allows Effect.provide. |
| `packages/debt-ledger` | unstable-cli (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-cli: src/cli.ts parses the build and check subcommands and the --dir flag with effect/cli, the first-party Effect CLI parser; Effect 4.0.1 tags effect/cli unstable and ships no stable argument parser. |
| `packages/discern` | unstable-ai (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-ai: discern is an Effect AI decision engine: src, tests and type tests build AiError, Decision and DecisionModel values, all @stability unstable in Effect 4.0.1. |
| `packages/effect-microsandbox` | unstable-arbitrary (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-arbitrary: effect-microsandbox generates property inputs with effect/Arbitrary in shipped src and src/__tests__; Effect 4.0.1 tags the whole module unstable with no stable counterpart. |
| `packages/effect-readiness` | unstable-net (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-net: effect-readiness tests address endpoints by NetAddress; Effect 4.0.1 tags effect/net unstable and the tests cannot express an endpoint without it. |
| `packages/effect-readiness` | unstable-socket (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-socket: effect-readiness probes endpoints over Socket in src and tests; Effect 4.0.1 tags effect/socket unstable and no stable socket API exists. |
| `packages/effect-unit-of-work` | unstable-sql (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-sql: the postgres adapter and the law controls run the unit over SqlClient; Effect 4.0.1 tags effect/sql unstable and no stable SQL client exists. |
| `packages/effect-unit-of-work` | unstable-sql-pglite (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-sql-pglite: the store tests run the Postgres adapter against an in-process PGlite server; @effect/sql-pglite is @stability unstable in the Effect 4.0.1 ecosystem. |
| `packages/gherkin/storybook-gherkin` | storybook-registers-stories (VitestGuardExemption) @ryanleecode | Declared @ryanleecode — storybook-registers-stories: Storybook's vitest plugin registers every story with its own runner, which the KTD8 guard refuses. |
| `packages/opt-in` | test-spawns-the-effect-tsgo-binary (TestProcessSpawn) @ryanleecode | Declared @ryanleecode — test-spawns-the-effect-tsgo-binary: effect-tsgo is a native binary with no in-process API, and proving the preset requires running the tool that reads it. Remove when @effect/tsgo ships an in-process API. |
| `packages/oxlint-plugin/oxlint-plugin-cell-architecture` | rule-tester-registers-tests (VitestGuardExemption) @ryanleecode | Declared @ryanleecode — rule-tester-registers-tests: oxlint's RuleTester registers every case with vitest's own `it`, which the KTD8 guard refuses. |
| `packages/oxlint-plugin/oxlint-plugin-dmmf-workflow` | rule-tester-registers-tests (VitestGuardExemption) @ryanleecode | Declared @ryanleecode — rule-tester-registers-tests: oxlint's RuleTester registers every case with vitest's own `it`, which the KTD8 guard refuses. |
| `packages/oxlint-plugin/oxlint-plugin-effect-platform` | node-restricted-imports-skips-fixtures (PresetNarrowing) @ryanleecode | Declared @ryanleecode — node-restricted-imports-skips-fixtures: Compile-fixture and testResource trees hold the deliberate Node-builtin imports the rule forbids in production source, so no-restricted-imports is withheld from them; the override files already leave build-config files out of the rule. |
| `packages/oxlint-plugin/oxlint-plugin-effect-platform` | rule-tester-registers-tests (VitestGuardExemption) @ryanleecode | Declared @ryanleecode — rule-tester-registers-tests: oxlint's RuleTester registers every case with vitest's own `it`, which the KTD8 guard refuses. |
| `packages/oxlint-plugin/oxlint-plugin-effect-schema` | rule-tester-registers-tests (VitestGuardExemption) @ryanleecode | Declared @ryanleecode — rule-tester-registers-tests: oxlint's RuleTester registers every case with vitest's own `it`, which the KTD8 guard refuses. |
| `packages/oxlint-plugin/oxlint-plugin-test-discipline` | rule-tester-registers-tests (VitestGuardExemption) @ryanleecode | Declared @ryanleecode — rule-tester-registers-tests: oxlint's RuleTester registers every case with vitest's own `it`, which the KTD8 guard refuses. |
| `packages/oxlint-presets/oxlint-config-dmmf` | complexity-skips-tests (PresetNarrowing) @ryanleecode | Declared @ryanleecode — complexity-skips-tests: The src complexity ceiling is a production-code budget: a test body arranges fixtures and asserts a sequence, which no small threshold admits, so complexity is withheld from test files instead of being switched off there. |
| `packages/oxlint-presets/oxlint-config-dmmf` | gherkin-steps-are-test-blocks (PresetNarrowing) @ryanleecode | Declared @ryanleecode — gherkin-steps-are-test-blocks: The preset runs the repo's Gherkin registrars (Given/When/Then/And/But) and the fork's prop/law/layer/flakyTest, so vitest/no-standalone-expect must treat those names as test blocks or it reports every step that asserts. |
| `packages/oxlint-presets/oxlint-config-recommended` | node-builtin-import-is-source-only (PresetNarrowing) @ryanleecode | Declared @ryanleecode — node-builtin-import-is-source-only: effecttsgo/node-builtin-import is a production-source rule: build-config files (vitest.config.ts, tsdown.config.ts) and scripts legitimately import node:path and friends, so the rule is enabled only under **/src/**. |
| `packages/oxlint-presets/oxlint-config-rule-authoring` | gherkin-steps-are-test-blocks (PresetNarrowing) @ryanleecode | Declared @ryanleecode — gherkin-steps-are-test-blocks: This configuration runs the repo's Gherkin registrars (Given/When/Then/And/But) and the fork's prop/law/layer/flakyTest, so vitest/no-standalone-expect must treat those names as test blocks or it reports every step that asserts. |
| `packages/runner/vitest` | unstable-arbitrary (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-arbitrary: the sfs vitest runner drives property tests through effect/Arbitrary; both its app and test projects are entrypoint-role and Effect 4.0.1 tags the module unstable. |
| `packages/sim/conformance-spec` | unstable-arbitrary (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-arbitrary: conformance-spec generates linearization inputs with effect/Arbitrary in its entrypoint-role src; Effect 4.0.1 tags the module unstable with no stable counterpart. |
| `packages/toolchain/vitest-config` | shared-config-passes-with-no-tests (PassWithNoTests) @ryanleecode | Declared @ryanleecode — shared-config-passes-with-no-tests: The pr lane leaves some packages without a spec to run, and a package that keeps no test file must still pass. |
| `packages/trace/trace-spec` | unstable-arbitrary (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-arbitrary: trace-spec exports generated stimuli through effect/Arbitrary; its app project is entrypoint-role and Effect 4.0.1 tags the module unstable. |
| `packages/trace/trace-spec` | unstable-net (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-net: trace-spec tests are addressed by NetAddress; Effect 4.0.1 tags effect/net unstable and the tests cannot express an endpoint without it. |
| `packages/trace/trace-spec` | unstable-opentelemetry (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-opentelemetry: trace-spec observes real OTel traces through OtelTracer and Resource; @effect/opentelemetry is @stability unstable and is the only OTel bridge. |
| `packages/transition-diagram` | cli-provides-node-services (DiagnosticExclusion) @ryanleecode | Declared @ryanleecode — cli-provides-node-services: src/cli.ts is the bin entry point: it provides the Node services layer to the diagrams program once, at the process edge, which is where strictEffectProvide allows Effect.provide. |
| `packages/transition-diagram` | unstable-cli (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-cli: src/cli.ts parses the build and check subcommands and the --dir flag with effect/cli, the first-party Effect CLI parser; Effect 4.0.1 tags effect/cli unstable and ships no stable argument parser. |

## Patch

| Location | Detail | Status |
| --- | --- | --- |
| `pnpm-workspace.yaml` | drizzle-orm 1.0.0-rc.5-5935859 patches/drizzle-orm@1.0.0-rc.5-5935859.patch | Declared @ryanleecode — patch-drizzle-orm-effect-sql-specifiers: drizzle-orm 1.0.0-rc.5-5935859 declarations still import `effect/unstable/sql`, which Effect 4 flattened to `effect/sql`; the patch rewrites those specifiers so a drizzle-orm importer typechecks. From #571. (recheck: any drizzle-orm upgrade must typecheck @systemfsoftware/effect-unit-of-work (and every other drizzle importer) without the patch and drop it once the published declarations import effect/sql.) |
| `pnpm-workspace.yaml` | rolldown-plugin-dts 0.28.6 patches/rolldown-plugin-dts@0.28.6.patch | Declared @ryanleecode — patch-rolldown-dts-export-marker: rolldown-plugin-dts 0.28.6 is patched to emit the `export {}` marker on module .d.ts chunks: without it a published declaration re-exports every local type, so a chunk no longer exports only what it declares. From #624. (recheck: any rolldown-plugin-dts or tsdown upgrade must re-run packages/toolchain/tsdown-config/tests/dts-export-marker.test.ts and drop the patch once upstream emits the marker.) |
