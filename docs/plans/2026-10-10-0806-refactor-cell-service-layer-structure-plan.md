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
- **Product authority:** the root reviewed this recommendation on 2026-10-10 and returned it with five corrections, now applied; R1-R5 were independently verified and hold.
- **Open blockers:** none for planning. The gate is the rule systemfsoftware#708 amends (root ruling 2026-10-10); no second rule change.

---

## Product Contract

### Summary

A service is a `Context.Service` class in `<capability>.service.ts`. An implementation that needs only Effect and abstract platform tags is a `static readonly layer` on that class. An implementation that imports a driver is a separate module that sits flat beside the service, imported only by composition roots and tests; its filename is not prescribed. Test-only doubles are built by the test; a double consumers need is published on the class as `layerTest` or `layerNoop`. Layers are named `layer`, `layerConfig`, `layerTest`, `layerNoop`, never `Live` or `Default`. The gate is the content-keyed rule in systemfsoftware#708; the package graph is the control for reach through another module.

### Problem Frame

The answer on `origin/main` contradicts itself in four places, so an author or reviewer gets a different verdict depending on which file they read.

- `compound-packs/cell-architecture/ports-separate-from-layers.md` forbids a Layer in the port's module and puts ports in `ports/` and adapters in `store/`. `compound-packs/cell-architecture/service-and-layer-boundaries.md:36` allows a `static readonly layer` on the service class (tier 2), and `:27`, `:37` put driver-backed implementations in `src/drivers/` or `src/store/`.
- The gritlint rule `cell-architecture/service-exports-no-layer` (in this repository until `8d532795`, now in `systemfsoftware/gritlint`) refuses every Layer in a `*.service.ts`, including the tier 2 form the doc allows. `gritlint.json` does not enable the pack, so nothing runs it here.
- `service-and-layer-boundaries.md:48` prescribes `static readonly Default`, Effect v3 vocabulary that Effect 4 replaced with `layer`.
- The code follows none of these consistently: 0 of 11 `*.service.ts` files under `packages/*/src` carry a static layer, `src/drivers/` exists in 2 packages, the one published `*Live` (`packages/upstream-manifest/src/git.ts:58`) needs only an abstract platform tag, and its double is `git.memory.ts`.

### Key Decisions

