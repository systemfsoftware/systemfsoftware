# Debt ledger

Scanned 1732 files across channels: opt-ins, oxlint, rust, stryker, tsconfig, typescript, vitest.

## Totals

| Kind | Count |
| --- | --- |
| InlineDirective | 0 |
| RustAttribute | 0 |
| SkippedTest | 0 |
| Marker | 0 |
| ConfigSeverity | 2 |
| Grant | 36 |

| Status | Count |
| --- | --- |
| Declared | 38 |
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

## Grant

| Location | Detail | Status |
| --- | --- | --- |
| `examples/inventory-fulfillment` | unstable-platform-node (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-platform-node: the example runs on and tests with NodeHttpClient/NodeHttpServer; @effect/platform-node is @stability unstable in the Effect 4.0.1 ecosystem. |
| `examples/inventory-fulfillment` | unstable-rpc (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-rpc: the example serves RPC over HTTP: src and tests build Rpc, RpcGroup, RpcClient and RpcServer values, all @stability unstable in Effect 4.0.1. |
| `examples/inventory-fulfillment` | unstable-sql-pglite (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-sql-pglite: the example persists through PgliteClient in src and tests; @effect/sql-pglite is @stability unstable in the Effect 4.0.1 ecosystem. |
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
| `packages/opt-in` | test-spawns-the-effect-tsgo-binary (UnstableApi) @ryan | Declared @ryan — test-spawns-the-effect-tsgo-binary: The integration scenario runs the real effect-tsgo binary, whose effect/process API is unstable in Effect 4.0.1. |
| `packages/oxlint-plugin/oxlint-plugin-cell-architecture` | rule-tester-registers-tests (VitestGuardExemption) @ryanleecode | Declared @ryanleecode — rule-tester-registers-tests: oxlint's RuleTester registers every case with vitest's own `it`, which the KTD8 guard refuses. |
| `packages/oxlint-plugin/oxlint-plugin-dmmf-workflow` | rule-tester-registers-tests (VitestGuardExemption) @ryanleecode | Declared @ryanleecode — rule-tester-registers-tests: oxlint's RuleTester registers every case with vitest's own `it`, which the KTD8 guard refuses. |
| `packages/oxlint-plugin/oxlint-plugin-effect-platform` | rule-tester-registers-tests (VitestGuardExemption) @ryanleecode | Declared @ryanleecode — rule-tester-registers-tests: oxlint's RuleTester registers every case with vitest's own `it`, which the KTD8 guard refuses. |
| `packages/oxlint-plugin/oxlint-plugin-effect-schema` | rule-tester-registers-tests (VitestGuardExemption) @ryanleecode | Declared @ryanleecode — rule-tester-registers-tests: oxlint's RuleTester registers every case with vitest's own `it`, which the KTD8 guard refuses. |
| `packages/oxlint-plugin/oxlint-plugin-test-discipline` | rule-tester-registers-tests (VitestGuardExemption) @ryanleecode | Declared @ryanleecode — rule-tester-registers-tests: oxlint's RuleTester registers every case with vitest's own `it`, which the KTD8 guard refuses. |
| `packages/runner/vitest` | unstable-arbitrary (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-arbitrary: the sfs vitest runner drives property tests through effect/Arbitrary; both its app and test projects are entrypoint-role and Effect 4.0.1 tags the module unstable. |
| `packages/sim/conformance-spec` | unstable-arbitrary (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-arbitrary: conformance-spec generates linearization inputs with effect/Arbitrary in its entrypoint-role src; Effect 4.0.1 tags the module unstable with no stable counterpart. |
| `packages/toolchain/vitest-config` | shared-config-passes-with-no-tests (PassWithNoTests) @ryanleecode | Declared @ryanleecode — shared-config-passes-with-no-tests: The pr lane leaves some packages without a spec to run, and a package that keeps no test file must still pass. |
| `packages/trace/trace-spec` | unstable-arbitrary (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-arbitrary: trace-spec exports generated stimuli through effect/Arbitrary; its app project is entrypoint-role and Effect 4.0.1 tags the module unstable. |
| `packages/trace/trace-spec` | unstable-net (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-net: trace-spec tests are addressed by NetAddress; Effect 4.0.1 tags effect/net unstable and the tests cannot express an endpoint without it. |
| `packages/trace/trace-spec` | unstable-opentelemetry (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-opentelemetry: trace-spec observes real OTel traces through OtelTracer and Resource; @effect/opentelemetry is @stability unstable and is the only OTel bridge. |
| `packages/transition-diagram` | cli-provides-node-services (DiagnosticExclusion) @ryanleecode | Declared @ryanleecode — cli-provides-node-services: src/cli.ts is the bin entry point: it provides the Node services layer to the diagrams program once, at the process edge, which is where strictEffectProvide allows Effect.provide. |
| `packages/transition-diagram` | unstable-cli (UnstableApi) @ryanleecode | Declared @ryanleecode — unstable-cli: src/cli.ts parses the build and check subcommands and the --dir flag with effect/cli, the first-party Effect CLI parser; Effect 4.0.1 tags effect/cli unstable and ships no stable argument parser. |
