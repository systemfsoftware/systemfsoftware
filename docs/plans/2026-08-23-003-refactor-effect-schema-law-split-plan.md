---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
created: 2026-08-23
revised: 2026-08-23
type: refactor
depth: standard
---

# refactor: one law package with two declared entries, and one Vite plugin per emitted concern

## Summary

`@systemfsoftware/effect-schema-law` carried four concerns behind one entry point, so installing it to law-test a schema also pulled the refusal/adequacy machinery and a recursive-union codec constructor. The first attempt at this (PR #246, on this branch) split it into three published packages. That is now reversed: the concerns become **declared entries on one package** where their peer sets agree, and stay **separate packages** only where the peer sets genuinely differ.

The Vite plugin's obligation-coverage assertion, which PR #246 made opt-in through a `refutationCoverage` boolean, becomes a **second plugin package**. The boolean is deleted.

**This revision supersedes the plan's original KTD1–KTD3.** Those recorded a three-package split and a boolean-gated plugin; both are replaced below. The superseded shape is what currently sits on the branch, so most source moves once more.

## Problem Frame

A consumer installs `@systemfsoftware/effect-schema-law` for [the Rule of Schemas](https://www.effect.website/docs/v3/schema/introduction#the-rule-of-schemas) — encode a value, decode it, get the original back — and receives three concerns they did not ask for. The published surface is sixteen names for one law pair.

Two facts settle how to divide it, and they point in different directions:

1. **`law` and `refutation` have byte-identical peer sets** — `@effect/vitest`, `effect`, `vitest`. A package boundary between them buys nothing a declared entry does not already buy: module resolution is per-specifier, so importing `.` never evaluates `./refutation`.
2. **`bounded-union` peers on `effect` alone.** Peers are declared per package and a subpath cannot chunk them, so folding a runtime codec into a test-helper package forces a test runner onto every consumer whose production schema is built from that codec.

## Requirements

- **R1** — `@systemfsoftware/effect-schema-law` declares exactly two consumer-reachable entries: `.` exposing `ruleOfSchemas`, and `./refutation` exposing the refusal/adequacy surface. No other path in the package resolves.
- **R2** — `@systemfsoftware/effect-schema-bounded-union` stays a separate published package whose peer set remains `effect` alone.
- **R3** — Two Vite plugin packages exist, one per emitted concern. Neither accepts a coverage flag; the `refutationCoverage` option does not exist.
- **R4** — A consumer wanting only round-trip laws resolves no refutation module and installs no refutation package. The generated suite names no refutation specifier.
- **R5** — All ten in-repo plugin consumers keep working. The five with live obligations keep their coverage assertion by naming the second plugin; the five with none name only the first.
- **R6** — Nothing published is removed. `@systemfsoftware/effect-schema-vite` (1.5.4) survives as the laws plugin.

## Key Technical Decisions

**KTD1. One law package, two declared entries.** _(session-settled: user-directed — chosen over three separate published packages: the peer sets of `law` and `refutation` are identical, so the extra package boundary bought nothing, and subpath entries are the sanctioned chunking device.)_ Governs R1, R4.

The wiki's `declared-entry-points-only` (R1) puts the subpath set in the author's hands, "derived from chunking … never from the folder tree," and `name-set-span-budget` (R11) names subpath entries as _the_ device for a surface too large for one entry — "never by flat accumulation." Node's `exports` map makes every undeclared path throw `ERR_PACKAGE_PATH_NOT_EXPORTED`, so the two entries are the whole reachable surface.

**KTD2. `boundedUnion` keeps its own package.** _(session-settled: user-approved — chosen over a third `./bounded-union` entry on the law package: peers are per-package and a subpath cannot chunk them.)_ Governs R2.

Measured from the manifests: `bounded-union` peers on `effect`; `law` peers on `@effect/vitest`, `effect`, `vitest`. A third entry would hand every runtime consumer of the codec a test runner as a required peer — the exact complaint that started this work. The alternative (merge, then mark the test peers `optional`) was rejected because it softens the law entry's own real requirement into a runtime `MODULE_NOT_FOUND` during someone's test run instead of an install-time peer warning.

**KTD3. Two plugin packages, no boolean.** _(session-settled: user-directed — chosen over one plugin package carrying a `refutationCoverage` option, and over one plugin package with two subpaths.)_ Governs R3, R5.

A plugin's selection should be explicit and manifest-declared; the consumer composes what they want in their own `plugins: []` array. A boolean makes one plugin mean two things and makes its default a silent policy. Two packages also let each declare only the peers its own emitted code needs.

**KTD4. `effect-schema-vite` becomes the laws plugin; nothing published is deleted.** _(derived, not session-settled.)_ Governs R6.

It sits at 1.5.4 — past 1.0 — so removing it is a breaking removal of a published package with adopter blast radius, and this layout does not require it. The coverage plugin is a debut at 0.1.0.

**KTD5. Multi-entry mechanics follow `effect-schema-extensions`.** _(fact, not preference.)_

That package already ships two entries: a multi-key `entry` in `tsdown.config.ts`, a `typesMap` per subpath, `customExports: injectTypes`, one `api-extractor run` per entry with a per-entry config, and one `etc/<name>.api.md` per entry. The `exports` map stays generated, which `REPO-S4` requires.

## Output Structure

```
packages/core/effect/schema/
  law/                     # two entries: . and ./refutation
    src/mod.ts             #   -> ruleOfSchemas
    src/refutation/mod.ts  #   -> refutes, scanObligations, ...
    etc/effect-schema-law.api.md
    etc/refutation.api.md
  bounded-union/           # unchanged from the branch: its own package
  vite/                    # laws plugin, no coverage flag
  refutation-vite/         # NEW: coverage plugin
  refutation/              # DELETED (folded into law/src/refutation/)
```

## Implementation Units

### U1. Fold the refutation sources into the law package as a second entry

- **Goal** — `@systemfsoftware/effect-schema-law` builds and publishes two entries.
- **Requirements** — R1, R4; KTD1, KTD5.
- **Files** — move `packages/core/effect/schema/refutation/src/{Refutation,Refutes,Weaken}.ts` to `packages/core/effect/schema/law/src/refutation/`; create `law/src/refutation/mod.ts` from the deleted package's barrel; modify `law/tsdown.config.ts`, `law/package.json` (description, keywords, no hand-edited `exports`), add `law/api-extractor.refutation.json` and `law/tsconfig.api-refutation.json`, generate `law/etc/refutation.api.md`.
- **Approach** — copy the `entry`/`typesMap`/`customExports` shape from `extensions/tsdown.config.ts` verbatim, substituting `refutation` for `hex-schema`. Keep `law/src/mod.ts` as the single-line barrel it is now. The three moved modules keep their `/// <reference types="vitest/import-meta" />` lines — one per file that reads `import.meta.vitest`, which is what stopped this breaking when `BoundedUnion.ts` moved out.
- **Test scenarios** — the in-source blocks in all three moved modules run under the law package's `includeSource`; `pnpm --filter @systemfsoftware/effect-schema-law test` reports the law package's own four tests plus the moved modules' properties; `api:check` emits two reports, `.` listing exactly `ruleOfSchemas` and `./refutation` listing the refusal surface.
- **Dependencies** — none.

### U2. Delete the `effect-schema-refutation` package

- **Goal** — the package that existed only on this branch is gone, with no trace.
- **Requirements** — R1; `DEL1`.
- **Files** — delete `packages/core/effect/schema/refutation/` entirely; drop its `devDependencies` edge from every consumer manifest that gained one on this branch.
- **Approach** — never published, so there is no deprecation path and no shim. `git grep -nI 'effect-schema-refutation'` must print only the new plugin package's own name and the changesets that describe the change.
- **Test scenarios** — the grep above returns no stale specifier; `pnpm install` resolves with the package absent.
- **Dependencies** — U1 must land first (the sources must exist at their new home before the old tree is deleted).

### U3. Reduce `effect-schema-vite` to the laws plugin

- **Goal** — one plugin, one emitted concern, no flag.
- **Requirements** — R3, R4, R6; KTD3, KTD4.
- **Files** — modify `packages/core/effect/schema/vite/src/mod.ts`, `vite/package.json` (drop the refutation peer and its `peerDependenciesMeta` entry), `vite/tests/inline-schema-tests.integration.test.ts`, `vite/etc/effect-schema-vite.api.md`, `vite/README.md`, `vite/AGENTS.md` (delete `VITE-V2`, whose whole subject was the flag).
- **Approach** — delete `InlineSchemaTestsOptions.refutationCoverage`, the coverage branch of `generateSchemaLaws`, the `REFUTED`/`EXPORTED` emission, `findRefutedIdentities` and `identityOf` if they have no other caller. `generateSchemaLaws` returns to two parameters. The shared `lawLines` extraction collapses back into the single return it now serves.
- **Test scenarios** — the integration suite keeps its emitted-body assertions for the laws form and loses the coverage-form scenarios; the emitted file names no refutation specifier for any input, which is now a property of the only branch rather than of a default.
- **Dependencies** — none (parallel with U1).

### U4. Create the coverage plugin package

- **Goal** — the obligation-coverage assertion ships as its own plugin.
- **Requirements** — R3, R5; KTD3, KTD4.
- **Files** — create `packages/core/effect/schema/refutation-vite/` — `package.json` (`@systemfsoftware/effect-schema-refutation-vite`, 0.1.0, peers on `@systemfsoftware/effect-schema-law` + `vite` + `vitest` + `effect`), the shared config set copied from `vite/`, `src/mod.ts`, `tests/`, `README.md`, `AGENTS.md`, `etc/*.api.md`.
- **Approach** — the plugin emits only the coverage assertion and imports `obligationsOf` from `@systemfsoftware/effect-schema-law/refutation`. It writes a second generated file rather than competing for `src/schema-laws.test.ts`: two plugins rewriting one path is the collision the boolean was hiding. Pick a second basename and add it to the test-placement whitelist alongside `schema-laws.test.ts`. Carry forward the one-scan-per-schema shape (scan once, derive `covered` and `naked` from it) rather than reintroducing the double `obligationsOf` call.
- **Test scenarios** — an integration suite asserting the emitted coverage body for a fixture with obligations, a fixture with none, and a fixture whose refusals are inadequate (which must emit a body that fails); the emitted file imports from the law package's `./refutation` entry and nothing else.
- **Dependencies** — U1 (the `./refutation` entry must resolve).

### U5. Re-point the ten plugin consumers

- **Goal** — every consumer names the plugins it wants, and nothing else.
- **Requirements** — R5.
- **Files** — `vitest.config.ts` and `package.json` in all ten: `hex-schema`, `effect-daemon-spec`, `stryker-js/cli`, `omp-utils`, `omp-claude-compat` (both plugins), and `stryker-plugins`, `stryker-test-contribution`, `arethetypeswrong/analysis`, `arethetypeswrong/cli`, `omp-agent-discipline` (laws plugin only). Also re-point every `refutes` / `scanObligations` import to `@systemfsoftware/effect-schema-law/refutation`.
- **Approach** — the five-and-five division is already measured: the first five discharge 5, 4, 2, 3 and 2 obligations; the other five discharge none and their assertion was passing vacuously. That measurement stands and is not re-derived.
- **Test scenarios** — each of the ten packages' own suite exits 0; the five with the coverage plugin show the coverage test running by name under a verbose reporter.
- **Dependencies** — U1, U3, U4.

### U6. Doctrine, docs, and changesets

- **Goal** — every document naming a moved symbol names where it lives now, and the release intents match the final shape.
- **Requirements** — R1–R6; `REPO-R2`, `REPO-R3`.
- **Files** — `law/AGENTS.md` and `law/README.md` (two entries, not one export), `bounded-union/AGENTS.md` (unchanged in substance), `vite/AGENTS.md`, `refutation-vite/AGENTS.md`, root `README.md` package table, `packages/lint/oxlint/plugins/effect/schema/src/rules/no-schema-law-duplicate.config.ts` and the test-placement exemption (both currently key on the deleted package's specifier), `docs/solutions/architecture-patterns/extraction-strands-the-origins-gate.md` (its subject is unchanged but one sentence names the three-package split), and the `.changeset/` set.
- **Approach** — replace the five existing changesets: the refutation debut intent is void (no such package), the law intent becomes a `major` describing two entries, bounded-union's debut stands, `effect-schema-vite` becomes a `major` (the option is gone), and the coverage plugin gets a debut intent. Re-derive the `none` set from the gate rather than editing the old list.
- **Test scenarios** — the changeset gate exits 0; `git grep -nI 'effect-schema-refutation'` finds only the new plugin's name and the intents.
- **Dependencies** — U1–U5.

### U7. Whole-tree verification

- **Goal** — the shape holds across every gate that runs.
- **Verification** — `pnpm check:local` exits 0; the changeset gate exits 0; `gh pr checks --watch --fail-fast` exits 0.
- **Dependencies** — U1–U6.

## Verification Contract

| Gate                                        | Command                                                             | Covers     | Passing condition                                       |
| ------------------------------------------- | ------------------------------------------------------------------- | ---------- | ------------------------------------------------------- |
| Two entries resolve                         | `pnpm --filter @systemfsoftware/effect-schema-law api:check`        | U1, R1     | exits 0; two reports, `.` lists exactly `ruleOfSchemas` |
| Nothing imports the deleted package         | `git grep -nI 'effect-schema-refutation'`                           | U2, `DEL1` | only the plugin package's own name and the intents      |
| Laws plugin names no refutation symbol      | `pnpm --filter @systemfsoftware/effect-schema-vite test`            | U3, R4     | exits 0 with the emitted-body assertions                |
| Coverage plugin fails an inadequate fixture | `pnpm --filter @systemfsoftware/effect-schema-refutation-vite test` | U4, R3     | exits 0, including the must-fail fixture                |
| Ten consumers                               | each package's `test`                                               | U5, R5     | all exit 0; five show the coverage test by name         |
| Whole tree                                  | `pnpm check:local`                                                  | U7         | exits 0                                                 |
| Release intents                             | the changeset gate                                                  | U6         | exits 0                                                 |
| CI                                          | `gh pr checks --watch --fail-fast`                                  | U7         | exits 0                                                 |

## Definition of Done

The law package publishes two entries and no third path resolves; `bounded-union` still peers on `effect` alone; two plugin packages exist and neither takes a flag; the ten consumers name what they use; `pnpm check:local` and the changeset gate exit 0; PR #246 is updated and its checks are green.

## Risks

- **Two plugins competing for one generated file.** The boolean hid this: one plugin owned `src/schema-laws.test.ts`. Two plugins need two basenames, and the test-placement rule whitelists test filenames by name, so the second basename must be added there or the new file is reported as a stray test in `src/`. Highest-probability failure in the change.
- **The `./refutation` entry lands over the span budget.** It carries fourteen names against R11's 7±2 unchunked-names-per-entry. Pre-existing (the flat surface had sixteen) but newly visible, and the same ruling says chunk further. Not blocking; recorded so the next reader is not surprised.
- **`exports` drift.** Two entries double the surface where a hand-edit could creep in, and `REPO-S4` forbids hand-editing the map. Mitigation: the `typesMap`/`customExports` shape is copied from a package where the generation already works.
- **The reversal re-moves already-moved source.** The refutation modules move a second time in three commits. Rename detection carried a mid-flight upstream memoisation across the first move; it must be confirmed again after the second.

## Sources & Research

- **Wiki, consulted before this revision.** `declared-entry-points-only` (R1): the entry-point map is the complete reachable surface, author-owned, derived from chunking; measured at 79/100 most-depended npm packages and 21/23 quality-curated TS libraries. `name-set-span-budget` (R11): subpath entries are the chunking device for a surface past the span budget, "never flat accumulation"; the per-file export cap is explicitly the loser and misreads Miller.
- **Manifests, read this session.** The peer sets that decide KTD1 and KTD2: `law` and `refutation` identical at `@effect/vitest` + `effect` + `vitest`; `bounded-union` at `effect` alone; `vite` at 1.5.4 with the refutation peer already `optional`.
- **In-repo multi-entry precedent.** `effect-schema-extensions` ships `.` and `./hex-schema` through a tsdown `entry` map, a `typesMap`, `customExports`, and one api-extractor config per entry — the mechanical template for U1.
- **Prior art for the shape.** Effect ships its law surface as a subpath inside the runtime package (`effect/testing`) and splits off only the test-runner binding as a peer, which is why the runner question does not separate `refutes` from `ruleOfSchemas`.
- **What this revision reverses.** The original KTD1–KTD3 on this plan, and PR #246 as pushed. The measurement that survives untouched is the five-and-five obligation count across the ten plugin consumers.
