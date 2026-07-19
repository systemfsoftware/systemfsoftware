---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
---

# Remove tsgo, update tsdown and oxlint to latest

## Goal Capsule

Remove Microsoft's `tsgo` Go-based TypeScript declaration generator from the monorepo's build pipeline, update `tsdown` to the latest release, and bump `oxlint` to its latest version. All 8 `tsdown.config.ts` files use `dts: { tsgo: { path: 'tsc' } }`; replace with `dts: true` so tsdown falls back to TypeScript 7's native `tsc` for declaration generation. Clean up the no-longer-needed `oxlint-tsgolint` devDependency.

**Execution profile:** refactor / configuration change. No behavioral change to any runtime code. All packages already have `"typescript": "^7"` in the pnpm catalog and `typescript@7.0.2` installed.

**Tail ownership:** after all units merge, confirm `pnpm check` passes and `repos/typescript-go/` (vendored tsgo source) is either removed or left for human disposal.

---

## Product Contract

### Summary

Microsoft's tsgo was a Go reimplementation of TypeScript's declaration generation, used via tsdown's `dts: { tsgo: { path: 'tsc' } }` option to produce `.d.ts` files faster than stock `tsc`. With TypeScript 7's `tsc` now sufficiently fast and the ecosystem converging on `isolatedDeclarations` + oxc-transform for speed, tsgo provides no remaining benefit. The dependency pulls in ~40MB of Go-native platform binaries (`@oxlint-tsgolint/*`) and a vendored `repos/typescript-go/` subtree.

We remove the config flag from all tsdown builds, drop `oxlint-tsgolint` from root devDependencies, update the tsdown dependency to the latest 0.22.x across every package, and bump `oxlint` from `^1.60.0` to `^1.74.0`.

### Requirements

| ID | Requirement                                                                          |
| -- | ------------------------------------------------------------------------------------ |
| R1 | Every `tsdown.config.ts` replaces `dts: { tsgo: { path: 'tsc' } }` with `dts: true`  |
| R2 | Root `devDependencies` no longer references `oxlint-tsgolint`                        |
| R3 | `pnpm-workspace.yaml` no longer has `@oxlint-tsgolint` in `minimumReleaseAgeExclude` |
| R4 | All packages pin a consistent tsdown version, resolving to `^0.22.12`                |
| R5 | Lockfile is regenerated so no stale `@oxlint-tsgolint` platform packages remain      |
| R6 | `pnpm check` (install → lint → typecheck → test) passes after all changes            |
| R7 | Root `oxlint` devDependency is updated to `^1.74.0`                                  |

### Scope Boundaries

**In scope:**

- All 8 tsdown configs across published and private packages
- Root package.json, pnpm-workspace.yaml, lockfile
- Root package.json `oxlint` devDependency bumped to `^1.74.0`

**Deferred:**

- The vendored `repos/typescript-go/` subtree is locked per AGENTS.md; removal is a human action outside this plan's scope. A follow-up `rm -rf repos/typescript-go && git rm repos/typescript-go` would be sufficient.
- `isolatedDeclarations` is intentionally NOT being enabled (prohibited by AGENTS.md §Stack — incompatible with idiomatic Effect-TS patterns). tsdown falls back to `tsc` for declaration generation when `isolatedDeclarations` is off.

---

## Planning Contract

### Key Technical Decisions

**KTD-1: Replace tsgo with bare `dts: true`.**

- `dts: { tsgo: { path: 'tsc' } }` explicitly routes declaration gen through tsgo (Go-based TypeScript compiler) with type resolution via tsc.
- `dts: true` uses tsdown's default declaration pipeline: when `isolatedDeclarations` is not enabled (our case), it falls back to the standard TypeScript compiler (`tsc`).
- Since TypeScript 7's `tsc` is already installed and fast enough, and `isolatedDeclarations` is off-limits, `dts: true` is equivalent in behavior and faster in maintenance surface.

**KTD-2: Standardise tsdown to `^0.22.12`.**

- Currently split across `^0.22`, `^0.22.3`, `^0.22.7` — all resolve within 0.22.x. Bumping the specifiers consistently makes the intention explicit and avoids accidental pinning differences.
- tsdown 0.22.12 peer-deps already include `"typescript": "^5.0.0 || ^6.0.0 || ^7.0.0"` — compatible.

**KTD-3: Remove `oxlint-tsgolint` entirely.**

- This is an optional oxlint plugin that adds tsgo-specific lint rules. With no tsgo configs left, the plugin provides no value. It's only referenced in root `devDependencies`; no oxlint config file imports it or its rules.
- Removing it also eliminates the per-platform `@oxlint-tsgolint/*` native binary downloads (7 platform packages × ~5MB each).

**KTD-4: Add oxlint to pnpm catalog and ref via `catalog:`.**

- Follow the existing `typescript: ^7` catalog pattern: add `oxlint: ^1.74.0` to `pnpm-workspace.yaml`'s `catalog:` section, and switch root `devDependencies` from `"oxlint": "^1.60.0"` to `"oxlint": "catalog:"`.
- This keeps version management centralised and consistent with the rest of the monorepo.

### Assumptions

- tsdown's `dts: true` with no `isolatedDeclarations` produces declaration files equivalent in correctness to the previous tsgo pipeline. Both ultimately delegate type resolution to tsc's declaration emitter — tsgo was the generator frontend, not a different type checker.
- The `outExtensions: () => ({ js: '.mjs', dts: '.d.ts' })` config in `effect-daemon-spec` interacts identically with the new dts pipeline (it only changes output file extension names).

