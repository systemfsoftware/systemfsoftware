---
title: Cell Service and Layer Structure - Plan
type: refactor
date: 2026-10-10
topic: cell-service-layer-structure
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Cell Service and Layer Structure - Plan

## Goal Capsule

- **Objective:** an author adding a capability to a cell-architecture package knows where the contract, each implementation, and each test double go, and importing a contract never makes the importer depend on a driver (a vendor SDK, a host runtime, or a native binary).
- **Product authority:** the root rules on this recommendation. Until then the pack text on `origin/main` stands; nothing here changes code.
- **Open blockers:** the root's ruling on the four Key Decisions; the fate of the open PR #708, which amends the same gritlint rule this plan would amend.

---

## Product Contract

### Summary

A service is a `Context.Service` class in `<capability>.service.ts`. An implementation that needs only Effect and abstract platform tags is a `static readonly layer` on that class. An implementation that imports a driver is a separate module beside the service, named for the capability and the technology, imported only by composition roots and tests. Layers are named `layer`, `layerConfig`, `layerTest`, `layerNoop`, never `Live` or `Default`. A content-keyed lint rule checks the direct-import half; the package graph is the control for the rest.

### Problem Frame

The answer on `origin/main` contradicts itself in four places, so an author or reviewer gets a different verdict depending on which file they read.

- `compound-packs/cell-architecture/ports-separate-from-layers.md` forbids a Layer in the port's module and puts ports in `ports/` and adapters in `store/`. `compound-packs/cell-architecture/service-and-layer-boundaries.md:36` allows a `static readonly layer` on the service class (tier 2), and `:27`, `:37` put driver-backed implementations in `src/drivers/` or `src/store/`.
- The gritlint rule `packs/cell-architecture/rules/service-exports-no-layer.md` refuses every Layer in a `*.service.ts`, including the tier 2 form the doc allows. `gritlint.json` does not enable the pack, so nothing runs it.
- `service-and-layer-boundaries.md:48` prescribes `static readonly Default`, Effect v3 vocabulary that Effect 4 replaced with `layer`.
- The code follows none of these consistently: 0 of 11 `*.service.ts` files under `packages/*/src` carry a static layer, `src/drivers/` exists in 2 packages, the one published `*Live` (`packages/upstream-manifest/src/git.ts:58`) needs only an abstract platform tag, and its double is `git.memory.ts`.

### Key Decisions

- **A pure static layer stays on the service class.** Effect 4 defines the service and its primary layer together; the harm the separate-module rule guards against (importing the contract pulls in a driver) exists only when the layer's module imports a driver. Governs R2, R3.
- **A driver-backed implementation is a flat sibling module named for capability and technology, with no folder and no new role suffix.** A folder named for a technical kind is the layer bucket the wiki rules against, and a suffix cannot carry a gate a stranger is bound by. Governs R5, R6.
- **Test doubles live with the test unless they are a product.** A store's in-memory fake and a double published for consumers' own tests are products; every other double is test-local. Governs R9, R10, R11.
- **The gate keys on what a module declares and imports, not on its filename.** CONST-T12 forbids deciding a check from a name or location. Governs R12, R13.

### Requirements

A driver, in these requirements, is a package that performs I/O, binds a host runtime (`node:*`, `@effect/platform-*`), or ships a native or platform-specific binary (`oxc-parser`). Pure computation libraries (`@noble/hashes`) and the abstract tags `effect` exports (`FileSystem`, `Path`, `ChildProcessSpawner`, `HttpClient`, `SqlClient`) are not drivers.

**The service module**

- R1. A capability's contract is a `Context.Service` class in `<capability>.service.ts` with a namespaced key and a shape whose operations require nothing (`R = never`).
- R2. The service module imports no driver, statically or through `import()`.

**Pure implementations**

- R3. An implementation that needs only Effect and abstract tags is `static readonly layer = Layer.effect(this, this.make)` on the class, and leaves those tags in the layer's requirements for the composition root to supply.
- R4. Layer members are named `layer` (primary), `layerConfig` (reads `Config`), `layerTest`, `layerNoop`, or another `layer<Variant>`; `Live` and `Default` are not used; the constructor effect is `make`.