- **A pure static layer stays on the service class.** Effect 4 defines the service and its primary layer together; the harm the separate-module rule guards against (importing the contract pulls in a driver) exists only when the layer's module imports a driver. Governs R2, R3.
- **A driver-backed implementation is a flat sibling module beside the service, with no folder named for a technical kind; its filename is not prescribed.** A folder named for a technical kind is the layer bucket the wiki rules against. No current primary source names the file: the packs on `origin/main` say `src/drivers/<tech>.ts`, the two real driver modules are named for the technology alone, and Effect names its own for the technology (`NodeFileSystem.ts`, `PgClient.ts`). The gate keys on imports, so a name would add nothing it checks. Governs R5, R6.
- **Test doubles live with the test unless they are a product.** A store's in-memory fake and a double published for consumers' own tests are products; every other double is test code. Governs R9, R10, R11.
- **The gate decides on what a service module imports and exports.** It reads the modules the `*.service.ts` suffix selects and decides from their import specifiers and Layer shapes, never from a filename beyond that selection (CONST-T12). Governs R12, R13, R14.

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
- R6. That module sits flat beside the service module, in the same directory, with no `drivers/`, `adapters/`, or `store/` folder. Its filename is not prescribed (Evidence #3, #24, #37); a module that is already a cell kind (`*.handle.ts`, `*.blueprint.ts`) keeps its kind suffix.
- R7. The implementation moves to its own package, named `<package>-<technology>`, when the package has consumers outside the repository and the driver is heavy or platform-restricted for them.
- R8. Only a composition root supplies concrete runtime layers; a library publishes lazy `layer` values and performs no effect at import.

**Test doubles**

- R9. A test-only double is built by the test with `Layer.succeed(Tag, Tag.of(...))` or `Layer.mock(Tag)(...)`. It is test code, never in `src/`, unless R10 or R11 applies; its location inside the test tree is not prescribed.
- R10. A store ships its in-memory fake beside the service as `<capability>.memory.ts`, as `packages/upstream-manifest/src/git.memory.ts` does, and one contract suite that the fake and the real adapter both pass.
- R11. A double that consumers need for their own tests is published as `layerTest` or `layerNoop` on the service class.

**Gates**

- R12. The gate is `cell-architecture/service-exports-no-layer` as systemfsoftware#708 amends it: it refuses a `*.service.ts` module that imports a specifier from the rule's reviewed driver preset (statically, as a re-export, or through `import()`), or that hands out a Layer outside a pure member of its Service class. It is a multifile rule, so it reports once per directory, at line 1 of the alphabetically first `*.service.ts` in that directory, not at the import's file and line; the finding tells the reader to search every service module in the directory.
- R13. Reach through another module is checked by the package graph, not by R12: in the separate-package form the contract package's manifest declares no driver dependency.
- R14. The same rule refuses, in a `*.service.ts`, an exported `*Live` binding and a class field named `*Layer` or `*Live`. `Default` and a `*Live` elsewhere in library source are review-gated (`service-and-layer-boundaries.md`, gate item 3).

### Acceptance Examples

- AE1. Pure service with a platform tag. **Covers R2, R3.**
  - **Given:** `git.service.ts` declares `Git`, and its `make` yields `ChildProcessSpawner`.
  - **When:** the class carries `static readonly layer = Layer.effect(this, this.make)`.
  - **Then:** R12 reports nothing (`@noble/hashes` is pure computation, not a driver); the root provides `NodeServices.layer`; today's `GitLive` becomes `Git.layer`.
- AE2. Node runtime driver. **Covers R2, R5, R6, R12.**
  - **Given:** `workspace.service.ts` declares the tag.
  - **When:** a sibling module in the same directory imports `@effect/platform-node/NodeFileSystem` and exports `layer`.
  - **Then:** no finding. If `workspace.service.ts` imports `@effect/platform-node/NodeFileSystem`, R12 reports the directory, at line 1 of its first `*.service.ts`.
- AE3. Database store. **Covers R5, R6, R10.**
  - **Given:** `ledger.service.ts` declares a store.
  - **When:** a sibling module holds the Drizzle adapter and `ledger.memory.ts` the fake.
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
- **A single-file rule that reports the import's own file and line.** A single-file gritlint rule parses every module of the language, and one unparseable module stops the scan: on `732f66a0`, `packages/discern/src/decision.blueprint.ts` fails at 1000:35. The multifile rule parses only `*.service.ts` modules.
- **A prescribed `<capability>-<technology>.ts` filename.** No current primary source names it (Evidence #3, #37), and the gate does not read it.

### Evidence

Dates are the last commit touching the file (systemfsoftware `origin/main` at `732f66a0`, 2026-10-10), the tree date for external repositories, or the wiki page's `updated` field. None of the cited wiki pages carries a "Last verified" or "Superseded" section.

| #  | Claim                                                                                                                                                                                                       | Source                                                                                                                                                     | Date                                | Status                                                                |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| 1  | A port and its Layer must live in separate modules; ports in `ports/`, adapters in `store/`                                                                                                                 | `compound-packs/cell-architecture/ports-separate-from-layers.md`                                                                                           | 2026-09-22                          | current on main; contradicted by #2, superseded by this plan if ruled |
| 2  | Tier 2: `static readonly layer = (opts) => ...` on the service class is allowed                                                                                                                             | `compound-packs/cell-architecture/service-and-layer-boundaries.md:36`                                                                                      | 2026-09-26                          | current; adopted as R3                                                |
| 3  | Driver implementations live in `src/drivers/<tech>.ts` or `src/store/<tech>.ts`                                                                                                                             | `service-and-layer-boundaries.md:27`, `:37`                                                                                                                | 2026-09-26                          | current on main; rejected (placement decision)                        |
| 4  | Zero-config pure layer is `static readonly Default`                                                                                                                                                         | `service-and-layer-boundaries.md:48`                                                                                                                       | 2026-09-26                          | superseded by #11                                                     |
| 5  | `*Live` banned in reusable libraries                                                                                                                                                                        | `service-and-layer-boundaries.md:35`, `:82`                                                                                                                | 2026-09-26                          | current; kept as R14                                                  |
| 6  | Separate driver package when external consumers must not inherit the driver                                                                                                                                 | `service-and-layer-boundaries.md:67`                                                                                                                       | 2026-09-26                          | current; adopted as R7                                                |
| 7  | `service-exports-no-layer` refuses every Layer in `*.service.ts`; its next action names `src/drivers/<what-it-binds>.ts`                                                                                    | `packs/cell-architecture/rules/service-exports-no-layer.md` (now `systemfsoftware/gritlint@1d60be38`, ported in `686665e`)                                 | 2026-10-09                          | current on main; contradicts #2; replaced by #38                      |
| 8  | The cell-architecture gritlint pack is not enabled                                                                                                                                                          | `gritlint.json` (`packs`: `npm-provenance`, `source-resolution`, `typecheck-build-mode`)                                                                   | 2026-09-25                          | current                                                               |
| 9  | "An implementation is a `Layer` and belongs where only a composition root reaches it"                                                                                                                       | `docs/solutions/architecture-patterns/one-cell-cannot-hold-a-port-and-its-implementation.md:67-70`                                                         | 2026-09-25                          | current; holds for driver-backed layers (R5), narrowed by R3          |
| 10 | A suffix rule may decide only edge and depth-0 properties, and cannot bind a consumer                                                                                                                       | `docs/solutions/architecture-patterns/what-a-filename-suffix-can-enforce.md:28-45`                                                                         | 2026-08-13                          | current; grounds the gate decision                                    |
| 11 | "v4 adopts the convention of naming layers with `layer` ... instead of v3's `Default` or `Live`. Use `layer` for the primary layer and descriptive suffixes for variants (e.g. `layerTest`, `layerConfig`)" | Effect 4.0.1 `migration/services.md:186-199` (vendored `repos/effect`), byte-identical to `Effect-TS/effect@84f48df5` main                                 | 2026-10-06; main checked 2026-10-10 | current; grounds R3, R4                                               |
| 12 | The canonical service carries `static readonly layer` on the class                                                                                                                                          | Effect 4.0.1 `LLMS.md:148`; `ai-docs/src/01_effect/03_services/01_service.ts:22`                                                                           | 2026-10-06                          | current                                                               |
| 13 | Platform, provider and technology implementations ship as separate packages                                                                                                                                 | Effect 4.0.1 `MIGRATION.md:28-31`                                                                                                                          | 2026-10-06                          | current; grounds R7                                                   |
| 14 | A runtime implementation exports module-level `make` / `layer` / `layerConfig`                                                                                                                              | Effect 4.0.1 `packages/platform/node-shared/src/NodeFileSystem.ts:710`; `packages/sql/pg/src/PgClient.ts:169`, `:377`, `:391`                              | 2026-10-06                          | current; grounds R5                                                   |
| 15 | Published doubles: `Stdio.layerTest`, `FileSystem.layerNoop`; ad hoc doubles via `Layer.mock`                                                                                                               | Effect 4.0.1 `Stdio.ts:152`, `FileSystem.ts:765`, `Layer.ts:2306`                                                                                          | 2026-10-06                          | current; grounds R9 (constructors), R11                               |
| 16 | `static readonly layerTest` on the class in a test example                                                                                                                                                  | Effect 4.0.1 `ai-docs/src/09_testing/20_layer-tests.ts:24`, `:84`                                                                                          | 2026-10-06                          | current                                                               |
| 17 | `Effect.tryPromise` passes an `AbortSignal` to the promise                                                                                                                                                  | Effect 4.0.1 `packages/effect/src/Effect.ts:966-969`                                                                                                       | 2026-10-06                          | current; AE4                                                          |
| 18 | The Effect V4 development repository is archived; same migration text                                                                                                                                       | `Effect-TS/effect-smol@3a1128c` `README.md`, `migration/services.md:196-199`                                                                               | 2026-07-14                          | history                                                               |
| 19 | No upstream lint rule checks service or layer placement                                                                                                                                                     | Effect 4.0.1 / effect-smol `packages/tools/oxc/src/oxlint/rules/` (scout census)                                                                           | 2026-07-14 / 2026-10-06             | current; scout-reported                                               |
| 20 | Reference service: `static readonly layer = Layer.effect(this, this.make)` beside the tag                                                                                                                   | `joelhooks/rat-stack@c893d6c` `packages/core/src/file-inspector.ts:34`, `AGENTS.md:177`                                                                    | 2026-10-10                          | current in rat-stack                                                  |
| 21 | Core cannot import HTTP clients or adapters (lint)                                                                                                                                                          | rat-stack `scripts/oxlint-plugin-boundaries.ts:945`                                                                                                        | 2026-10-10                          | current in rat-stack; the shape R12 takes                             |
| 22 | Doubles as `static readonly testLayer` in `src/`                                                                                                                                                            | rat-stack `packages/core/src/abuse-score.ts:41`                                                                                                            | 2026-10-10                          | current in rat-stack; rejected                                        |
| 23 | 11 `*.service.ts` under `packages/*/src`; 0 with a static layer                                                                                                                                             | `git ls-files`, `git grep` on `732f66a0`                                                                                                                   | 2026-10-10                          | observed                                                              |
| 24 | `src/drivers/` exists in 2 packages, 5 files                                                                                                                                                                | `packages/effect-readiness/src/drivers/`, `packages/trace/trace-spec/src/drivers/`                                                                         | 2026-10-01                          | observed                                                              |
| 25 | One exported `*Live`: `GitLive`, which needs only `ChildProcessSpawner`                                                                                                                                     | `packages/upstream-manifest/src/git.ts:58`                                                                                                                 | 2026-10-06                          | observed; AE1                                                         |
| 26 | In-memory double plus a test running fake and real side by side                                                                                                                                             | `packages/upstream-manifest/src/git.memory.ts`; `packages/upstream-manifest/tests/git-contract.integration.test.ts:22-36`                                  | 2026-10-06                          | observed; grounds R10's filename                                      |
| 27 | A store ships a law suite its fake and its real adapter both pass                                                                                                                                           | `CONCEPTS.md:74`; `compound-packs/boundary-testing/fake-and-real-store-laws.md`                                                                            | 2026-10-09 / 2026-09-24             | current                                                               |
| 28 | `node:` imports are banned in `src/` by lint                                                                                                                                                                | `packages/oxlint-plugin/oxlint-plugin-effect-platform/src/index.ts:44`                                                                                     | 2026-09-24                          | current; partial R12 coverage                                         |
| 29 | CONST-B4: wire every implementation at one composition root; the core never imports a database or framework                                                                                                 | `repos/constitution/CONSTITUTION.md:37-38`                                                                                                                 | 2026-07-15                          | current                                                               |
| 30 | CONST-T12: decide what applies from what code is and does, never from its name or location                                                                                                                  | `repos/constitution/CONSTITUTION.md:96-97`                                                                                                                 | 2026-07-15                          | current; grounds the gate decision                                    |
| 31 | Package by feature, not layer; a kind-named segment above a capability is the loser                                                                                                                         | `kb://software/package-by-feature-not-layer`; `kb://software/naming-segment-gate`                                                                          | 2026-09-16                          | current; grounds the placement decision                               |
| 32 | Flat suffixed files colocated by capability; the job-suffix clause is the wiki's own posit (A10)                                                                                                            | `kb://software/flat-suffixed-colocated`                                                                                                                    | 2026-09-16                          | current; suffix clause yields to #30                                  |
| 33 | One composition root per process; a published lazy Layer is not a root                                                                                                                                      | `kb://software/one-composition-root`; `kb://software/inert-composition-value`                                                                              | 2026-09-16                          | current; grounds R8                                                   |
| 34 | Service operations keep `R = never`; layers manage dependencies at construction                                                                                                                             | `kb://software/dependency-approach-placement` (A4)                                                                                                         | 2026-09-16                          | current; grounds R1                                                   |
| 35 | Middle cells get no colocated unit tests; technology cells get fake-vs-real contracts                                                                                                                       | `kb://software/test-placement`                                                                                                                             | 2026-09-16                          | current; grounds R10                                                  |
| 36 | Importing a published entry performs none of the package's effects                                                                                                                                          | `compound-packs/package-topology/import-time-inertness.md`                                                                                                 | 2026-10-01                          | current; R8                                                           |
| 37 | The two driver modules are named for the technology alone                                                                                                                                                   | `packages/effect-readiness/src/drivers/NodeHostProber.ts`; `packages/trace/trace-spec/src/drivers/tempo-trace-store.ts`                                    | 2026-10-01                          | observed; no filename convention to adopt                             |
| 38 | The amended rule refuses driver imports (static, re-export, `import()`) and non-member Layers, allows a pure static `layer`/`layerTest`/`layerConfig`, and reports once per directory at line 1             | systemfsoftware#708 head `795c1179`, `packs/cell-architecture/rules/service-exports-no-layer.md:3-13`, `:18-49`; `packs/cell-architecture/README.md:50-57` | 2026-10-10                          | root-verified (0 mismatches over 11 fixtures); the gate               |
| 39 | `tests/__fixtures__` appears once as a wrong example (a `*.schema.ts` there) and once as a working one (a `*.model.ts` harness); neither places test doubles                                                | `compound-packs/schema-laws/tests-own-no-schemas.md:21`, `:28`                                                                                             | 2026-09-24                          | current; R9 prescribes no location                                    |
| 40 | gritlint, its engine and its packs moved to `systemfsoftware/gritlint`; this repository takes it from that flake                                                                                            | systemfsoftware `8d532795` (#711)                                                                                                                          | 2026-10-10                          | current; the gate's rule now lands there                              |
| 41 | A multifile finding moves to the range a rule's `locate` pattern reports; rule frontmatter gains `reasonCode`, `nextAction`                                                                                 | `systemfsoftware/gritlint` PR #6 (open, head `69f7b67a`)                                                                                                   | 2026-10-10                          | open; would sharpen R12's location                                    |

### Scope Boundaries

- No code, pack, or gritlint change happens in this Product Contract; implementation units carry them.
- Renaming existing modules beyond moving them out of the two `drivers/` folders (`NodeHostProber.ts`, `tempo-trace-store.ts` keep their names) is out of scope.
- The shape a promise-SDK service exposes beyond Effect operations (for example whether a raw client may appear on the shape) is not decided here; Effect's own `OpenAiClient` exposes an Effect `HttpClient` on its shape (`packages/ai/openai/src/OpenAiClient.ts:56-60`).

### Outstanding Questions

**Resolve Before Planning**

- None. The root ruled on 2026-10-10: R1-R5 hold, the five corrections are applied, and systemfsoftware#708 is the gate.

**Deferred to Planning**

- Where #708's rule change lands now that `packs/` left this repository (Evidence #40).
- Which tool checks R13 for the in-package form (a module reaching a driver through a sibling); no in-repo tool does it today.
- Whether the driver preset grows to cover `oxc-parser` and other native-binary packages the driver definition names; today they pass R12 until the preset names them.
