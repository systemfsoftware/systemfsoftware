# FINDINGS — b3d082e3: TS package/application composition in an Effect + Cloudflare (Alchemy) monorepo

**Question:** how should TS packages AND applications in an Effect + Cloudflare (Alchemy) monorepo be structured so they COMPOSE instead of collapsing into each other? Deliverable: evidence-backed rules at the Compound Engineering pack format (README + one rule per file, each with rule / why / evidence / enforcement check).

**Method:** shallow clones under `/mnt/sdb2/Projects-from-nvme/research-src/{router,query,vitest,std,effect-smol}`; own repos (`~/.kiro/crew/workspace/research` clone `stead-ref`) and the live `systemfsoftware` repo are read in place. Every claim below cites a path in a clone of the date shown.

---

## Cycle 000 — TanStack: core / adapter split, public surface, env splits, test imports, versioning

**Sub-question:** A+B+D (TanStack half). Sources: `github.com/TanStack/router` (42 packages) and `github.com/TanStack/query` (26 packages), clone of 2026-10-21.

### Findings

1. **Adapter-around-core, not core-knows-framework.** `packages/query-core/package.json` has empty `dependencies` and `peerDependencies`; `packages/react-query/package.json` depends on `@tanstack/query-core` and peers on `react`. On the router side the framework-neutral `packages/start-client-core` and `packages/start-server-core` contain **zero** files importing `react` (`grep -rln "from 'react'" … | wc -l` → 0,0), while `react-start-client` / `react-start-server` are the adapters and `react-start` is a thin meta-package depending on `react-router` + all three start cores. Evidence paths: `router/packages/react-start/package.json`, `router/packages/react-start-client/package.json`, `router/packages/react-start-server/package.json`.

2. **Public surface is a budget.** Every published query package exports exactly `"."` and `"./package.json"` (`query/packages/react-query/package.json`, `query-core`, `query-persist-client-core`). `router-core` exports `'.'`, `'./ssr/server'`, `'./ssr/client'`, `'./isServer'`, `'./scroll-restoration-script'`, `'./package.json'` — every subpath is a **runtime-environment split or a standalone script**, never an internal module.

3. **Runtime splits are export conditions, not paths.** `router-core`'s `./isServer` declares conditions `development, workerd, worker, browser, deno, node, bun, import, require`, each mapped to its own compiled file from `src/isServer/{development,client,server}.ts`. `client.ts` is 2 lines (`export const isServer = false`); `server.ts` reads `process.env.NODE_ENV !== 'test'` and re-exports the server-only loader. This is the exact Cloudflare-Workers-safe pattern (no server code in the client bundle, no `node:` import in the worker entry).

4. **Cross-library integration is its own package.** `router/packages/react-router-ssr-query/package.json` depends only on `@tanstack/router-ssr-query-core`; neither router nor query learns about the other. Same shape for `react-start` (composition) vs `react-router` (adapter) vs `start-*-core` (neutral).

5. **Dependency discipline holds in src, leaks in tests.** `grep -rn "from '../../[a-z-]*/src/" packages/*/src/` → **0** hits. In tests, 5 files deep-import `../../router-core/src/ssr/ssr-match-id` (`router/packages/react-router/tests/*`) — a real, citable counter-example showing why the rule must be enforced by a checker rather than convention.

6. **Tests import through entries.** `router/packages/react-router/tests`: 42 imports from `'../src'` (own package entry), 20 from `'@tanstack/router-core'` (public entry). `query/packages/react-query/src/__tests__`: 40 from `'..'`, 20 from `'@tanstack/query-core'`, 32 from `'@tanstack/query-test-utils'` — a **real package** (`query/packages/query-test-utils`) rather than a `./test-utils` export. No package exports internals for tests.

7. **Versioning is a deliberate changeset choice, and the two repos differ.** `query/.changeset/config.json` has one `fixed` group containing all 20 runtime packages (all report 5.104.5). `router/.changeset/config.json` has `"fixed": []` and independent versions (router-core 1.171.38, react-router 1.170.45, virtual-file-routes 1.162.0). Conflict recorded; both ship cross-package types, so our leaning is fixed-lockstep.

8. **The real CI gates.** `query/package.json:16` `test:pr = nx affected --targets=test:sherif,test:knip,test:docs,test:eslint,test:oxlint,test:lib,test:types,test:build,build`; `:26` runs knip twice (`knip && knip --strict --include unlisted --no-gitignore`); `.github/workflows/pr.yml:57` publishes every package via `pkg-pr-new publish --pnpm --compact './packages/*'`. So: package-graph lint (sherif), unused-export/dep detection (knip), and a real install-and-import smoke per package.

9. **Gap, not pattern:** `@arethetypeswrong/cli` and `publint` are devDependencies in `query/package.json` and several packages, but no script or workflow invokes them.

### Implications for the pack (draft rules)

- One public entry per non-adapter package; subpaths only for runtime/environment splits; forbid `./internal`, `./test-utils`, `./src/*`.
- Framework-neutral core: no framework dependency _and_ no framework peer; adapters own the peer dep.
- Environment split via export conditions (`workerd`, `browser`, `development`), backed by per-runtime source files.
- Shared test fixtures are a package (`@scope/test-utils`), not an export.
- Lockstep versions across packages whose public types cross package lines.

---

## Cycle 001 — Vitest: role-named entries, internal namespace, source condition, bundled siblings

**Sub-question:** B+C+D (Vitest half). Source: `github.com/vitest-dev/vitest` (14 packages), clone of 2026-10-21.

### Findings