**Driver-backed implementations**

- R5. An implementation that imports a driver (R2) lives in its own module that imports the service module, exports module-level `make` and `layer` (and `layerConfig` when it reads `Config`), and is imported only by composition roots and tests.
- R6. That module sits flat beside the service module, named `<capability>-<technology>.ts`, with no `drivers/`, `adapters/`, or `store/` folder and no role suffix; a module that is already a cell kind (`*.handle.ts`, `*.blueprint.ts`) keeps its kind suffix.
- R7. The implementation moves to its own package, named `<package>-<technology>`, when the package has consumers outside the repository and the driver is heavy or platform-restricted for them.
- R8. Only a composition root supplies concrete runtime layers; a library publishes lazy `layer` values and performs no effect at import.

**Test doubles**

- R9. A test double is built in the test or under `tests/__fixtures__` with `Layer.succeed(Tag, Tag.of(...))` or `Layer.mock(Tag)(...)`, and is not placed in `src/` unless R10 or R11 applies.
- R10. A store ships its in-memory fake as `<capability>-memory.ts` beside the service, and a contract suite that the fake and the real adapter both pass.
- R11. A double that consumers need for their own tests is published as `layerTest` or `layerNoop` on the service class.

**Gates**

- R12. A lint rule refuses a module that declares a `Context.Service` and imports a specifier from a reviewed driver preset, reporting the import's file and line.
- R13. Reach through another module is checked by the package graph, not by R12: in the separate-package form the contract package's manifest declares no driver dependency.
- R14. A lint rule refuses an exported `*Live` or `Default` layer binding in library source.

### Acceptance Examples

- AE1. Pure service with a platform tag. **Covers R2, R3.**
  - **Given:** `git.service.ts` declares `Git`, and its `make` yields `ChildProcessSpawner`.
  - **When:** the class carries `static readonly layer = Layer.effect(this, this.make)`.
  - **Then:** R12 reports nothing (`@noble/hashes` is pure computation, not a driver); the root provides `NodeServices.layer`; today's `GitLive` becomes `Git.layer`.
- AE2. Parser SDK. **Covers R2, R5, R6, R12.**
  - **Given:** `import-closure.service.ts` declares the tag.
  - **When:** `import-closure-oxc.ts` imports `oxc-parser` and exports `layer`.
  - **Then:** no finding. If `import-closure.service.ts` imports `oxc-parser`, R12 reports that import's line.
- AE3. Database store. **Covers R5, R6, R10.**
  - **Given:** `ledger.service.ts` declares a store.
  - **When:** `ledger-drizzle.ts` holds the Drizzle adapter and `ledger-memory.ts` the fake.
  - **Then:** one contract suite runs against both and both pass.
- AE4. Promise-based SDK. **Covers R1, R5.**
  - **Given:** a client library whose calls return promises.
  - **When:** its adapter module wraps each call in `Effect.tryPromise` with the fiber's `AbortSignal`.
  - **Then:** the service shape exposes Effect operations, and the service module never imports the SDK.
- AE5. Published library. **Covers R7, R13.**
  - **Given:** external consumers import the contract package.
  - **When:** the Postgres implementation is needed.
  - **Then:** it ships as `<package>-pg`, and the contract package's manifest lists no Postgres client.

### Rejected Options

