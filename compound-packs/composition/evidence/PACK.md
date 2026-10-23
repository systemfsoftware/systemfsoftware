# Pack: package-and-application-composition

**Status:** draft part 1 of 3 (rules 1–12 of 25). Sources: TanStack router/query, Vitest, Deno std, Effect smol, Rat Stack, Stead, our own `package-topology`/`cell-architecture`, and a measured audit of `younna-ai` (cycles 000–007 of campaign b3d082e3).

**Format:** one rule per file in the final pack. Each rule below has the same four parts: _Rule_ (the law, one sentence), _Why_ (the failure it prevents), _Evidence_ (source paths; every claim was read this campaign), _Check_ (the mechanical gate, or `review` when none can exist).

**Scope:** TypeScript monorepos that ship Effect services to Cloudflare Workers through Alchemy, with React/Astro at the edge.

**Ranking:** by how much the rule prevents the failure the brief names — packages and applications collapsing into each other. Rank 1–12 is the package/surface half; 13–25 (next part) is applications, infrastructure, tests and enforcement.

---

## 1. removal-test

**Rule.** A unit is composable only if deleting its package directory and its single provision line (`Layer.provide`/Stack entry) leaves every other import path unchanged and `check test build` green.

**Why.** Every other rule describes a boundary; this one tests it. Coupling that survives review shows up here as a broken import, a duplicated type, or a resource that outlives its owner.

**Evidence.**

- Rat Stack cartridge test: labeled / push in / pull out / self-contained / EZ to trash — "Removing it takes deleting that package and that line, and `pnpm turbo run check test build` still passes" (`ratstack.sh/lore/cartridges`, `/lore/a-clean-playground`).
- Rat Stack removal table names files, deps and config entries per feature (`README.md`, verified in the clone).
- Rat Stack admits the limit: one-line infrastructure removal is **unproven** for its `subscriber-delivery` adapter — record the same honesty.
- `younna-ai`: 149 of 378 declared subpaths are already dead (cycle 006); nothing would have noticed.

**Check.** A recorded `removal-check` per unit: on a scratch branch, delete the package and its provision line, run the repo's full gate, paste the output in the PR. Gate `review` plus the evidence line; no script can prove "nothing else refers to it" without running the gate.

---

## 2. packages-never-import-applications

**Rule.** A `packages/*` unit may not import an `apps/*` or `workers/*` unit, by dependency or by path. Types and functions both sides need live in a package.

**Why.** An application carries deployment identity (bindings, environment, routes, runtime). A package that imports one inherits its runtime, cannot run in another host, and cannot be tested without the app.

**Evidence.**

- Rat Stack code rule, message verbatim: "Packages cannot import application code." (`scripts/oxlint-plugin-boundaries.ts`, `noCrossLayerImports`).
- Effect: platform adapters depend inward on `effect`; core never imports them (`packages/platform-node/src/NodeFileSystem.ts`, `type { FileSystem } from "effect/FileSystem"`).
- `younna-ai` violates it today: `packages/agent/src/conversation/agent-db-rows.ts:1` → `@younna/workspace/schema/agent-db`; `packages/app-runtime/src/personal-apps/bundle-commit.ts:9-10` → `@younna/app-builder/{builder.schema,isolates}`.

**Check.** One lint rule with two globs (importer `packages/**`, specifier resolving into `apps/**`/`workers/**`, including `import()`, re-exports, `require`), or a dependency-cruiser rule. Mechanical.

---

## 3. application-is-a-package-with-one-export

**Rule.** An application is a package whose exports map contains exactly one public entry (its UI or entry barrel) plus `./package.json`, and whose services/config live in a data manifest beside the code.

**Why.** A second export is how an app leaks its internals into a sibling; a manifest keeps deployment shape declarative, so the app can be moved, rebuilt or removed without touching other code.

**Evidence.**

- Stead: `examples/apps/atlas/package.json` → `exports: {".": "./stead/ui/index.ts"}`, `private: true`; `stead/stead.yaml` carries `apiVersion`, `kind`, `metadata`, `spec.services`.
- Rat Stack: apps are `apps/{cli,infra,site,web}`, packages may not import them; the Stack lives in `apps/infra/alchemy.run.ts`.
- `younna-ai`: `packages/app-template` already shows the shape — `{'.': './src/app.ts'}` plus `stead.json` (`rule`, `sources`, `knobs`, `decodePaths`, `pageEntry`), own tsconfig/oxlint/vitest.

**Check.** Script over app packages: `Object.keys(exports)` ⊆ `{'.', './package.json'}`; manifest file present and schema-valid. Mechanical.

---

## 4. cross-app-reach-through-the-export

**Rule.** One application may use another only through that app's package specifier (`@apps/<name>`); any relative import that resolves into another app's folder is an error.

**Why.** "An app is built and swapped as one": a relative reach means a broken sibling breaks this file, and an edit to the sibling never reaches this page.

**Evidence.**

- Stead `eslint-plugin-stead` rule `noReachIntoApp`, message verbatim: "This reaches into <app>'s files. Import what it exports instead: `import { … } from \"@apps/<app>\"` … An app is built and swapped as one."
- Same repo allows app→app _dependency_ (`@apps/atlas` depends on `@apps/calendar`, `github`, `slack`, `time`), so the ban is on file reach, not on composition.

