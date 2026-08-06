---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
---

# Finish the TypeScript 7 migration: move attw core onto the typescript 6 JS bridge

## Goal Capsule

The repo's TypeScript 7 migration is committed: `pnpm-workspace.yaml` catalogs `typescript: ^7`, and every workspace `typescript` dependency resolves `typescript@7.0.2` (native Go compiler, Effect Language Service patched via `prepare` → `effect-tsgo patch`). One package cannot run on 7: `@systemfsoftware/arethetypeswrong-core` depends at runtime on the TypeScript JS compiler API (`createProgram`, `resolveModuleName`, `createModuleResolutionCache`, `ts-expose-internals` internals), which the native `typescript@7.0.2` package does not export (main entry is `./lib/version.cjs` — verified by direct probe).

The gap is closed with the **typescript 6 JS bridge**: `typescript@6.0.x` is the last TypeScript line with the full JS compiler API, and — verified this session — ships every internal attw core uses (`getTemporaryModuleResolutionState`, `getPackageScopeForPath`, `createModeAwareCache`, `changesAffectModuleResolution`). attw core migrates 5.9.3 → 6.0.3 via a named `attw` catalog, its tests pass 58/58, and the only snapshot churn is the compiler-version string resolution traces embed. Everything else stays on `typescript@7.0.2`.