- **Port and Layer always in separate modules** (`ports-separate-from-layers.md`; the gritlint rule on `origin/main`). It costs a second module per service for layers that carry no driver, contradicts Effect 4's own definition form, and its example puts ports and adapters in `ports/` and `store/` folders.
- **Driver modules under `src/drivers/<technology>.ts`** (`service-and-layer-boundaries.md:27`, `:37`; the gritlint finding text). A folder that gathers several capabilities' drivers is a technical-kind segment above the capabilities. Inside a one-capability package the wiki's position predicate does not forbid it, so moving the two existing `drivers/` folders is cleanup, not a fix.
- **New role suffixes `*.adapter.ts` / `*.store.ts`.** The import list already says a module binds a vendor; a suffix restating it lets a rename drop the check (CONST-T12), and it cannot bind a consumer of the published package.
- **Effect's application example: bind the driver on the class** (`static readonly layer = this.layerNoDeps.pipe(Layer.provide(PgClient.layerConfig(...)))`, Effect 4.0.1 `ai-docs/src/01_effect/03_services/20_layer-composition.ts:8`, `:55-60`). The service module then imports `@effect/sql-pg`, and every cell importing the tag depends on Postgres (CONST-B4). The `layerNoDeps` half of that example is R3.
- **`testLayer` on every service class in `src/`** (the rat-stack convention, `packages/core/src/abuse-score.ts:41`). It ships doubles in production code and on the published surface; Effect names the variant `layerTest`.
- **Published `*Live` singletons.** The wiki allows a lazy published binding, and that is kept as R8; the name is dropped because Effect 4 replaced `Live` and `Default` with `layer`.
- **A filename-keyed multifile gritlint rule as the gate.** It keys on the suffix, reports once per directory at line 1 of the alphabetically first service module instead of the violating import, and cannot see reach through another module.

### Evidence

Dates are the last commit touching the file (systemfsoftware `origin/main` at `732f66a0`, 2026-10-10), the tree date for external repositories, or the wiki page's `updated` field. None of the cited wiki pages carries a "Last verified" or "Superseded" section.