**Check.** Lint rule that resolves each relative import target and reports when the target's `apps/<dir>/` differs from the importer's. Mechanical (port of Stead's 30-line rule).

---

## 5. core-holds-no-adapters

**Rule.** The core package imports no HTTP client, vendor SDK, or adapter module. It declares services and pure decisions; adapters import core, never the reverse.

**Why.** A decision chained to infrastructure cannot be tested or replaced. Once core imports one vendor, every consumer inherits that vendor's runtime, bundle and credentials.

**Evidence.**

- Rat Stack `noCoreAdapters` applies inside `packages/core/src`: allowed specifiers are core/capability modules or `effect`/`xstate`; `effect/*http*` and any `adapters?/vendors?` path are errors. Message: "Core cannot import HTTP clients or adapters. Provide a domain port from the composition root instead."
- Our own `cell-architecture/service-and-layer-boundaries`: `*.service.ts` has zero driver imports; the adapter module beside it holds every driver import.
- Effect: `effect` (core) has no `@effect/platform-*` dependency; the dependency arrow points inward (`@effect/platform-node` peers on `effect`).

**Check.** Scoped lint over the core package's `src/**`: an allowlist regex (`^effect(/|$)`, own packages, `^xstate`) and a denylist (`effect/.*http`, any path matching `(adapters?|vendors?)/`). Mechanical.

---

## 6. service-in-core-layer-in-adapter

**Rule.** A service is declared once, in core (`*.service.ts`, `Context.Service` + shape, zero driver imports). Each implementation is an adapter module or package exporting `layer(options)`; only the composition root provides it; libraries never export `*Live`.

**Why.** This is the seam that makes "compose instead of collapse" true in Effect: swapping a vendor is one `Layer.provide` line, and a removed binding is a compile error rather than a runtime surprise.

**Evidence.**

- Effect: `packages/platform-node/src/NodeFileSystem.ts` imports the interface **type-only** and exports only a Layer; its doc: "Effects still call the service from `effect/FileSystem`; this module only chooses the Node implementation." 12 `@effect/sql-*` drivers, 0–5 deps, one per backend, all peering `effect`.
- Rat Stack: "A Layer is one vendor's implementation, and it carries its own infrastructure. `Layer.provide` is that vendor's private supply chain. Swapping vendors is a one-line change."
- Our `cell-architecture/service-and-layer-boundaries`: three tiers (application Live singleton, pure static layer, adapter module), no mid-pipeline `Effect.provide`, no `*Live` in libraries, `.memory.ts` fake beside the service with one contract suite.

**Check.** Review for the tier choice; mechanical for purity — a lint that bans driver imports in `*.service.ts` and `*Live` identifiers outside `apps/*/src/main.ts` (Rat Stack's rule is the package-level form).

---

## 7. every-entry-has-a-consumer

**Rule.** Every declared entry is imported by at least one package outside its owner, or it is deleted. An entry is added together with its first consumer.

**Why.** An export map that is emitted rather than demanded stops being an API. Measured in `younna-ai`: 149 of 378 declared subpaths have no consumer (39%); `@younna/platform` 61/135 dead, `@younna/kit` 34/58, `@younna/app-runtime` 28/39. A dead entry is still a contract someone must version, document and keep consistent.

**Evidence.**

- Cycle 006 census over all `packages/` and `workers/` imports (method in `findings/cycle_006.json`).
- TanStack query runs `knip` in CI, twice, the second time `--strict --include unlisted --no-gitignore` (`query/package.json:26`), and publishes every package per PR with `pkg-pr-new` (`.github/workflows/pr.yml:57`).
- Deno std's `check_mod_exports.ts` enforces the dual property (every public file reachable from the barrel) — completeness, not usage; both checks are needed.

**Check.** Script/knip target that maps each exports key to importers outside the owning package and fails on zero. Mechanical.

---

## 8. entries-are-roles-not-modules

**Rule.** A subpath names a role or capability (`., ./node, ./browser, ./schema, ./ui, ./config`) or a host contract. It never mirrors the source folder tree, and a package whose modules are individually imported has no surface — it has a filesystem.

**Why.** Entries exist to give a consumer a _choice it can name_, not to re-export every file. Role entries stay stable while modules move; folder-mirror entries change whenever a file moves and multiply the contract.

**Evidence.**

- Vitest: 14 entries, each a role (`./node`, `./browser`, `./runtime`, `./worker`, `./config`, `./globals`, `./jsdom`) plus an explicit `./internal/*` namespace (`packages/vitest/package.json`).
- Stead: `@stead/sdk` = `'.', './node', './react', './feed', './zero'`; `@stead/shell` adds `./router`, `./vite`, `./workspace`, `./cli`, `./tokens.css`.
- Deno std: 31 capability entries in `@std/assert`, one function each (kebab-case, enforced).
- Counter-example: Effect's `"./*": "./src/*.ts"` (139 entries) is a module mirror that only a 142-module library can justify — and even it null-blocks `./internal/*`. `younna-ai/platform`'s 135 per-module facets are the same shape without the justification.

**Check.** Review for role naming; mechanical for the mirror — fail when an exports key equals its source path (`./<a>/<b>` → `./src/<a>/<b>.ts`) unless the directory is declared as a capability family with more than one consumer of that family. Start as review.

---

## 9. internals-are-unnameable

**Rule.** An internal module has no importable specifier: the exports map `null`s `./internal/*`, or the module is marked (`_` prefix / lowercase) and a lint rejects the specifier. There is no `./internal` escape hatch for tests.

**Why.** If internals are importable, the boundary is advisory; every internal import is a promise the package did not mean to make. Tests that need internals should live beside them in the package, not widen the public map.

**Evidence.**

- Effect: every package carries `"./internal/*": null` and `"./*/index": null`, including nested `./unstable/cli/internal/*` (`packages/*/package.json`); the casing convention (PascalCase public, lowercase internal) is enforced by `effect/no-import-from-barrel-package`.
- Deno std: `_`-prefixed modules are skipped by the barrel checker and imported only by relatives (`path/windows/_util.ts` → `../_common/constants.ts`).
- Neither TanStack nor Vitest exposes a test-only entry; shared fixtures are a real package (`@tanstack/query-test-utils`, `@vitest/internal-testing-helpers`).

**Check.** Script: no exports key resolves to a path containing `internal` (unless `null`); lint: no import specifier matches `*/internal/*`. Mechanical.

---

## 10. repo-code-imports-modules-not-barrels

**Rule.** Inside the repository, code imports the specific module entry, never the umbrella package barrel and never a relative `index`. The barrel is for consumers outside the repo.

**Why.** A barrel import inside the repo couples every file to the whole surface: it slows builds, hides the real dependency, and makes the barrel impossible to slim. Consumers need the convenience; the repo needs the precision.

**Evidence.**

- Effect's `effect/no-import-from-barrel-package`, patterns `^effect$`, `^effect/(.+/)?[a-z][a-z0-9]*$`, `^@effect/[^/]+$`, `^@effect/[^/]+/(.+/)?[a-z][a-z0-9]*$`, plus `checkRelativeIndexImports: true` (`packages/tools/oxc/oxlintrc.json`).
- Vitest's mirror rule: `packages/**` may not import `vitest` or `vitest/node` — "Importing from vitest is restricted… import the source directly" (`.oxlintrc.jsonc`), with peer-declaring adapter packages exempted.

**Check.** One lint rule (barrel specifier + relative index), with an exemption for packages that declare the dependency as a peer (adapters). Mechanical.

---

## 11. runtime-splits-are-export-conditions

**Rule.** When one specifier must resolve to different code per runtime (workerd, browser, node, deno, bun, development), express it as export conditions over per-runtime files with identical names/types — never as a subpath, never as a runtime `if` inside one shared file.

**Why.** Cloudflare Workers are a distinct runtime: a shared file that branches at runtime still bundles the Node branch (and its `node:` imports) into the worker. A condition lets the bundler pick one file and leave the other out.

**Evidence.**

- TanStack router-core `./isServer` conditions `development, workerd, worker, browser, deno, node, bun, import, require`, each to its own file (`src/isServer/{client,server,development}.ts`); `client.ts` is two lines (`export const isServer = false`).
- Effect: one package per runtime (`platform-node`, `-bun`, `-browser`) rather than a condition, because the implementations differ wholesale; conditions for the small divergences, packages for the big ones.
- Vitest: `__vitest_source__` custom condition + `tsconfig` `customConditions` + rollup `exportConditions` — dev-on-source without a build.
- gritlint `source-resolution` already checks the machinery (export-map order, `publishConfig.exports`, `tsdown` `devExports`, `tsconfig` condition, Vitest's two pipelines, api-extractor not following source).

**Check.** `condition-branch-agreement` + gritlint `source-resolution`; a type test that both branches expose the same names. Mechanical.

---

## 12. tests-import-the-published-surface

**Rule.** A test imports its own package through the package's declared entry and other packages through their declared entries. Reaching internals is allowed only inside the owning package's test tree, through a path the build never publishes. Shared helpers are a private package, never a package export.

**Why.** A suite that reaches internals tests code no consumer can reach, and misses the entry the consumer actually imports. The measurement in `younna-ai` shows the second failure mode: 61 dead entries nobody would notice because tests import across the mirror map.

**Evidence.**

- Deno std: `assert/almost_equals_test.ts` beside source; `check_mod_exports` skips `_test.ts`, so tests need no export; cross-package imports use `@std/<pkg>/<entry>`.
- Vitest: zero test files inside packages; `@vitest/test-*` projects import `vitest` (81 sites in the sampled census) and `@vitest/internal-testing-helpers` is `private` with `main: ./index.ts`.
- Effect: `packages/*/test/<Module>.test.ts` imports `effect`, `effect/Function`, `effect/testing`.
- TanStack query: `@tanstack/query-test-utils` is a published package, not an export.
- Our CONST-T8: "Test the published surface with real inputs and outputs… The package ships its build, and the pack check reads what each tarball contains."
- The honest counter-example: every source repo deep-imports internals _somewhere_ in tests (TanStack 5 files; Vitest `test/unit` into `packages/*/src`). A rule without an explicit, narrow exemption will be violated by precedent.

**Check.** Import-lint over test globs: flag relative imports that cross a package boundary; flag imports of a package's `src/`. Allow `test/**` within the owning package. Mechanical as a warning, review for the exception list.

---

---

## 13. app-template-is-deployable-in-isolation

**Rule.** A template (or an app generated from one) builds and runs with only its own files plus the registry: no shared workspace config, no `workspace:` reference, no monorepo-relative path. If it needs a lint/TS preset, it declares the preset as a versioned dependency.

**Why.** The template is the unit a new deployment starts from. One shared `oxlint` preset or `workspace:*` reference makes it un-runnable outside this repository, and the first person to fork it hits a monorepo they do not have.

**Evidence.**

- Stead `ui/template`: a complete `stead-workspace` package (`private`, `stead dev|check|map` scripts, own tsconfig/vite config, `@stead/shell`/`@stead/sdk` as versioned deps) — "what `stead init` writes".
- `younna-ai` `packages/app-template`: own `oxlint.config.ts`, `tsconfig.app.json`, `tsconfig.node.json`, `vitest.config.ts`, dependencies via `catalog:` (published versions when consumed outside).
- Rat Stack's rename procedure is the same test from the other side: rename the scope, change every import, run the formatter and build — if the template depended on workspace paths, this fails.
- Effect packages install standalone: `peerDependencies` on `effect`, no `workspace:` in published manifests.

**Check.** CI job: `pnpm pack` the template (or `cp -r` into a temp dir), `npm install` from the registry only, run its `build` and `check` scripts. Mechanical; fails on any workspace-only reference.

---

## 14. shell-never-reaches-into-an-app

**Rule.** The shell/frame imports nothing from an application. Apps are loaded through generated per-app entries, lazily, each with its own mount, error and loading state, so a broken app cannot break the frame.

**Why.** The frame is the recovery surface: if it imports an app and the app throws, the person is locked out of everything, including the page that would let them fix it.

**Evidence.**

- Stead `CLAUDE.md`: the shell "imports nothing from a workspace: **the workspace can break; the shell cannot**, and the person is never locked out."
- Stead `builder.ts:34-37` includes a built-in app's export only when the shell's own `package.json` declares it; `runtime/entry.tsx:91` imports `@apps/<name>` per app; `slot.tsx:124` documents "loaded on first render (code-split per app)" with its own error and loading state.
- Effect: the runtime platform package is the frame; apps depend on it, never the reverse (`@effect/platform-node` peers on `effect`).

**Check.** Dependency rule: a glob for the shell/frame source may not import `apps/**` or any app package; plus an assertion that the build emits one entry per app. Mechanical.

---

## 15. singleton-libraries-are-built-once

**Rule.** React, the router, the data client and the SDK are a single copy for the whole page: built once (import map, vendor chunk) or declared as peers so no app bundles a second copy.

**Why.** Two copies of React break hooks; two copies of a router or a data client split context and subscriptions. The failure is silent until a component refuses to render inside its provider.

**Evidence.**

- Stead `builder.ts:1-14,183`: "The shared libraries' build: the import map in index.html is theirs, and only a reload changes it"; each app entry is code-split against it.
- Effect and Vitest express the same law as `peerDependencies` (`effect`, `vitest`); TanStack keeps `react`/`react-dom` as peers on every framework adapter.
- `younna-ai` `workers/workspace` (the page host) has the same vendor/import-map shape.

**Check.** Build-output assertion: the vendor chunk contains exactly one copy of each singleton; a bundler `dedupe`/peer config fails the build on duplication. Mechanical.

---

## 16. layer-carries-its-infrastructure

**Rule.** The Layer for a service declares the cloud resources that service needs (the Alchemy `Stack`/binding), and no other module declares them. Provide the Layer, provision the resource; remove it, destroy them.

**Why.** It is what makes "one package per vendor" safe: the unit that knows how to talk to D1 also owns the D1 database, so swapping to Postgres is one `Layer.provide` line and deleting the unit deletes its resources.

**Evidence.**

- Rat Stack: "With Alchemy, an Effect Layer can declare the cloud resources it needs. Providing the Layer provisions them on the next deploy." / "A Layer is one vendor's implementation, and it carries its own infrastructure. `Layer.provide` is that vendor's private supply chain. Swapping vendors is a one-line change."
- Rat Stack `packages/database/src/d1.ts` declares and provides the D1 binding; `packages/flags`' KV adapter "owns its namespace through Alchemy".
- Effect: `@effect/sql-d1` and `@effect/sql-sqlite-do` are zero-dependency packages peering on `effect` — the vendor lives at the edge, next to its binding.
- Limit recorded by Rat Stack itself: "No fence yet proving safe removal; candidate: a cartridge-removal compile check."

**Check.** Review for the placement; a lint that permits resource declarations only under the adapter package or the infra app, and denies them in runtime code. Mechanical part: deny `alchemy` imports outside the named paths.

---

## 17. stack-owned-by-one-app

**Rule.** All Alchemy `Stack` wiring lives in one application (e.g. `apps/infra/alchemy.run.ts`). Runtime code imports neither that file nor that app; it receives bindings through its environment.

**Why.** Stack code provisions on import. Two owners mean two deploy plans and a resource created twice; a runtime import of the Stack means a request can deploy infrastructure.

**Evidence.**

- Rat Stack: "Keep Alchemy Stack setup in `apps/infra/alchemy.run.ts`. Keep runtime behavior in capabilities and cartridge Layers." `no-cross-layer-imports` rejects imports of `apps/infra` from elsewhere (message `infraOwner`).
- Rat Stack also names its own gap: "**No fence yet** proving that imports do not deploy resources; candidate: an import-without-deployment test."

**Check.** Lint: any specifier resolving into the infra app is an error outside it; a test that imports every published entry in a sandbox with no network/credentials and asserts no provisioning call. Mechanical + one integration test.

---

## 18. bind-once-at-the-composition-root

**Rule.** Layers are provided once, at the application's composition root (`main.ts`, `worker.ts`, the Worker `fetch` entry). No library and no request-handler body calls `Effect.provide` or rebuilds a Layer.

**Why.** Mid-pipeline binding scatters wiring, prevents substitution in tests, and recreates clients per request. One root means one place to change a vendor and one place to see the whole dependency graph.

**Evidence.**

- Our `cell-architecture/service-and-layer-boundaries` §4: single binding site, `R = never` at the run edge, no mid-pipeline binding, request-scoped services carved out in edge middleware.
- Effect: the platform `NodeRuntime`/worker entry builds the context; services never self-provide (`NodeFileSystem.ts` exports a Layer, not a wiring).
- Rat Stack: composition at `apps/site/src/app.ts` / `apps/cli/src/surfaces.ts` by supplying implementations with Layers.
- `younna-ai`: `workers/platform/src/worker.ts` and `src/git-worker.ts` are the Layer-wiring files.

**Check.** Lint: `Effect.provide`/`Layer.build`/`ManagedRuntime.make` allowed only in declared entry files (`src/main.ts`, `src/worker.ts`, `src/*.worker.ts`). Mechanical.

---

## 19. config-and-secrets-at-the-edge

**Rule.** Environment and secrets are read at the app edge (or through `Config` inside an adapter's `layerConfig`). A package accepts options and never reads `process.env`, `import.meta.env`, files, or the clock at import.

**Why.** A package that reads the environment cannot be tested, cannot run in a second deployment, and leaks its host's configuration into its API. This is also the import-time-inertness rule seen from the configuration side.

**Evidence.**

- Our `package-topology/import-time-inertness`: importing an entry must not read `process.env`, the clock, or randomness; "the consumer runs them at its own composition root".
- Effect: `layerConfig` for options read through `Config` (our `service-and-layer-boundaries` §2); platform adapters take `options` and let the root supply `Config`.
- Rat Stack: the Config adapter "reads deployment configuration"; the KV adapter owns its namespace; secrets are granted at the edge (`auth: { credential: github }`), never held by code.
- Stead: `stead.token("github")` at the edge; the catalog "keeps one row per credential and never a secret".

**Check.** Lint: `process.env`/`import.meta.env`/`new Date()`/`Date.now()` forbidden under `packages/**/src` except a declared `config.ts`/`options.ts`; mechanical.

---

## 20. names-say-what-they-do

**Rule.** Every package, folder and file is named for the job it does. Role names are allowed on a package whose job _is_ that role (`@scope/sdk`, `@scope/oxlint-preset`); directories named for a layer (`core/`, `utils/`, `common/`, `shared/`) are banned because they group code that shares nothing a reader can check.

**Why.** A name is the cheapest documentation and the only one that survives refactors. "core/" answers no question; "billing/" answers one.

**Evidence.**

- Our `CONSTITUTION.md` CONST-N1: "Organise code by what it does… a name must answer 'of what?'" — with the precedent: "Packages were nested into role tiers (core, testing, lint) that grouped packages sharing nothing a reader could check. Right: the tiers were reverted; folders name product families."
- Deno std: one package per capability (`assert`, `bytes`, `cache`, `csv`); entry names are kebab-case by lint (`check_export_names.ts`).
- Stead: `relay/{lib,client}`, `core/{server,codegen,sdk,cli,e2e}`, `ui/{shell,template}` — role names where the role is the job.
- Effect: `platform-{node,bun,browser}` names the runtime contract, not a layer.

**Check.** Review; optional script: fail on a directory literally named `core`, `utils`, `common`, `shared`, `helpers` inside a package's `src/`, with an allowlist for parity with CONST-N1 exceptions.

---

## 21. two-documents-per-package

**Rule.** Each package carries `README.md` (using it) and `DEVELOPERS.md` (architecture, invariants, testing, extending). Each application carries an `AGENTS.md` describing how to work inside it.

**Why.** The README is the contract a consumer reads; the DEVELOPERS file is the contract a maintainer reads. One file that tries to be both ends up stale in one of the two roles.

**Evidence.**

- Stead: **11 of 11** packages carry both (`relay/{lib,client}`, `core/{cli,codegen,e2e,sdk,server}`, `ui/{shell,template,eslint-plugin-stead}`, `central`); `CLAUDE.md` line 3: "Each package's `README.md` (using it) and `DEVELOPERS.md` (its architecture, invariants, testing, extending) have the detail; they and the code are the source of truth."
- Stead `ui/template` ships `AGENTS.md`, `DESIGN.md`, `DEVELOPERS.md`, `README.md` into every workspace.
- `younna-ai` has repo-level `AGENTS.md`, `CONSTITUTION.md`, `ARCHITECTURE.md`; the per-package pair is the missing half.

**Check.** Script: every `packages/*/package.json` has sibling `README.md` and `DEVELOPERS.md`; every `apps/*` has `AGENTS.md`. Mechanical.

---

## 22. lockstep-versions-for-a-shared-type-graph

**Rule.** Packages whose public signatures embed each other's types version in lockstep (one changesets `fixed` group). Independent versions are allowed only where no public type crosses the boundary.

**Why.** A user on adapter version N and core version M gets two incompatible shapes with no error at install time. Lockstep removes the version-skew surface; independent versions are only safe when nothing structural crosses.

**Evidence.**

- Effect: `.changeset/config.json` `"fixed": [["effect", "@effect/*"]]`; every inspected package at `4.0.0-beta.98` (core + 12 sql drivers + 3 platform packages).
- Vitest: all 14 packages at one version, released together.
- TanStack query: one `fixed` group over all 20 runtime packages. TanStack router: independent versions (`router-core` 1.171.38 vs `react-router` 1.170.45) — and both ship cross-package types, which is the risk this rule avoids.
- Deno std: independent versions, but each package's public types are its own (`@std/assert` does not embed `@std/path` types in signatures).

**Check.** A script that walks public signatures for imports from a sibling package and fails when that sibling is not in the same changesets `fixed` group. Mechanical; the changesets config is the source of truth.

---

## 23. surface-changes-are-versioned

**Rule.** A change to the declared surface (entries, exported names, types those names reach) is classified by what it removes, renames, narrows or adds, and the bump is recorded in the changeset. For a private package, the same classification is recorded in the PR and gated by the usage check instead of semver.

**Why.** The surface is a promise; a removal that ships as a patch breaks consumers silently. Private packages still have consumers — they are inside the repo.

**Evidence.**

- Our `package-topology/surface-changes-are-versioned` (the rule already exists; gates `review` + changeset).
- All 24 `@younna/*` packages are `private: true` with no changesets, so the published-package form never fires (cycle 007, P9).
- Rat Stack: removal is a checklist step with files, deps and config entries named (cycle 005, R7).

**Check.** CI: a changeset is required when a diff touches an exports map or an entry module (path-based check); for private packages, the PR template requires the removal/usage note. Mechanical.

---

## 24. one-gate-command-pre-commit-and-ci

**Rule.** The repository has one validation command. Pre-commit hooks run it (or a fast subset of it) and CI runs the same command; bypassing hooks (`--no-verify`) is blocked by policy, not by trust.

**Why.** A fence that only runs in CI is a fence people route around locally; a hook that runs something different from CI produces "works on my machine" twice.

**Evidence.**

- Rat Stack: `lefthook.yml` pre-commit runs `pnpm check` then `pnpm test`; the fence header says "Cheating with --no-verify is blocked by agent hooks"; `scripts/vcs-command-policy.js` implements the block; CI runs `pnpm turbo run check test build`.
- Vitest: `knip` runs as its own workflow and inside the PR target list; lint (oxlint + oxfmt), typecheck (`tsc -p tsconfig.check.json`) and build are separate CI steps runnable locally.
- Stead: `stead check` (typecheck, lint, headless page render against budgets) is the same command in the template's `package.json`.

**Check.** Review + config assertion: the hook command string equals the CI command string (or a documented subset). Mechanical as a script comparing configs.

---

## 25. publish-what-you-test

**Rule.** CI packs each package, lints the tarball (`publint`, `arethetypeswrong`), imports every declared entry from the packed artifact, and (for public packages) publishes a PR preview. Tests must not be the only consumer of a surface.

**Why.** Sources can type-check and tests can pass while the published artifact is missing an entry, the `.d.ts` drops names the `.mjs` keeps, or the map points at a file that is not in the tarball. Only the artifact tells the truth.

**Evidence.**

- Our `CONSTITUTION.md` CONST-T8: "Tests imported the package's source, so it published with no built output… Right: the package ships its build, and the pack check reads what each tarball contains."
- TanStack query: `pkg-pr-new publish --pnpm --compact './packages/*'` on every PR (`.github/workflows/pr.yml:57`) — every package must build and pack; `knip` catches unused exports.
- Deno std: `deno publish --dry-run` on every PR (`.github/workflows/ci.yml:58`).
- Gap on record: TanStack query installs `@arethetypeswrong/cli` and `publint` but no script or workflow invokes them (cycle 000, T10) — do not copy that half.
- Our `package-topology/condition-branch-agreement` records the same defect from the other side: the built `.mjs` kept six names the built `.d.ts` dropped while every in-repo check passed.
- Effect: `publishConfig.exports` rewrites every entry to `./dist/*.js`, and `files` ships `dist` + `src` — the pack check is meaningful because the map is explicit.

**Check.** CI job per package: `pnpm pack` → `publint` (no errors) → `attw` (no `FalseExportDefault`/missing types) → a Node script that `import()`s every `exports` key from the tarball. Mechanical.

---

_Part 2 ends — 25 rules total._

---

# Part 3 — Conflicts between sources, and the ruling for an Effect + Cloudflare stack

Every conflict below was observed between two or more of the six sources. Each gets one ruling; the pack states the ruling, not the debate.

| #  | Conflict                                 | Sides (evidence)                                                                                                                                                                                                | Ruling for Effect + Cloudflare                                                                                                                                                                                                                                                                                                                    |
| -- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | **`export *` in entry modules**          | Deno std uses it heavily (`assert/mod.ts`, 27 sites); TanStack `router-core/src/index.ts` starts with `export * from './global'`; Effect enumerates (`export * as X`) and our pack bans it                      | **Enumerate.** `export * as Name from './x.ts'` is allowed; bare `export *` is banned in any package a bundler builds. Deno is the exception because JSR enforces paths and there is no bundler; a Deno-shaped tree is not this stack.                                                                                                            |
| 2  | **Wildcard folder-mirror exports**       | Effect ships `"./*": "./src/*.ts"` (139 entries, internals null-blocked); our `declared-entry-points` says a subpath never mirrors the folder tree                                                              | **Ban the mirror; keep roles.** Role/capability entries (`./node`, `./schema`, `./ui`) are the surface. A module-per-file wildcard is allowed only for a library whose public unit _is_ the module, and even then `"./internal/*": null`. `younna-ai/platform`'s 135 per-module facets are a mirror and are the failure this rule exists to stop. |
| 3  | **How many entries**                     | Deno `@std/assert` 31 capability entries; `query-core` 1; Vitest 14 role entries; Effect 139                                                                                                                    | **Count is unbounded, use is not.** Each entry must be a role a consumer names, and every entry must have a consumer outside its owner (rule 7). The Miller bound in `declared-entry-points` stays as the test for names _within_ an entry.                                                                                                       |
| 4  | **Lockstep vs independent versions**     | Effect, Vitest, query: one version/fixed group; router and Deno std: independent                                                                                                                                | **Lockstep when public types cross** (rule 22). Independent is correct only where no signature embeds a sibling's type — router and Deno std qualify; our `@younna/*` packages do not (they share schema types). Private packages get the usage gate instead of semver (rule 23).                                                                 |
| 5  | **Review gates vs mechanical gates**     | Our packs: 6 of 7 package-topology rules are `review`, and `api:check` is unconfigured in `younna-ai`; the sources enforce by lint/script/CI (Rat Stack fence, Deno scripts, Effect oxlint plugin, Vitest knip) | **Mechanical where a checker can exist.** Ship the checker with the rule: oxlint rule, script, knip target, gritlint pack, CI job. `review` survives only where no checker can express the law (removal test, role naming, infrastructure placement).                                                                                             |
| 6  | **Apps importing apps**                  | Stead allows it through `@apps/<app>` (and lints file reach); Rat Stack forbids packages→apps and apps→`apps/infra`; our tree has packages→workers                                                              | **Compose through the export, never by path.** App→app is allowed only for composition (a component/entry the other app publishes); app→infra is banned; package→app is banned. Three lint rules, one per direction (rules 2, 4, 17).                                                                                                             |
| 7  | **Source-only vs built artifacts**       | Stead packages run from `src/` with no build; Deno ships source to JSR; Effect/Vitest build and ship `dist` with a publish map                                                                                  | **Source-only is legal for private, in-repo packages** (bundlers and Workers consume TS); **every published package ships a built artifact** with `publishConfig.exports`, and CI proves it by packing and importing each entry (rule 25; CONST-T8). Mixed rule would have caught `younna-ai`'s "no built output" precedent.                      |
| 8  | **Where tests live**                     | Deno: beside source, `_test.ts`; Effect: `packages/*/test`; Vitest and TanStack: outside packages entirely                                                                                                      | **Inside the package, outside `src`; import the declared entry** (rule 12). Deno's beside-source files are acceptable because `_test.ts` is excluded from the package; tests that cross a package boundary by relative path are the violation every source commits somewhere.                                                                     |
| 9  | **What a "service" is**                  | Effect/cell: `Context.Service` tag in core + Layer in adapter; Rat Stack: core ports + adapter cartridges; Stead: services declared as data in `stead.yaml`                                                     | **Both levels, one seam.** Code-level services follow rule 6 (tag in core, `layer(options)` in adapter, bound once at the root). App-level services — an app's processes, ports, protocols — are manifest data, never code (rule 3). Stead's manifest is the model for the app level; Effect's tag is the model for the code level.               |
| 10 | **Runtime splits: condition or package** | TanStack: export conditions (`workerd`, `browser`, `node`); Effect: one package per runtime (`platform-node`, `-bun`, `-browser`); Vitest: a custom dev condition                                               | **Condition for a small divergence; package for a different implementation.** A `workerd` vs `node` boolean or a dev-vs-build path is a condition (rule 11); a whole runtime's capability set is a package. Never a runtime `if` inside one shared file — Workers will bundle the dead branch's `node:` imports.                                  |
| 11 | **Umbrella barrel inside the repo**      | Effect bans importing `effect` from inside the repo; Stead imports apps by `@apps/<name>` everywhere                                                                                                            | **Same rule, different unit.** An umbrella barrel over many modules is consumer-only (rule 10); an application's single declared entry _is_ its unit and is imported by name (rule 3). There is no contradiction: the ban is on a barrel that aggregates, not on a package's one entry.                                                           |

## What changes in our existing packs

- **`package-topology/declared-entry-points`:** add the consumer-justified bound (rule 7) — the current text explicitly leaves the package total unbounded, which allowed a 135-entry surface with 61 dead entries.
- **`package-topology/enumerated-entry-modules`:** keep; add the Deno/JSR exception sentence and the `export * as` allowance (already allowed) as the explicit counter-example.
- **`package-topology/surface-changes-are-versioned`:** scope to published packages and add the private-package gate (rule 23). In `younna-ai` the rule never fired because all 24 packages are private.
- **`package-topology/condition-branch-agreement`:** keep, and cite gritlint `source-resolution` as its checker (already referenced) — make the gate mechanical rather than review.
- **`cell-architecture/service-and-layer-boundaries`:** add §7 "the Layer owns its infrastructure" (rule 16) and §8 "the Stack has one owner" (rule 17). The current text governs Layers but never says who declares cloud resources.
- **`cell-architecture/single-namespace-barrel`:** add the application clause — an application's surface is role entries or one root barrel, never a flat per-module map (the `younna-ai/platform` case).
- **New pack:** `application-topology` with rules 3, 4, 13, 14, 15, 17 — the half no existing pack covers.

## Pack README (index to publish)

```
package-and-application-composition/
  README.md                       # scope, ranking, how to apply, gate summary
  removal-test.md                 (1)   review + recorded evidence
  packages-never-import-applications.md (2) lint
  application-is-a-package-with-one-export.md (3) script
  cross-app-reach-through-the-export.md (4) lint
  core-holds-no-adapters.md       (5)   lint
  service-in-core-layer-in-adapter.md (6) review + purity lint
  every-entry-has-a-consumer.md   (7)   knip/script
  entries-are-roles-not-modules.md (8)  review → path-shape lint
  internals-are-unnameable.md     (9)   script + lint
  repo-code-imports-modules-not-barrels.md (10) lint
  runtime-splits-are-export-conditions.md (11) gritlint source-resolution
  tests-import-the-published-surface.md (12) import lint + review
  app-template-is-deployable-in-isolation.md (13) pack-and-install job
  shell-never-reaches-into-an-app.md (14) dependency rule
  singleton-libraries-are-built-once.md (15) build assertion / peers
  layer-carries-its-infrastructure.md (16) review + alchemy lint
  stack-owned-by-one-app.md       (17)  lint + sandbox test
  bind-once-at-the-composition-root.md (18) lint
  config-and-secrets-at-the-edge.md (19) lint
  names-say-what-they-do.md       (20)  review + script
  two-documents-per-package.md    (21)  script
  lockstep-versions-for-a-shared-type-graph.md (22) changesets script
  surface-changes-are-versioned.md (23) changeset CI check
  one-gate-command-pre-commit-and-ci.md (24) config-equality script
  publish-what-you-test.md        (25)  pack + publint + attw + import job
```

Each file carries the four headings this document uses (`Rule`, `Why`, `Evidence`, `Check`) plus `applies_when` frontmatter in the style of `compound-packs`, so it can be enrolled exactly like the existing packs.

## Brief coverage (A–F → rules)

| Brief question                                                         | Answered by                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A. package vs application vs app template; allowed and forbidden edges | rules 2, 3, 4, 13, 14; edge table in Part 3 §6                                                               |
| B. public surface, legitimate vs illegitimate subpath, entry counts    | rules 7, 8, 9, 10, 11; conflicts 1–3                                                                         |
| C. where an interface/Layer belongs, adapter packages, split vs merge  | rules 5, 6, 16; conflict 9                                                                                   |
| D. tests: location, import path, contract tests, internals             | rule 12; conflict 8                                                                                          |
| E. applications: composition, Layers at the edge, template isolation   | rules 3, 13, 14, 15, 16, 17, 18, 19; conflicts 6–7, 10                                                       |
| F. mechanical enforcement                                              | rules 7, 9, 11, 21–25; conflict 5; gritlint `source-resolution`; Deno std's four checkers; Rat Stack's fence |

## Limits of this evidence

- **Rat Stack** is a public corpus plus a repository; the cartridge and infrastructure claims rest on its `/lore/*` pages and its own README (its code was cloned and the fence rules read directly). Its one-line infrastructure removal is **unproven** by its own admission.
- **Stead** is a reference clone of `nythrox/Stead`; its README/DEVELOPERS convention and app boundaries were verified in the tree, but the workspace is a template, not a deployed product.
- **Effect smol** is the `4.0.0-beta.98` tree; the interface/Layer shape is stable but the `unstable/*` namespaces are, by name, not.
- **`younna-ai`** figures are from a 2026-10-21 working tree; the 39%-unused measurement is a snapshot and should be re-run after any cleanup.
- **No source** has a working mechanical check for: the removal test, infrastructure ownership, or role naming. Those three stay `review`, and the pack says so rather than pretending otherwise.