1. **One version for all 14 packages** (`5.1.0-beta.1` everywhere), released together by `.github/workflows/publish.yml` — lockstep even without a changesets file.
2. **Entries are roles, not modules.** `packages/vitest/package.json` exports: `.`, `./node`, `./browser`, `./runtime`, `./worker`, `./config`, `./globals`, `./jsdom`, `./importMeta`, `./import-meta`, `./optional-types.js`, `./optional-runtime-types.js`, `./internal/browser`, `./internal/traces`, `./package.json`. Each maps 1:1 to a file in `packages/vitest/src/public/`.
3. **`./internal/*` is the policy.** Non-public entries are named `internal/*` (`vitest/internal/browser`, `@vitest/browser`'s `./internal/vendor-types`); consumers are in-repo browser internals, never users.
4. **`__vitest_source__` custom condition → source, no dist, no relative cross-package paths.** `tsconfig.base.json:5` sets `customConditions: ["__vitest_source__"]`; every export carries `"__vitest_source__": "./src/<entry>.ts"`; `packages/vitest/rollup.config.js:87` sets `exportConditions: ['__vitest_source__']`. The monorepo imports by public specifier and still resolves to src.
5. **Publish-vs-bundle is a deliberate split.** `vitest`'s only runtime `@vitest/*` dependency is `@vitest/mocker`; `expect`, `snapshot`, `spy`, `utils`, `pretty-format` are **devDependencies** and are bundled because rollup's `external` is built from deps + peerDeps only. They remain separately published for ecosystem reuse but cannot skew against the installed vitest.
6. **Optional capabilities = separate packages + optional peers.** Browsers, coverage providers, `ui`, `jsdom`, `happy-dom`, `vite`, `@opentelemetry/api` are all in `peerDependencies` with `peerDependenciesMeta.*.optional = true`.
7. **Optional peer types are isolated in types-only exports.** `./optional-types.js` maps to `{"types": "./optional-types.d.ts"}` with no runtime file; that file is `export type * as jsdomTypes from 'jsdom'` under `@ts-ignore optional peer dep` (same for happy-dom). The core `.d.ts` graph never requires an optional package.
8. **`src/public/` is the entry directory; everything else is internal** (`src/api`, `src/node`, `src/runtime`, `src/integrations`, `src/typecheck`, `src/types`, `src/utils`).
9. **Tests live outside packages.** `find packages -name '*.test.ts'` → **0**; tests are private projects `@vitest/test-unit`, `@vitest/test-e2e`, … that import the public entry (`'vitest'` 81 import sites in the sampled census). Shared helpers are the private package `@vitest/internal-testing-helpers` (`test/test-utils/package.json`, `main: ./index.ts`, no build).
10. **But internal unit tests do deep-import across package lines:** `test/unit/test/sequencers.test.ts:3-5` → `../../../packages/vitest/src/node/...`, `test/unit/test/injector-mock.test.ts:2` → `../../../packages/mocker/src/node/hoistMocks`. Same compromise as TanStack router; a boundary rule must state its test exemption.
11. **Enforcement is lint, per glob** (`.oxlintrc.jsonc:260-335`): `packages/**` may not import the published specifier `vitest` / `vitest/node` (import the source instead); packages that declare `vitest` as a peer are exempted (adapter exemption); `test/unit/**` may not use `runVitest*` helpers (test-tier boundary: "Tests that start Vitest belong in test/e2e"); `path` is banned repo-wide in favour of `pathe` (runtime portability — relevant to workerd).
12. **Subpath-count is role-dependent.** `@vitest/utils` has 14 entries, each an independently consumable helper family (`./diff`, `./resolver`, `./error`, `./helpers`, `./offset`, `./constants`, `./timers`, `./display`, `./source-map`, `./source-map/node`, `./serialize`) — legitimate. `@vitest/coverage-v8` adds `'./*'`, a wildcard escape hatch — treat as a smell.

---

## Cycle 002 — Deno std: many small packages, many entries, custom lint as architecture

**Sub-question:** B+C+D+F. Source: `github.com/denoland/std` (40 workspace packages), clone of 2026-10-21.

**Brief corrections (verified):** there is no per-module `jsr.json` — JSR metadata lives in each module's `deno.json`; and there are **3** READMEs in the tree (`fmt/README.md`, `testing/README.md`, root), not a README per module. Documentation is enforced through JSDoc, not READMEs.

### Findings

1. **One directory per package**, listed in the root `deno.json` workspace (40 members), each with its own `deno.json` manifest (`assert/deno.json`: `@std/assert`, `1.0.19`, `exports`).
2. **Independent versions, and the major is the stability signal.** `check_unstable_deps.ts` classifies 0.x packages as unstable; `check_circular_package_dependencies.ts` uses `version.major > 0 ? 'Stable' : 'Unstable'`.
3. **One entry per capability.** `@std/assert` has **31** entries: `'.' → ./mod.ts` plus `./almost-equals → ./almost_equals.ts`, `./array-includes`, … `./unstable-equals`. Files snake_case, entry paths kebab-case.
4. **`mod.ts` must export every public file — checked.** `_tools/check_mod_exports.ts` parses mod.ts's export declarations, walks the package at depth 1 skipping `unstable`, `_test.ts`, `_bench.ts`, `.d.ts`, any path containing `_`, and `mod.ts`, then fails with `<mod.ts> does not export '<file>'`.
5. **Underscore = private module.** Relative imports exist only _inside_ a package and only into `_`-prefixed files (`path/windows/parse.ts` → `../_common/constants.ts`, `../_common/assert_path.ts`).
6. **Cross-package imports are public specifiers only:** `assert/is_error.ts:4` → `@std/internal/styles`; `assert/less_or_equal.ts:3` → `@std/internal/format`.
7. **`unstable` is a real tier:** `unstable_` symbol/file prefix (`assert/unstable_equals.ts`), `./unstable-*` entries, and `_tools/check_unstable_deps.ts` builds the module graph of all stable entrypoints, failing on any edge into unstable (`@std/http` and `@std/http/file-server` are the only documented exceptions).
8. **No cycles between packages:** `_tools/check_circular_package_dependencies.ts`.
9. **Entry naming is linted:** `_tools/check_export_names.ts` enforces kebab-case with an allowlist (`base64url`, `v1`…`v7`, `2d`).
10. **Docs are a gate and examples execute:** `_tools/check_docs.ts` (`@deno/doc`) validates params/typeParams/returns/`@example`; the test task runs `--doc`, so example code is executed. 42 `mod.ts` files carry `@module`.
11. **Runtime compatibility is declared and checked:** 456 files contain “This module is browser compatible.”; `test:browser` greps that sentence and type-checks those files with `browser-compat.tsconfig.json`. Node and Bun run the suite through a shim (`_tools/node_test_runner`). CI also runs `deno publish --dry-run`.

**Implication:** this is the strongest mechanical-enforcement model found so far, and it is four ~100-line scripts — no framework. For an Effect + Cloudflare stack, the equivalents are: a barrel-completeness script, a package-graph cycle check, a stability-tier check, and a `workerd`-compatibility marker + tsconfig.

---

## Cycle 003 — Effect smol: namespace barrel, casing as policy, service/implementation split, lockstep

**Sub-question:** C+B+E. Source: `github.com/Effect-TS/effect-smol` (Effect 4), clone of 2026-10-21. This is the closest model to our stack.

### Findings

1. **Lockstep versions.** `.changeset/config.json` has `"fixed": [["effect", "@effect/*"]]`; every package inspected is `4.0.0-beta.98`. `scripts/version.mjs` generates `src/internal/version.ts` from the package version.
2. **The root entry is a barrel of per-module namespaces.** `packages/effect/src/index.ts` has **138** `export * as X from "./X.ts"` lines (line 37: `export * as Array from "./Array.ts"`). Every module is _also_ a subpath: `"./*": "./src/*.ts"` — so `effect/Array` and `import { Array } from "effect"` are both legal for users.
3. **Inside the repo, the umbrella barrel and every internal path are lint errors.** Custom oxlint rule `effect/no-import-from-barrel-package` (`packages/tools/oxc/oxlintrc.json`) with patterns `^effect$`, `^effect/(.+/)?[a-z][a-z0-9]*$`, `^@effect/[^/]+$`, `^@effect/[^/]+/(.+/)?[a-z][a-z0-9]*$`, plus `checkRelativeIndexImports: true`. **Casing carries the semantics:** PascalCase = public module, lowercase = internal.
4. **Internals are blocked at the package boundary too:** every `package.json` has `"./internal/*": null` and `"./*/index": null` (and nested `"./unstable/cli/internal/*": null`).
5. **Service vs implementation is explicit.** `packages/platform-node/src/NodeFileSystem.ts` imports `type { FileSystem } from "effect/FileSystem"` and the implementation from `@effect/platform-node-shared/NodeFileSystem`, and its JSDoc states: _"Effects still call the service from `effect/FileSystem`; this module only chooses the Node implementation."_ This is the C1 answer.
6. **One package per runtime** (`platform-node`, `-bun`, `-browser`) over `platform-node-shared`; all peer on `effect`; identical export shape.
7. **One package per external backend:** 12 `@effect/sql-*` drivers, all lockstep, all peering `effect`, with 0–5 dependencies (`sqlite-do`, `sqlite-node`, `sqlite-bun`, `sqlite-react-native`, `sqlite-wasm` at 0; `d1` at 1). Core never branches on vendor.
8. **Tests live in `packages/*/test`** (inside the package, outside `src`), import public entries (`effect`, `effect/Function`, `effect/testing`) and use `@effect/vitest` (`assert`, not vitest `expect`).
9. **JSDoc is a gate:** `lint = pnpm jsdocs && oxlint -f unix && dprint check`; `@effect/jsdocs` ships the `effect-jsdocs` bin; the `effect/jsdocs` oxlint rule validates the JSDoc model; every export carries `@since` / `@category`.
10. **Cycles fail CI:** `scripts/circular.mjs` runs **madge** over `packages/*/src/**/*.ts` with `skipTypeImports` and exits 1 on cycles.
11. **Types are tested:** `tstyche --target '>=5.9'`, plus `tsc -b` project references (`check`, `check-recursive`).
12. **`publishConfig.exports` is a second exports map** (dev → `./src/*.ts`, publish → `./dist/*.js`) — the dev-on-src problem solved without a custom condition.
13. **Gap:** nothing checks that the 722-line root barrel exports every module (no index check in `scripts/`); Deno std has that checker, Effect does not.

**Implication for the deliverable:** the brief's export-count concern (younna-ai 136 / kit 59) is the wrong lever — Effect itself publishes 139 entries. The right lever is _what_ is exposed: public modules by casing, internals null-blocked, umbrella barrel banned inside the repo, and adapter packages that only export Layers.

---

## Cycle 004 — Stead: the app is a package with one export; the shell never reaches in

**Sub-question:** A+E. Source: `github.com/nythrox/Stead` (local clone `/mnt/sdb2/Projects-from-nvme/stead-ref`). The only source in the survey with real applications.

### Findings

1. **An app is one private package whose only export is its UI barrel.** `examples/apps/atlas/package.json`: `@apps/atlas`, `private`, `exports: {".": "./stead/ui/index.ts"}`. Its Stead surface is the folder `stead/` (`routes.tsx`, `stead.yaml`, `ui/`).
2. **Services are data, not code.** `stead/stead.yaml`: `apiVersion: stead/v1`, `kind: app`, `metadata`, `ui`, and `spec.services` with per-service `run`/`port`/`health`/`activation`/`idle`/`protocol` (e.g. `web` on 4156, `shell` pty, `code` fs).
3. **Reaching into another app's files is a lint error.** `ui/eslint-plugin-stead/index.js` rule `noReachIntoApp` reports any relative import/export whose target resolves under a _different_ `apps/<dir>/`. The message: _“An app is built and swapped as one: reached into, a broken `<app>` breaks this file too, and an edit to it does not reach this page. Import what it exports instead: `import { … } from "@apps/<app>"`.”_
4. **App→app dependency is allowed through the export only.** `@apps/atlas` depends on `@apps/calendar`, `@apps/github`, `@apps/slack`, `@apps/time` as `workspace:*`; the forbidden edge is file-level reach, not the dependency.
5. **The shell imports nothing from a workspace.** `CLAUDE.md`: _“imports nothing from a workspace: the workspace can break; the shell cannot”_. Built-in apps are **subpath exports of the shell package** (`@stead/shell` exports `./apps/connections`, `./apps/access`, `./apps/agent`, `./apps/messaging`), and `builder.ts:34-37` only exposes a system app if its export is declared.
6. **Every app is loaded through a generated `@apps/<name>` module** — lazily, code-split per app, with its own mount/error/loading state (`runtime/entry.tsx:91`, `runtime/slot.tsx:124`).
7. **Singletons are built once and reached through an import map.** `builder.ts:1-14,183`: one vendor build holds the shared libraries, stable entry addresses mean the map never changes on an app rebuild; pages reload only when the map changes.
8. **Packages run from source.** `CLAUDE.md`: _“every package's exports point at its `src/`. `dist/` folders are stale: never rely on them.”_ `@stead/sdk` exports `'.'`, `'./node'`, `'./react'`, `'./feed'`, `'./zero'` — all `./src/*.ts`.
9. **Entries are roles**, not module paths: `@stead/shell` has `./router`, `./entry`, `./gen`, `./ui`, `./vite`, `./workspace`, `./cli`, `./tokens.css` plus one per built-in app; `@stead/core` has only `'.'` and `'./protocols'`.
10. **Two documents per package:** all 11 packages carry `README.md` (using it) and `DEVELOPERS.md` (architecture, invariants, testing, extending).
11. **What ships is a workspace template.** `ui/template/package.json` is `stead-workspace` (private, `stead dev|check|map`, desktop `stead/` + apps); apps are packages inside it.
12. **One strict pnpm catalog** (`catalogMode: strict`) holds every third-party version; each package declares what it uses as `catalog:`, Stead's own as `workspace:*`.
13. **Lint teaches:** all four plugin rules carry the fix in the message (`limit()` on Zero list queries, no service calls while rendering, pages render `<Page>`, cross-app import path).

**Weak spot recorded:** the claim “the desktop's tree refuses an app's page” appears in `CLAUDE.md` but no checker was found in `ui/shell/src` — documented, not enforced.

---

## Cycle 005 — Rat Stack: the cartridge test, the fence, infrastructure in the Layer

**Sub-question:** A+C+E+F. Sources: `github.com/joelhooks/rat-stack` (shallow clone verified) and the `ratstack.sh` corpus (1.7 MB) — the only Effect + Alchemy + Cloudflare stack in the survey.

**Verified in code, not just prose:** `oxlint.config.ts`, `scripts/oxlint-plugin-boundaries.ts` (1534 lines), `lefthook.yml`, `scripts/vcs-command-policy.js`, README removal table, package exports.

### Findings

1. **The fence has a file list.** `oxlint.config.ts` registers plugins `rat-stack-boundaries` → `scripts/oxlint-plugin-boundaries.ts`, `rat-stack-patterns`, `anti-slop`, `anti-slop-effect`, `xstate-effect`. `lefthook.yml` pre-commit runs `pnpm check` then `pnpm test` (header: _“Cheating with --no-verify is blocked by agent hooks”_); `scripts/vcs-command-policy.js` implements that block. Root `check = lockfile:check && varlock load && turbo run typecheck && ultracite check && oxfmt --check .`
2. **Forbidden edges are rule messages, not prose** (`oxlint-plugin-boundaries.ts`, `noCrossLayerImports`):
   - _“packages/capability cannot import packages/core domain code.”_
   - _“Packages cannot import application code.”_
   - _“apps/infra owns its Stack wiring; import a capability or service contract instead.”_
3. **`noCoreAdapters` has the sharpest rule in the survey:** inside `packages/core/src`, only core/capability modules or `effect`/`xstate` domain libraries may be imported; `effect/*http*` and any `adapters?/vendors?` path is an error — _“Core cannot import HTTP clients or adapters. Provide a domain port from the composition root instead.”_
4. **The cartridge test:** labeled (one package, one job, named for it) · push in (one package + one `Layer.provide`/Stack line) · pull out (delete package + line, `pnpm turbo run check test build` still green) · self-contained (declares its own resources/bindings) · EZ to trash. Removal must leave other packages’ import paths unchanged.
5. **A Layer is one vendor’s implementation and carries its own infrastructure.** `Layer.provide` is the vendor’s private supply chain; swapping vendors is a one-line change; Alchemy provisions the resources on deploy; a removed binding is a compile error.
6. **One subpath per vendor** in adapter packages: `@rat-stack/database` → `'.'`, `'./d1'`, `'./hyperdrive-postgres'`; `@rat-stack/flags` → `'.'`, `'./kv'`, `'./cloudflare'`, `'./config'`, `'./memory'`, `'./lifecycle'`.
7. **Removal checklists are exact files + deps + config entries** (README table), e.g. flags: replace `apps/site/src/flags.ts`, remove `packages/flags` and its dependency; XState: remove `inspect-machine.ts` + test, `xstate` deps, `scripts/oxlint-plugin-xstate-effect.ts` and its `oxlint.config.ts` entry.
8. **Stack wiring has one owner:** `apps/infra/alchemy.run.ts`; runtime imports of `apps/infra` are lint errors.
9. **The fence publishes its own limits** — an “Oxlint rule limits” table (ten rules, syntax-bounded, _“cannot resolve TypeScript modules or prove whole-program behavior”_), plus explicit **“No fence yet”** gaps with a candidate check each (provider-import restriction, cartridge-removal compile check, import-without-deployment test).
10. **Capability = contract + handler, projected:** one Schema contract (input/output/failure/metadata) projected to HTTP (`HttpApi`), CLI, MCP and code mode — “do not write separate business logic for each interface.”
11. **Package vs app:** `packages/*` and `apps/*` share the `@rat-stack/*` scope, but apps may import packages, packages may not import apps, and nothing imports `apps/infra`.
12. **Admitted gap:** one-line infrastructure removal is _unproven_ for `packages/subscriber-delivery`; recorded, not claimed.

**Implication:** Rat Stack supplies the acceptance test the rest of the survey lacks — _deletion_. The pack’s top rule should be the removal test, with the lint edges (core bans adapters; packages ban apps; nothing imports the Stack) as its mechanical support.

---

## Cycle 006 — Ground truth in younna-ai: 136 and 59 are real, and 39% of the surface is unused

**Sub-question:** verify the brief's numbers and measure which model edges our tree violates. Source: `/mnt/sdb2/Projects-from-nvme/younna-ai` (24 workspace packages), import census over all `packages/` and `workers/` TypeScript.

### Measurements

| Package               | Declared subpaths | Used    | Unused        |
| --------------------- | ----------------- | ------- | ------------- |
| `@younna/platform`    | 135               | 74      | **61 (45%)**  |
| `@younna/kit`         | 58                | 24      | **34 (59%)**  |
| `@younna/app-runtime` | 39                | 11      | **28 (72%)**  |
| `@younna/agent`       | 34                | 27      | 7             |
| `@younna/workspace`   | 12                | 7       | 5             |
| `@younna/app-sdk`     | 31                | 28      | 3             |
| **workspace total**   | **378**           | **229** | **149 (39%)** |

Method: declared = every non-`'.'`, non-`./package.json`, non-wildcard key in each package's `exports`; used = every specifier matched by `(?:from|import)\s*\(?\s*['"]@younna/…['"]` anywhere under `packages/` and `workers/` (node_modules excluded). Zero used-but-undeclared specifiers, so the maps are complete — just over-broad.

### Findings

1. **The brief's counts are exact:** `workers/platform` 136 entries (135 subpaths + `./package.json`); `packages/kit` 59 (58 + package.json). Both `private: true`, so these are internal alias registries, not published APIs.
2. **Platform's shape:** 37 domains, 110 plain + 18 `.schema` + 8 `.service` entries (`./billing/store`, `./billing/store.service`, `./billing/store.schema`); **no `'.'` root entry**, no wildcards, no `internal/` namespace; every value → `./src/<path>.ts`.
3. **It is internally self-contained:** `workers/platform/src` uses 854 relative imports and **zero** `@younna/platform/…` self-imports. The 136-entry map exists only for outside consumers — which makes the unused half pure noise.
4. **The worst offenders are the biggest surfaces:** platform 61 unused, kit 34, app-runtime 28; the fully-used packages are small (`billing` 18/18, `connections` 9/9, `access-requests` 4/4).
5. **The forbidden package→application edge exists today, in code:** `packages/agent/src/conversation/agent-db-rows.ts:1` imports types from `@younna/workspace/schema/agent-db`; `packages/app-runtime/src/personal-apps/bundle-commit.ts:9-10` imports **values** from `@younna/app-builder/builder.schema` and `/isolates`, and `app-pages.service.ts:1-3` more types. Rat Stack’s `no-cross-layer-imports` reports exactly this as _“Packages cannot import application code.”_
6. **Workers depend on workers:** `platform` depends on `public-site`, `app-builder`, `workspace`, `preview-identity` + 11 packages; `web` depends on `platform`; `workspace-template` on `workspace`. Platform is the de-facto composition root (Effect/CONST-B4 shape) without the rule that keeps it so.
7. **No path leakage:** zero `@younna/<pkg>/src/…` imports; the maps are the only way in. The problem is breadth, not bypass.
8. **Our constitution already states the missing rules:** CONST-B4 (_“wire every implementation at one composition root; the core never imports the shell, a database, or a framework”_), CONST-N1 (_name every folder for its job; role tiers were reverted_), CONST-T8 (_test the published surface; the pack check reads the tarball_).
9. **Our enforcement does not cover topology:** `tooling/oxlint-plugin` has nine rules (a11y gate, effect ambient globals, effect control flow, effect idioms, global access, no product fakes, no sleeps, react-effect reach, role-label text queries) — **none** is a package/app boundary rule; `gritlint.json` runs only `typecheck-build-mode` and `npm-provenance`.
10. **Our app template is already manifest-driven and self-contained:** `packages/app-template` exports `{'.': './src/app.ts'}`, carries its own oxlint/tsconfig/vitest configs, and `stead.json` declares `contractVersion`, `rule`, `sources`, `knobs`, `decodePaths`, `pageEntry` — the same shape as Stead’s `stead.yaml`.
11. **What each model would cut here:** Effect/Rat Stack → shared schemas move to a core package, worker entries become role entries, internals become unnameable; Deno/Vitest → a barrel/consumer check deletes the 62+34+28 unused entries; Stead → worker→worker only through each worker’s export, and only platform provides Layers.
12. **The rule that follows:** _every declared entry has a consumer outside its owner, or it is deleted._ Count caps are the wrong lever; **usage** is the test — and it is mechanically measurable, as this cycle did.

---

## Cycle 007 — Our packs reviewed: strong on surface, silent on the graph

**Sub-question:** item 7. Sources: `compound-packs/package-topology` (all 8 files), `cell-architecture` (`single-namespace-barrel`, `service-and-layer-boundaries`), `gritlint/packs/source-resolution`, plus the repo evidence accumulated in cycles 000–006.

### What the packs already settle

- **`package-topology`:** declared entries (chunking or host contract), enumerated entry modules (no `export *`), one access path per symbol, published signature types, import-time inertness, condition-branch agreement, versioned surface change. **Six of seven gates are `review`**; only `public-signature-types` names a checker (`api:check`), and that checker is **not configured anywhere in `younna-ai`** (0 `api-extractor.json`).
- **`cell-architecture/single-namespace-barrel`:** one primary namespace barrel, no fragmented error/schema/blueprint barrels, zero-cycle leaves. Matches Effect exactly (138 `export * as` lines in `effect/src/index.ts`).
- **`cell-architecture/service-and-layer-boundaries`:** the best C1 statement in the org — three provisioning tiers, `*.service.ts` with zero driver imports, adapter module beside the service exporting `layer(options)`, one composition root binding, no mid-pipeline `Effect.provide`, `*Live` banned in libraries, test double in the test tree or `<capability>.memory.ts` with one contract suite, generic tags banned for scoping.

### What they miss (each maps to a cycle-000–006 finding)

1. **No dependency-graph rules.** Nothing says packages may not import applications, that core holds no adapters, or that apps reach each other only through an export. `younna-ai` violates the first today (`packages/agent` → `@younna/workspace`, `packages/app-runtime` → `@younna/app-builder`). Rat Stack codifies all three; Effect and Stead corroborate.
2. **The bound is names per entry, not entries per package.** `declared-entry-points`: _“the bound is on the names offered together at one entry, not … the package's total, which is unbounded.”_ That clause is exactly why 135 entries (61 dead) pass review.
3. **No runtime-split law.** `condition-branch-agreement` checks that branches agree; it does not say when a condition (workerd/browser/node) is the right mechanism instead of a subpath. TanStack `isServer`, Effect's platform packages and Stead's source-only packages all answer that.
4. **No test-import law.** Only `public-signature-types` mentions tests, and only to explain internal tags. Every source has a rule (Deno: source-adjacent; Vitest: outside packages, public entries; Effect: `packages/*/test`; Stead: real e2e; CONST-T8: test the published surface).
5. **No removal test.** Rat Stack's cartridge test and per-feature removal checklists are the acceptance test our packs lack.
6. **No infrastructure ownership.** `service-and-layer-boundaries` governs Layers but never says a Layer may carry cloud resources (Alchemy), that a Stack lives in one app, or that removal must be one line.
7. **No application or app-template rules.** Nothing covers app-as-package-with-one-export, shell-never-reaches-in, workspace-template-as-deployable, or singleton libraries via import map — while `younna-ai` already has the app-template shape (`stead.json`, one export).
8. **Assumes published packages.** `surface-changes-are-versioned` needs changesets; all 24 `@younna/*` packages are `private: true`, so it never fires. Private packages need a usage/boundary gate instead.

### Conflicts to adjudicate in the deliverable

| Our rule                                                            | Source                                                                                                    | Ruling                                                                                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `enumerated-entry-modules` (no `export *`)                          | Deno `assert/mod.ts` has **27** `export *`; TanStack `router-core` starts with `export * from './global'` | Keep the rule for bundler-built npm packages; treat Deno/JSR as the exception (registry enforces paths, no bundler). |
| `declared-entry-points` (“a subpath never mirrors the folder tree”) | Effect `"./*": "./src/*.ts"` (139 entries)                                                                | Keep our rule; a module-per-file library is the narrow exception, and even Effect null-blocks `./internal/*`.        |
| `single-namespace-barrel`                                           | younna `platform` has no root entry at all                                                                | Extend the rule: an application's surface is role entries or a root barrel — never a flat per-module map.            |
| `surface-changes-are-versioned`                                     | 24 private packages, no changesets                                                                        | Scope to published packages; private packages get usage + boundary gates.                                            |

### Mechanical checkers that already exist

- **gritlint `source-resolution`** — export-map order, `publishConfig.exports`, `tsdown` `devExports`, `tsconfig` `customConditions`, Vitest's two condition pipelines, api-extractor not following source, no `compilerOptions.paths` self-mapping. Our `condition-branch-agreement` already points at it.
- Deno std's four scripts (barrel completeness, stability tier, package cycles, export naming) translate directly to npm.
- Effect's `no-import-from-barrel-package` regex pair and Rat Stack's `no-cross-layer-imports`/`noCoreAdapters` are the two boundary-rule templates.

---

## Cycle 008 — Deliverable part 1: ranked rules 1–12 (package and surface law)

Written to `PACK.md` in pack format (rule / why / evidence / check). No new sources; synthesis of cycles 000–007.

| #  | Rule                                                                                                                | Gate                            | Status                                   |
| -- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------- |
| 1  | **removal-test** — delete the package and its provision line; every other import and `check test build` stays green | review + recorded evidence      | new                                      |
| 2  | **packages-never-import-applications**                                                                              | lint                            | new                                      |
| 3  | **application-is-a-package-with-one-export** (+ data manifest)                                                      | script                          | shape already in `app-template`          |
| 4  | **cross-app-reach-through-the-export**                                                                              | lint                            | port of Stead’s `noReachIntoApp`         |
| 5  | **core-holds-no-adapters**                                                                                          | scoped lint                     | extends `service-and-layer-boundaries`   |
| 6  | **service-in-core-layer-in-adapter**                                                                                | review + purity lint            | extends `service-and-layer-boundaries`   |
| 7  | **every-entry-has-a-consumer**                                                                                      | knip/script                     | new; closes `declared-entry-points`’ gap |
| 8  | **entries-are-roles-not-modules**                                                                                   | review, then path-shape lint    | extends `declared-entry-points`          |
| 9  | **internals-are-unnameable**                                                                                        | script + lint                   | new (Effect null-blocking)               |
| 10 | **repo-code-imports-modules-not-barrels**                                                                           | lint                            | new (Effect/Vitest form)                 |
| 11 | **runtime-splits-are-export-conditions**                                                                            | gritlint `source-resolution`    | extends `condition-branch-agreement`     |
| 12 | **tests-import-the-published-surface**                                                                              | import lint + review exemptions | new; renders CONST-T8 checkable          |

Rationale for the ranking: the first six rules are direction and deletion — the failures actually measured (package→worker imports, 39% dead surface) and the ones a review cannot see; rules 7–12 keep the boundary from rotting once it exists.

---

## Cycle 009 — Deliverable part 2: ranked rules 13–25, the set complete

Appended to `PACK.md` (25 rules total). No new sources; synthesis.

| #  | Rule                                          | Gate                                                       |
| -- | --------------------------------------------- | ---------------------------------------------------------- |
| 13 | **app-template-is-deployable-in-isolation**   | pack-and-install CI job                                    |
| 14 | **shell-never-reaches-into-an-app**           | dependency rule + one-entry-per-app assertion              |
| 15 | **singleton-libraries-are-built-once**        | build-output assertion / peers                             |
| 16 | **layer-carries-its-infrastructure**          | review + `alchemy` import lint                             |
| 17 | **stack-owned-by-one-app**                    | lint + sandbox import test                                 |
| 18 | **bind-once-at-the-composition-root**         | lint on `Effect.provide`/`Layer.build` sites               |
| 19 | **config-and-secrets-at-the-edge**            | lint on `process.env`/`import.meta.env` in packages        |
| 20 | **names-say-what-they-do**                    | review + banned-directory script                           |
| 21 | **two-documents-per-package**                 | script                                                     |
| 22 | **lockstep-versions-for-a-shared-type-graph** | changesets fixed-group script                              |
| 23 | **surface-changes-are-versioned**             | changeset-required CI check (extended to private packages) |
| 24 | **one-gate-command-pre-commit-and-ci**        | config-equality script                                     |
| 25 | **publish-what-you-test**                     | pack + publint + attw + import-every-entry job             |

Twelve of the 25 rules now have a mechanical gate; the rest are review with a named mechanical assist. The application rules (13–14, 17) are the ones nothing in our current packs covered.

---

## Cycle 010 — Deliverable complete: conflicts adjudicated, README, verification

`PACK.md` now contains all three parts and passes a structural check: **25 rules** (each Rule / Why / Evidence / Check), **11 conflict rows**, the pack file index with a gate per rule, the amendments our existing packs need, a brief-coverage table for A–F, and a limits section.

### The 11 rulings (short form)

1. **Enumerate entry exports** for bundler-built packages; Deno/JSR is the exception; `export * as Name` stays allowed.
2. **Ban wildcard folder-mirror exports**, keep role entries; internals null-blocked even in the exception.
3. **Entry count is unbounded, usage is not** — every entry needs a consumer outside its owner.
4. **Lockstep versions when public types cross**; independent only where no signature embeds a sibling type.
5. **Mechanical gates wherever a checker can exist**; `review` only for the three laws no checker can express (removal test, role naming, infrastructure placement).
6. **Apps compose through their export**; never by path; never into the infra app; packages never import apps.
7. **Source-only is legal for private in-repo packages**; anything published ships a built artifact proven by packing and importing each entry.
8. **Tests live inside the package but outside `src`**, importing the declared entry; Deno's source-adjacent `_test.ts` is the acceptable variant.
9. **Two service levels, one seam**: code-level services follow rule 6; app-level services are manifest data (Stead’s model).
10. **Condition for a small runtime divergence, package for a wholesale one**; never a runtime `if` inside a shared file.
11. **The umbrella barrel is consumer-only**; an application’s single declared entry _is_ its unit, which is why `@apps/<name>` is not a barrel.

### Amendments our packs need

- `declared-entry-points`: add the consumer-justified bound (its current text leaves the package total unbounded — the 135-entry surface passed because of that).
- `surface-changes-are-versioned`: scope to published packages; add the private-package gate (all 24 `@younna/*` packages are private, so the rule never fired).
- `condition-branch-agreement`: cite gritlint `source-resolution` as its checker — make it mechanical.
- `service-and-layer-boundaries`: add §7 “the Layer owns its infrastructure” and §8 “the Stack has one owner”.
- `single-namespace-barrel`: add the application clause (role entries or one root barrel, never a flat per-module map).
- New pack `application-topology`: rules 3, 4, 13, 14, 15, 17 — the half no existing pack covers.

### Verification

`verification: {passed: true}` recorded in `findings/cycle_010.json`. Structural check: 25/25 rules numbered 1–25, 25 of each of the four headings, 11 conflict rows, README index with gates, coverage table, limits. The brief’s Deliver line is satisfied.

---

## Research State

### Derived sub-question checklist (brief lists none; derived from A–F and the deliverable)

1. **A1** — package vs application vs app-template: what each may depend on; forbidden edges — _done. TanStack core/adapter (T1), Effect service/adapter (E5–E7), Stead app-as-package + shell-never-reaches-in (ST1–ST6), Rat Stack cartridge + codified forbidden edges (R2–R4, R12)._
2. **B1** — public-surface caps and the legitimate-subpath test — _done for all five sources. Settled: count caps are the wrong lever; lever = role-named entries + casing + null-blocked internals + barrel-ban inside the repo._
3. **B2** — runtime splits without internals (export conditions) — _done (TanStack `workerd`, Vitest `__vitest_source__`, Deno tiers, Effect module-per-runtime, Stead `. /node /react /feed /zero`)._
4. **C1** — where an interface/service/Layer belongs vs implementations — _done: Effect (port in core, Layer-only adapters, type-only interface imports) + Rat Stack `noCoreAdapters` (core bans HTTP clients/adapters; one subpath per vendor) + Stead (services as manifest data)._
5. **C2** — cross-library integration packages (`router-ssr-query-core`) — _done (T5)._
6. **D1** — test location and import discipline; contract tests; internals without exports — _done (TanStack, Vitest, Deno std, Effect, Stead e2e). Contract tests across packages remain the thinnest area; note it as a gap in the deliverable rather than inventing one._
7. **D2** — test tiers as a boundary (unit vs e2e enforced in lint) — _done (V11); Rat Stack’s fence runs check+test pre-commit (R10)._
8. **E1** — worker/SPA/Astro app composition; config and Layers only at the app edge; template deployable in isolation — _done: Stead (app package + one export + workspace template), Effect (Layer at the edge), Rat Stack (Layer carries resources, Stack owned by apps/infra, removal checklists)._
9. **E2** — Cloudflare-specific constraints — _TanStack `workerd` conditions, Vitest `path`→`pathe`, Deno browser marker, Effect zero-dep `sql-d1`/`sqlite-do`, Rat Stack Alchemy-in-Layer. Direct CF/Alchemy docs still worth one pass only if the deliverable needs them; the mechanism evidence is sufficient._
10. **F1** — mechanical checks — _five models: sherif+knip (TanStack), oxlint overrides + knip workflow (Vitest), custom Deno scripts, madge + custom oxlint plugin (Effect), the fence + known-limits table (Rat Stack). dependency-cruiser/publint/attw details are optional now._
11. **G** — synthesis: 15–25 ranked rules, conflicts, which side for Effect + Cloudflare — **done (cycles 008–010, `PACK.md`: 25 rules + 11 adjudications + README).**

### Deliverable plan — complete

1. ~~Rules 1–12~~ — done (cycle 008).
2. ~~Rules 13–25~~ — done (cycle 009).
3. ~~Conflicts, README, verification~~ — done (cycle 010); `verification.passed = true`.

### Uses of this research (how to consume the result)

- The pack is ready to split one-file-per-rule and enroll next to `compound-packs/package-topology` and `cell-architecture`; the amendments in Part 3 are the diff to those two packs.
- The first concrete jobs it implies for `younna-ai`: an oxlint boundary rule for packages↛workers (two violations today), a consumer-usage check (149 dead subpaths), an `api-extractor`/`publint` pack job (no pack check exists), and a private-package surface gate.

### Leads

- **Next:** deliverable part 3 — the cross-source conflicts table with a ruling for each (the `export *` conflict, the folder-mirror wildcard, barrel-vs-flat surface, lockstep-vs-independent versions, review-vs-mechanical gates, and Stead's app→app allowance), the pack README that indexes the 25 rules with their gates, and the verification line against the brief.
- Rules 1–25 live in `PACK.md`, ready to be split one-per-file when the pack is published.
- The strongest self-critique to include: our existing `declared-entry-points` allowed the 135-entry surface, and `surface-changes-are-versioned` never fired because our packages are private — the new pack must say what changes in the old rules, not only what to add.
- Template for the package rules: Effect's casing + `null` exports; Deno std's four checker scripts for the enforcement chapter.

### Weak spots

- Rat Stack's corpus is a website (now corroborated by its repo for rules R1–R3, R6, R7, R10); claims resting only on `/lore/*` pages (R4, R5, R8, R11) are `moderate`.
- The `younna-ai` 136 / 59 counts are now verified (cycle 006), including the 39%-unused measurement; cite cycle 006, not the brief, when using them.
- Contract testing across package boundaries (D1) remains the thinnest topic; the deliverable should mark it as a gap with a candidate rule, not invent evidence.
- `attw`/`publint` absence in TanStack query is still a negative claim from grepping scripts/workflows only.

### Dead ends

- None yet.