| #  | Claim                                                                                                                                                                                                       | Source                                                                                                                        | Date                                | Status                                                                |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| 1  | A port and its Layer must live in separate modules; ports in `ports/`, adapters in `store/`                                                                                                                 | `compound-packs/cell-architecture/ports-separate-from-layers.md`                                                              | 2026-09-22                          | current on main; contradicted by #2, superseded by this plan if ruled |
| 2  | Tier 2: `static readonly layer = (opts) => ...` on the service class is allowed                                                                                                                             | `compound-packs/cell-architecture/service-and-layer-boundaries.md:36`                                                         | 2026-09-26                          | current; adopted as R3                                                |
| 3  | Driver implementations live in `src/drivers/<tech>.ts` or `src/store/<tech>.ts`                                                                                                                             | `service-and-layer-boundaries.md:27`, `:37`                                                                                   | 2026-09-26                          | current on main; rejected (placement decision)                        |
| 4  | Zero-config pure layer is `static readonly Default`                                                                                                                                                         | `service-and-layer-boundaries.md:48`                                                                                          | 2026-09-26                          | superseded by #11                                                     |
| 5  | `*Live` banned in reusable libraries                                                                                                                                                                        | `service-and-layer-boundaries.md:35`, `:82`                                                                                   | 2026-09-26                          | current; kept as R14                                                  |
| 6  | Separate driver package when external consumers must not inherit the driver                                                                                                                                 | `service-and-layer-boundaries.md:67`                                                                                          | 2026-09-26                          | current; adopted as R7                                                |
| 7  | `service-exports-no-layer` refuses every Layer in `*.service.ts` and directs drivers to `src/drivers/`                                                                                                      | `packs/cell-architecture/rules/service-exports-no-layer.md`                                                                   | 2026-10-09                          | current on main; contradicts #2; PR #708 open                         |
| 8  | The cell-architecture gritlint pack is not enabled                                                                                                                                                          | `gritlint.json` (`packs`: `npm-provenance`, `source-resolution`, `typecheck-build-mode`)                                      | 2026-09-25                          | current                                                               |
| 9  | "An implementation is a `Layer` and belongs where only a composition root reaches it"                                                                                                                       | `docs/solutions/architecture-patterns/one-cell-cannot-hold-a-port-and-its-implementation.md:67-70`                            | 2026-09-25                          | current; holds for driver-backed layers (R5), narrowed by R3          |
| 10 | A suffix rule may decide only edge and depth-0 properties, and cannot bind a consumer                                                                                                                       | `docs/solutions/architecture-patterns/what-a-filename-suffix-can-enforce.md:28-45`                                            | 2026-08-13                          | current; grounds the gate decision                                    |
| 11 | "v4 adopts the convention of naming layers with `layer` ... instead of v3's `Default` or `Live`. Use `layer` for the primary layer and descriptive suffixes for variants (e.g. `layerTest`, `layerConfig`)" | Effect 4.0.1 `migration/services.md:186-199` (vendored `repos/effect`), byte-identical to `Effect-TS/effect@84f48df5` main    | 2026-10-06; main checked 2026-10-10 | current; grounds R3, R4                                               |
| 12 | The canonical service carries `static readonly layer` on the class                                                                                                                                          | Effect 4.0.1 `LLMS.md:148`; `ai-docs/src/01_effect/03_services/01_service.ts:22`                                              | 2026-10-06                          | current                                                               |
| 13 | Platform, provider and technology implementations ship as separate packages                                                                                                                                 | Effect 4.0.1 `MIGRATION.md:28-31`                                                                                             | 2026-10-06                          | current; grounds R7                                                   |
| 14 | A runtime implementation exports module-level `make` / `layer` / `layerConfig`                                                                                                                              | Effect 4.0.1 `packages/platform/node-shared/src/NodeFileSystem.ts:710`; `packages/sql/pg/src/PgClient.ts:169`, `:377`, `:391` | 2026-10-06                          | current; grounds R5                                                   |
| 15 | Published doubles: `Stdio.layerTest`, `FileSystem.layerNoop`; ad hoc doubles via `Layer.mock`                                                                                                               | Effect 4.0.1 `Stdio.ts:152`, `FileSystem.ts:765`, `Layer.ts:2306`                                                             | 2026-10-06                          | current; grounds R9, R11                                              |
| 16 | `static readonly layerTest` on the class in a test example                                                                                                                                                  | Effect 4.0.1 `ai-docs/src/09_testing/20_layer-tests.ts:24`, `:84`                                                             | 2026-10-06                          | current                                                               |
| 17 | `Effect.tryPromise` passes an `AbortSignal` to the promise                                                                                                                                                  | Effect 4.0.1 `packages/effect/src/Effect.ts:966-969`                                                                          | 2026-10-06                          | current; AE4                                                          |
| 18 | The Effect V4 development repository is archived; same migration text                                                                                                                                       | `Effect-TS/effect-smol@3a1128c` `README.md`, `migration/services.md:196-199`                                                  | 2026-07-14                          | history                                                               |
| 19 | No upstream lint rule checks service or layer placement                                                                                                                                                     | Effect 4.0.1 / effect-smol `packages/tools/oxc/src/oxlint/rules/` (scout census)                                              | 2026-07-14 / 2026-10-06             | current; scout-reported                                               |
| 20 | Reference service: `static readonly layer = Layer.effect(this, this.make)` beside the tag                                                                                                                   | `joelhooks/rat-stack@c893d6c` `packages/core/src/file-inspector.ts:34`, `AGENTS.md:177`                                       | 2026-10-10                          | current in rat-stack                                                  |
| 21 | Core cannot import HTTP clients or adapters (lint)                                                                                                                                                          | rat-stack `scripts/oxlint-plugin-boundaries.ts:945`                                                                           | 2026-10-10                          | current in rat-stack; the shape R12 takes                             |
| 22 | Doubles as `static readonly testLayer` in `src/`                                                                                                                                                            | rat-stack `packages/core/src/abuse-score.ts:41`                                                                               | 2026-10-10                          | current in rat-stack; rejected                                        |
| 23 | 11 `*.service.ts` under `packages/*/src`; 0 with a static layer                                                                                                                                             | `git ls-files`, `git grep` on `732f66a0`                                                                                      | 2026-10-10                          | observed                                                              |
| 24 | `src/drivers/` exists in 2 packages, 5 files                                                                                                                                                                | `packages/effect-readiness/src/drivers/`, `packages/trace/trace-spec/src/drivers/`                                            | 2026-10-01                          | observed                                                              |
| 25 | One exported `*Live`: `GitLive`, which needs only `ChildProcessSpawner`                                                                                                                                     | `packages/upstream-manifest/src/git.ts:58`                                                                                    | 2026-10-06                          | observed; AE1                                                         |
| 26 | In-memory double plus a test running fake and real side by side                                                                                                                                             | `packages/upstream-manifest/src/git.memory.ts`; `packages/upstream-manifest/tests/git-contract.integration.test.ts:22-36`     | 2026-10-06                          | observed; grounds R10                                                 |
| 27 | A store ships a law suite its fake and its real adapter both pass                                                                                                                                           | `CONCEPTS.md:74`; `compound-packs/boundary-testing/fake-and-real-store-laws.md`                                               | 2026-10-09 / 2026-09-24             | current                                                               |
| 28 | `node:` imports are banned in `src/` by lint                                                                                                                                                                | `packages/oxlint-plugin/oxlint-plugin-effect-platform/src/index.ts:44`                                                        | 2026-09-24                          | current; partial R12 coverage                                         |
| 29 | CONST-B4: wire every implementation at one composition root; the core never imports a database or framework                                                                                                 | `repos/constitution/CONSTITUTION.md:37-38`                                                                                    | 2026-07-15                          | current                                                               |
| 30 | CONST-T12: decide what applies from what code is and does, never from its name or location                                                                                                                  | `repos/constitution/CONSTITUTION.md:96-97`                                                                                    | 2026-07-15                          | current; grounds the gate decision                                    |
| 31 | Package by feature, not layer; a kind-named segment above a capability is the loser                                                                                                                         | `kb://software/package-by-feature-not-layer`; `kb://software/naming-segment-gate`                                             | 2026-09-16                          | current; grounds the placement decision                               |
| 32 | Flat suffixed files colocated by capability; the job-suffix clause is the wiki's own posit (A10)                                                                                                            | `kb://software/flat-suffixed-colocated`                                                                                       | 2026-09-16                          | current; suffix clause yields to #30                                  |
| 33 | One composition root per process; a published lazy Layer is not a root                                                                                                                                      | `kb://software/one-composition-root`; `kb://software/inert-composition-value`                                                 | 2026-09-16                          | current; grounds R8                                                   |
| 34 | Service operations keep `R = never`; layers manage dependencies at construction                                                                                                                             | `kb://software/dependency-approach-placement` (A4)                                                                            | 2026-09-16                          | current; grounds R1                                                   |
| 35 | Middle cells get no colocated unit tests; technology cells get fake-vs-real contracts                                                                                                                       | `kb://software/test-placement`                                                                                                | 2026-09-16                          | current; grounds R9, R10                                              |
| 36 | Importing a published entry performs none of the package's effects                                                                                                                                          | `compound-packs/package-topology/import-time-inertness.md`                                                                    | 2026-10-01                          | current; R8                                                           |

### Scope Boundaries

- No code, pack, or gritlint change happens under this plan; it records a recommendation for the root's ruling.
- Renaming existing modules (`git.memory.ts`, `GitLive`, the two `drivers/` folders) is migration work for the plan that implements a ruling.
- The shape a promise-SDK service exposes beyond Effect operations (for example whether a raw client may appear on the shape) is not decided here; Effect's own `OpenAiClient` exposes an Effect `HttpClient` on its shape (`packages/ai/openai/src/OpenAiClient.ts:56-60`).

### Outstanding Questions

**Resolve Before Planning**

- Does the root adopt the four Key Decisions, and does PR #708 carry the gritlint half or close?

**Deferred to Planning**

- Which tool checks R13 for the in-package form (a module reaching a driver through a sibling); no in-repo tool does it today.
- Whether R12 lands in gritlint or in `oxlint-plugin-cell-architecture`. A gritlint single-file rule reports file and line but parses every `.ts` file, and on `732f66a0` one file (`packages/discern/src/decision.blueprint.ts`) fails to parse and stops the scan.
- The reviewed driver preset R12 matches (`node:*`, `@effect/platform-*`, `@effect/sql-*`, `@effect/ai-*`, named SDKs).