### Sequencing

The implementation has a clear dependency chain: config changes → dependency removal → lockfile update. Each unit is self-contained and committable.

---

## Implementation Units

### U1. Update all tsdown.config.ts files

**Goal:** Replace `dts: { tsgo: { path: 'tsc' } }` with `dts: true` in every tsdown config.

**Requirements:** R1

**Files:**

- `packages/effect-daemon-spec/tsdown.config.ts`
- `packages/effect-gherkin-spec/tsdown.config.ts`
- `packages/effect-schema-extensions/tsdown.config.ts`
- `packages/effect-schema-law/tsdown.config.ts`
- `packages/oxlint-plugin/tsdown.config.ts`
- `packages/rx-effect/tsdown.config.ts`
- `packages/stryker-js/core/tsdown.config.ts`
- `packages/stryker-plugins/tsdown.config.ts`

**Approach:** Each file has exactly one line `dts: { tsgo: { path: 'tsc' } },` — replace with `dts: true,`. No other change to the config structure.

**Test scenarios:**

- Happy path: each config parses correctly — `tsdown` build runs without error for each package
- Edge case: the `effect-daemon-spec` config has `outExtensions` alongside `dts` — confirm combining `dts: true` with `outExtensions` still mints `.d.ts` extension names correctly

**Verification:** `pnpm build` succeeds for each package.

### U2. Clean up dependencies and bump tsdown + oxlint

**Goal:** Remove tsgolint references, standardise tsdown version specs, and bump oxlint to latest.

**Requirements:** R2, R3, R4, R7

**Files:**

- `pnpm-workspace.yaml` — add `oxlint: ^1.74.0` under `catalog:`; remove `- "@oxlint-tsgolint"` from `minimumReleaseAgeExclude`
- `package.json` (root) — remove `"oxlint-tsgolint": "latest"` from `devDependencies`; change `"oxlint": "^1.60.0"` → `"oxlint": "catalog:"`
- `packages/effect-daemon-spec/package.json` — `"tsdown": "^0.22.3"` → `"tsdown": "^0.22.12"`
- `packages/effect-gherkin-spec/package.json` — `"tsdown": "^0.22.3"` → `"tsdown": "^0.22.12"`
- `packages/effect-schema-extensions/package.json` — `"tsdown": "^0.22.3"` → `"tsdown": "^0.22.12"`
- `packages/effect-schema-law/package.json` — `"tsdown": "^0.22.3"` → `"tsdown": "^0.22.12"`
- `packages/oxlint-plugin/package.json` — `"tsdown": "^0.22.3"` → `"tsdown": "^0.22.12"`
- `packages/rx-effect/package.json` — `"tsdown": "^0.22.3"` → `"tsdown": "^0.22.12"`
- `packages/stryker-js/core/package.json` — `"tsdown": "^0.22"` → `"tsdown": "^0.22.12"`
- `packages/stryker-js/typescript-checker/package.json` — `"tsdown": "^0.22.7"` → `"tsdown": "^0.22.12"`
- `packages/stryker-plugins/package.json` — `"tsdown": "^0.22.3"` → `"tsdown": "^0.22.12"`

**Approach:** Straight dependency cleanup. Remove the tsgolint references, bump all tsdown specs to `^0.22.12`, bump oxlint to `^1.74.0`, then run `pnpm install` to update the lockfile and prune stale entries.

**Test scenarios:** None behavioral — this is pure config and dependency management. The lockfile update is verified in U3.

**Verification:** `pnpm install --frozen-lockfile` succeeds after regenerating the lockfile.

### U3. Regenerate lockfile and verify

**Requirements:** R5, R6, R7

**Files:**

- `pnpm-lock.yaml` (auto-updated)

**Approach:**

1. `pnpm install` — regenerates lockfile, prunes `@oxlint-tsgolint` platform packages, resolves tsdown to 0.22.12
2. `pnpm check` — runs frozen-lockfile install → lint → typecheck → test

**Test expectation: none** — this is lockfile generation and CI gating.

**Verification:** `grep oxlint-tsgolint pnpm-lock.yaml` returns nothing. `pnpm check` exits 0.

---

## Verification Contract

```bash
# After all units:
pnpm check    # frozen-lockfile install → lint → typecheck → test (concurrent)
```

Confirm zero `@oxlint-tsgolint` references remain in the lockfile:

```bash
grep -c oxlint-tsgolint pnpm-lock.yaml
# expected: 0
```

For `effect-daemon-spec` specifically, the API contract must remain stable:

```bash
pnpm --filter @systemfsoftware/effect-daemon-spec api:check
```

---

## Definition of Done

1. All 8 tsdown config files use `dts: true` instead of `dts: { tsgo: { path: 'tsc' } }`.
2. Root `package.json` no longer lists `oxlint-tsgolint`.
3. `pnpm-workspace.yaml` no longer excludes `@oxlint-tsgolint` from minimum release age.
4. Every package's tsdown version specifier is `^0.22.12`.
5. `pnpm-workspace.yaml` has `oxlint: ^1.74.0` in catalog; root `oxlint` devDep uses `"catalog:"`.
6. `pnpm check` passes (frozen-lockfile install → lint → typecheck → test).
7. `effect-daemon-spec` API surface is unchanged (`api:check` passes).
8. `pnpm-lock.yaml` contains zero `oxlint-tsgolint` entries.