This plan migrates attw core onto the 6 bridge, regenerates the two affected snapshots, guards 7+ majors from dependabot, closes the open dependabot PR (#36) that embodied the breaking 7.0.2 bump, records the decision, and proves the result with fresh (cache-bypassed) verification.

**Execution profile:** dependency bump (catalog + lockfile) + configuration + documentation + snapshot regeneration. No behavioral change to any package output (the two regenerated snapshots differ only in the embedded compiler version string).

**Tail ownership:** after all units merge, `pnpm check` passes; attw core runs on `typescript@6.0.3` (catalog:attw); everything else on `typescript@7.0.2`; dependabot no longer proposes `typescript` major bumps; PR #36 is closed.

## Product Contract

### Summary

"Fully on TypeScript 7" has a hard architectural ceiling for exactly one package: attw core's analysis engine is built on the JS compiler API that TypeScript 7 (native, Go-based) removed. The correct end state is attw on **typescript 6**, the bridge release that keeps the full compiler API on the path to 7. This is not a compromise — upstream `arethetypeswrong` pins `typescript@5.6.1-rc` for the same fidelity reason, and 6.0.3 is strictly closer to 7 while remaining fully compatible with attw's internals usage (verified: typecheck clean, 58/58 tests pass, both snapshot diffs are pure compiler-version strings).

The work: (1) add a named `attw` catalog (`typescript: ^6.0.3`) and point attw core at it, (2) regenerate the two snapshot fixtures whose resolution traces embed the compiler version, (3) stop dependabot from proposing the breaking 7.x major, (4) close the open PR that embodies it, (5) record the decision, (6) re-verify the whole gate fresh.

### Problem Frame

- Dependabot PR #36 (`build(deps): bump typescript from 5.9.3 to 7.0.2`, commit `77a5cf7202`) changes attw core's `typescript` to `^7.0.2`. It is open against base `main`, and would break attw core (typecheck errors against the 7.x d.ts surface, runtime crash on `ts.createProgram` being undefined).
- `typescript@7.0.2` (verified this session): `exports["."]` is `./lib/version.cjs` — only `version`/`versionMajorMinor`; the `unstable/*` exports are an LSP-style snapshot API (`API`, `Snapshot`, `Project`, `Program`, `Checker`) with no `CompilerHost`, no `resolveModuleName`, no module-resolution cache, no trace resolution, no `Program.resolvedModules`. attw's `src/internal/multiCompilerHost.ts` (and `getEntrypointInfo.ts`) drive those deep internals; 10 other files under `src/internal` import the JS API surface broadly — all unavailable in 7.
- `typescript@6.0.3` (verified this session, scratch install): exports the full JS compiler API **including** every internal attw needs — `createProgram`, `resolveModuleName`, `createModuleResolutionCache`, `getImpliedNodeFormatForFile`, `getTemporaryModuleResolutionState`, `getPackageScopeForPath`, `createModeAwareCache`, `changesAffectModuleResolution`, `getModeForUsageLocation`, `getAnyExtensionFromPath`, `Extension`, `ModuleDetectionKind` — all present at runtime.
- `ts-expose-internals` (devDep `^5.6.0`, only in attw core/cli) has no 6.x or 7.x release — it tops out at 5.6.3. Its type augmentation typechecks cleanly against 6.0.3 (verified: attw core `tsc --noEmit` exits 0). It exists to expose JS-compiler internals, so the constraint is stable: no ts-expose-internals beyond 5.6.3 implies no attw-on-7 path via internals.
- The current dependabot config does NOT stop `typescript` major proposals: PR #36 was created against current `main` under the current config, proving majors still surface (the `major-updates` group excludes `typescript` and the only typescript group is minor+patch, but exclusion controls batching, not creation). The `ignore` rule added in U3 is the mechanism that actually stops future proposals.

### Requirements

| ID | Requirement                                                                                                                                                               |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 | attw core's runtime `typescript` moves to the 6 bridge: named `attw` catalog with `typescript: ^6.0.3`, referenced as `catalog:attw`, resolving 6.0.3                     |
| R2 | Every other workspace `typescript` dependency stays on the catalog `^7` → `7.0.2` — verified, no change                                                                   |
| R3 | attw core typechecks clean on 6.0.3 and its test suite passes 58/58; the two snapshot fixtures embedding the compiler version are regenerated (version-string-only diffs) |
| R4 | Dependabot never proposes a `typescript` major-version update for this repo's npm manifests (manual, deliberate migrations only)                                          |
| R5 | The open dependabot PR #36 is closed as superseded                                                                                                                        |
| R6 | The decision (6 bridge, why not 7, the catalog arrangement, the dependabot guard) is documented in the attw README and `docs/solutions/tooling-decisions/`                |
| R7 | `pnpm check` exits 0 after all changes, with typecheck evidence produced fresh (no turbo cache)                                                                           |

### Scope Boundaries

**In scope:**

- `pnpm-workspace.yaml` (new `attw` catalog)
- `packages/arethetypeswrong/core/package.json` (`typescript` → `catalog:attw`), `pnpm-lock.yaml`
- `packages/arethetypeswrong/core/test/snapshots/moment@2.29.1.tgz.json`, `.../react@18.2.0.tgz.json` (regenerated)
- `.github/dependabot.yml` (editable — only `.github/workflows/` is Locked)
- `packages/arethetypeswrong/core/README.md`, `docs/solutions/tooling-decisions/` (new entry)
- Verification runs; closing PR #36

**Deferred / out of scope:**

- Migrating attw core to the tsgo `unstable/*` API — infeasible without reimplementing TypeScript module resolution and changing analysis fidelity; explicitly rejected (see KTD-1). Upstream `arethetypeswrong.github.io` has not migrated either (pins `typescript@5.6.1-rc`).
- Moving attw core to `typescript@7` via a bridged types entry — no ts-expose-internals beyond 5.6.3 exists, and 7 has no JS API surface to augment (KTD-1).
- `repos/` vendored trees (read-only; `repos/oh-my-pi` already targets `^7.0.2`).
- External peers that resolve `typescript@5.9.3` for their own purposes (`@microsoft/api-extractor`, `tsdown`/`rolldown-plugin-dts`, `tstyche`, `tsconfck` via `vite-tsconfig-paths`) — third-party tools with their own JS-API needs; not workspace code.
- Enabling `isolatedDeclarations` (prohibited by AGENTS.md REPO-S1).

### Outstanding Questions

None. Blocking decisions are resolved in KTD-1..KTD-3.

## Planning Contract

### Key Technical Decisions

**KTD-1: attw core moves to the typescript 6 JS bridge — the last line with the full compiler API. It cannot move to 7.**

Evidence (all observed this session):

- `typescript@6.0.3` runtime probe (scratch install): `createProgram`, `resolveModuleName`, `createModuleResolutionCache`, `getImpliedNodeFormatForFile`, `getTemporaryModuleResolutionState`, `getPackageScopeForPath`, `createModeAwareCache`, `changesAffectModuleResolution`, `getModeForUsageLocation`, `getAnyExtensionFromPath`, `Extension`, `ModuleDetectionKind` — all present. The bridge keeps the API.
- `node_modules/typescript/package.json` (`7.0.2`): `"exports": { ".": "./lib/version.cjs", "./unstable/...": ... }`; `require('typescript')` returns only `{ version, versionMajorMinor }`.
- The `unstable/sync` API (`dist/api/sync/api.d.ts`) exposes `API`, `Snapshot`, `Project`, `Program`, `Checker` — a read-only LSP-style client. `Program` has `getCompilerOptions`/`getSourceFile`/`getSourceFileMetadata`; `SourceFileMetadata` is `{ isDefaultLibrary, isFromExternalLibrary, packageJsonType, packageJsonDirectory, impliedNodeFormat }`. No resolution results, no traces.
- `packages/arethetypeswrong/core/src/internal/multiCompilerHost.ts:54-294` builds a custom `ts.CompilerHost` and calls `ts.createModuleResolutionCache`, `ts.resolveModuleName`, `ts.createProgram`, `ts.getImpliedNodeFormatForFile`, `ts.getPackageScopeForPath`, `ts.getTemporaryModuleResolutionState`, `ts.createModeAwareCache`, `program.resolvedModules` — deep internals unavailable in 7 (several only via `ts-expose-internals`, which tops out at 5.6.3).
- Migration verified in-repo: attw core on `typescript@6.0.3` typechecks clean (`tsc --noEmit`, with ts-expose-internals@5.6.3 augmenting) and passes 58/58 tests. The two snapshot diffs (`moment@2.29.1`, `react@18.2.0`) are exclusively the embedded compiler-version string in resolution traces (`5.9.3` → `6.0.3`, `5.9` → `6.0`).
- Upstream pin: `@arethetypeswrong/core@0.18.5` → `"typescript": "5.6.1-rc"`, `"ts-expose-internals": "5.6.1-rc"` — the project pins a specific JS-compiler version on purpose.
- Disconfirming evidence sought: the tsgo `Program`/`Checker` surface exposes no resolution results or traces, so a hybrid path (tsgo diagnostics + a standalone resolver) cannot reproduce the per-mode resolution behavior and traces the checks report on. attw's existing `@loaderkit/resolve` dependency serves a narrow internal path (`src/internal/esm/resolve.ts`), not the compiler-resolution semantics the analysis needs.

Consequence: the dependabot bump to 7 is not a routine upgrade; it is a rewrite with fidelity loss. "Without breaking" forbids it. The 6 bridge is the honest maximum.

**KTD-2: The bridge is a named catalog, per the repo's own convention.**

The monorepo documents that distinct dependency axes get named catalogs (see `docs/solutions/tooling-decisions/pnpm-catalogs-for-monorepo-dependency-management.md`; existing named catalogs: `oxlint`, `stryker`). Two majors of the same dependency in one catalog is the anti-pattern the convention exists to prevent, so `typescript: ^6.0.3` goes in a new `attw` catalog:

```yaml
catalogs:
  attw:
    typescript: ^6.0.3
```

and attw core references `catalog:attw`. Dependabot's catalog support means minor/patch updates still flow through the existing `typescript-minor-patch` group and update the `attw` catalog entry. The default `typescript: ^7` catalog entry stays untouched.

**KTD-3: Guard 7+ majors with a dependabot `ignore`, not a second per-directory updates entry.**

The repo's `dependabot-config` skill rules (D1, END1) forbid listing individual workspace subdirectories (breaks root-lockfile updates, issue #11135; pnpm workspaces are auto-discovered). So the guard is an `ignore` on the root npm updates entry:

```yaml
ignore:
  - dependency-name: "typescript"
    update-types: ["version-update:semver-major"]
```

This only stops major proposals; `typescript` minor/patch updates keep flowing. It matches the repo's de-facto policy (typescript majors are deliberate migrations — the catalog `^7` was itself a manual edit). It does NOT by itself close the already-open PR #36; that PR is closed deterministically by the manual `gh pr close` in U3, and the ignore only prevents dependabot from recreating it once merged.

**KTD-4: Verification is the deliverable's core; cache-bypass the typecheck evidence.**

The migration must be proven current-run and cache-free. `turbo typecheck --force` re-runs every package's `tsc --noEmit` regardless of cache (the `typecheck` task is `cache: false` with `outputLogs: errors-only` — silence on success), and `pnpm check` re-runs the full gate after the last edit (REPO-A2/A3).

### Assumptions

- `@effect/tsgo` (`^0.24.3`, root devDep) continues to patch the native binary via `prepare` (`effect-tsgo patch`) — verified working in the baseline log ("Patched Effect Language Service binary ... Verification succeeded").
- Dependabot's `ignore.update-types` accepts the `version-update:semver-major` form (the documented ignore value format, distinct from group `update-types`).
- Closing PR #36 is routine hygiene (non-destructive; branch remains; reopenable) and does not require the REPO-P1 approval gate.
- `ts-expose-internals@5.6.3`'s type augmentation remains compatible with future 6.x patch/minor releases; if a 6.x minor breaks the augmentation, the fix is pinned by a narrow range, not a migration.

### Sequencing

U1 and U2 are the migration core (catalog + package.json + lockfile + snapshots). U3 (dependabot + PR close) is independent of U1/U2. U4 (verification) runs after U1-U3. U5 (docs) references the final state (catalog, guard) — written after U1-U3 land, committed in the same batch so no documentation asserts a config state that does not exist. All units commit as one change set.

## Implementation Units

### U1. Add the `attw` catalog and point attw core at it

**Goal:** attw core's runtime `typescript` resolves to the 6 bridge via a named catalog.

**Requirements:** R1, R2

**Files:**

- `pnpm-workspace.yaml` — new `attw` catalog (comment explains the bridge constraint and points at the docs/solutions entry)
- `packages/arethetypeswrong/core/package.json` — `"typescript": "^5.6.0"` → `"catalog:attw"`
- `pnpm-lock.yaml` (regenerated by `pnpm install --no-frozen-lockfile`)

**Approach:**

1. Add to `pnpm-workspace.yaml` `catalogs:`:

```yaml
attw:
  # arethetypeswrong core runs the JS compiler bridge (typescript@6).
  # typescript@7 is the native Go compiler with no JS API; see
  # docs/solutions/tooling-decisions/arethetypeswrong-core-requires-js-typescript-api.md
  typescript: ^6.0.3
```

2. Change attw core's dependency to `catalog:attw`. `ts-expose-internals` stays `^5.6.0` (5.6.3 — the newest that exists; its augmentation typechecks cleanly against 6.0.3).
3. `pnpm install --no-frozen-lockfile` (updates the lockfile; `prepare` re-patches the 7.0.2 binary — expected).

**Test scenarios:** Resolution check — `pnpm --filter @systemfsoftware/arethetypeswrong-core exec node -p "require('typescript/package.json').version"` prints `6.0.3`; root still resolves 7.0.2.

**Verification:** `node -p` probes above; `pnpm why -r typescript` shows workspace deps on 7.0.2 except attw core on 6.0.3.

### U2. Regenerate the version-string snapshot fixtures

**Goal:** The snapshot suite passes on 6.0.3.

**Requirements:** R3

**Files:**

- `packages/arethetypeswrong/core/test/snapshots/moment@2.29.1.tgz.json` (regenerated: `5.9.3` → `6.0.3` in 4 trace lines)
- `packages/arethetypeswrong/core/test/snapshots/react@18.2.0.tgz.json` (regenerated: `5.9` → `6.0` in 3 trace lines)

**Approach:** Run the snapshot test with regeneration enabled, filtered per fixture:

1. `UPDATE_SNAPSHOTS=1 TEST_FILTER=moment pnpm --filter @systemfsoftware/arethetypeswrong-core exec vitest run test/snapshots.test.ts`
2. `UPDATE_SNAPSHOTS=1 TEST_FILTER=react pnpm --filter @systemfsoftware/arethetypeswrong-core exec vitest run test/snapshots.test.ts`

Then verify the regenerated diffs contain ONLY the compiler-version string change (`git diff`), then run the full suite: `pnpm --filter @systemfsoftware/arethetypeswrong-core test` → 58/58 pass.

**Test scenarios:** The suite IS the test. The diff review proves no behavior change.

**Verification:** `git diff` on the two snapshot files shows only version-string lines; full suite exits 0.

### U3. Stop dependabot from proposing typescript majors; retire PR #36

**Goal:** The recurring semver-major `typescript` proposal (which would break attw core) never auto-lands again, and the open PR that embodies it is closed.

**Requirements:** R4, R5

**Files:**

- `.github/dependabot.yml` — in the `npm` updates entry (the only npm entry, `directory: "/"`), add an `ignore` block with a comment explaining why typescript majors are manual migrations. Do NOT add a second npm updates entry for `packages/arethetypeswrong/core` (skill rules D1/END1).
- PR #36 (closed via `gh pr close 36 --comment "Superseded by this change set — typescript majors are manual migrations (attw core requires the JS compiler API)."`)

**Approach:**

1. Edit `.github/dependabot.yml`:

```yaml
ignore:
  # typescript majors are deliberate migrations, not routine bumps:
  # typescript@7 (native) has no JS compiler API, so
  # @systemfsoftware/arethetypeswrong-core runs the typescript@6 bridge
  # (catalog:attw); a 7.x major would break it.
  - dependency-name: "typescript"
    update-types: ["version-update:semver-major"]
```

2. Pre-check `gh pr view 36 --json state` (must be open). Close it with the comment above. The durable guard is the merged ignore: dependabot reads `.github/dependabot.yml` from the default branch, so until this change merges, a dependabot run could in principle recreate the PR — the close is best-effort hygiene, idempotent, and reopenable; the ignore is what prevents recurrence.

**Test scenarios:** None behavioral — config change. Guard behavior is verified by reading the rendered config (dependabot `ignore` semantics are exercised by its next run).

**Verification:** `gh pr view 36 --json state` returns `closed`; the `ignore` block lists `typescript` with `version-update:semver-major`; no second npm updates entry exists.

### U4. Prove the repo is fully on the TS7 line (fresh evidence)

**Goal:** Current-run, cache-bypassed evidence that every workspace package typechecks — the toolchain on `typescript@7.0.2`, attw core on the 6 bridge — and the full gate is green.

**Requirements:** R1-R3, R7

**Files:** none (verification only)

**Approach:**

1. `pnpm turbo typecheck --force` — re-runs every package's `tsc --noEmit` ignoring turbo cache (typecheck is `cache: false`; success is silent, `errors-only`). Record the run summary as evidence.
2. `pnpm check` — the full gate (frozen-lockfile install → format:check → lint → typecheck → test → attw → api:check → check:exports → check:mutate-scope → check:lint-coverage → check:no-hand-rolled-jsonc → check:publish-config → check:runtime-deps → check:project-references). Must exit 0 after the last edit.
3. Audit (one grep + one `pnpm why`):
   - `grep -rnE "from 'typescript'|require\('typescript'\)|import\('typescript'\)" packages omp scripts` → the only value import of `typescript` (static, CJS, or dynamic) is under `packages/arethetypeswrong/` (expected — the 6-bridge package).
   - `pnpm why -r typescript` → workspace-owned `typescript` deps resolve `7.0.2`; the only workspace manifest on a different major is `@systemfsoftware/arethetypeswrong-core` (6.0.3 via `catalog:attw`, deliberate, documented in U5).

**Test scenarios:** The audit IS the test — it must show zero accidental consumers off the TS7 line beyond the documented bridge.

**Verification:** `pnpm check` exits 0; `--force` typecheck run summary shows 0 failures; audit output matches the expectation above.

### U5. Document the bridge decision

**Goal:** A future reader — of the attw README, of `pnpm-workspace.yaml`, or of a dependabot review — can see why attw runs typescript 6 and why 7 is the ceiling, without re-deriving the fact.

**Requirements:** R6

**Files:**

- `packages/arethetypeswrong/core/README.md` — rewrite the `## TypeScript version pin` section to state the 6-bridge position: `catalog:attw` (`^6.0.3`), why not 7 (native, no JS API, no ts-expose-internals past 5.6.3), why 6 is the ceiling (bridge keeps the full compiler API), the snapshot-version-string note, the dependabot guard.
- `docs/solutions/tooling-decisions/arethetypeswrong-core-requires-js-typescript-api.md` — rewrite the ledger entry (frontmatter + sections per the category's format) to record the 6-bridge decision, the two-catalog arrangement, the probe/migration evidence, and the guard.

Dedup rule between the two: the README is the normative statement of the current pin; the ledger entry is the durable record of the decision and its evidence. Each cross-references the other, so a future TS8 bump or a tsgo migration attempt touches both in one pass and neither silently drifts.

**Test scenarios:** None — documentation.

**Verification:** Both files pass `dprint check`; frontmatter matches the category's existing entries; the README references `catalog:attw` exactly as configured.

## Verification Contract

```bash
# After all units (must be this session, after the last edit):
pnpm turbo typecheck --force     # cache-bypassed typecheck, all green
pnpm check                       # full gate, exit 0
node -p "require('typescript/package.json').version"   # root: 7.0.2
pnpm --filter @systemfsoftware/arethetypeswrong-core exec node -p "require('typescript/package.json').version"  # attw: 6.0.3
pnpm why -r typescript           # workspace deps on 7.0.2; only attw core on 6.0.3 (bridge)
gh pr view 36 --json state       # closed
```

No pure-core code files change, so the per-package mutation gate (AGENTS.md: 100% on changed pure-core files) has no changed targets; the `check:mutate-scope` gate inside `pnpm check` still runs.

## Definition of Done

1. `pnpm-workspace.yaml` carries an `attw` catalog (`typescript: ^6.0.3`); attw core references `catalog:attw` and resolves 6.0.3 (U1).
2. attw core typechecks clean and its suite passes 58/58; the two regenerated snapshots differ from before only in the embedded compiler-version string (U2).
3. `.github/dependabot.yml` ignores `typescript` major updates for the npm entry, with a comment; no per-directory updates entries added (U3).
4. PR #36 is closed (U3).
5. Fresh evidence recorded: `pnpm turbo typecheck --force` passes and `pnpm check` exits 0 in this session after the last edit (U4).
6. Audit confirms the only workspace `typescript` consumer off 7.0.2 is attw core on the 6 bridge, deliberately (U4).
7. README + `docs/solutions/tooling-decisions/` entry document the bridge and pass `dprint check` (U5).
8. No leftover experimental/dead-end code in the diff; working tree clean after commit.
