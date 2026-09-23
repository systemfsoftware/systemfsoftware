# AGENTS.md — `@systemfsoftware/discern`

Semantic pattern matching and control flow over Effect's `DecisionModel`. Root `AGENTS.md` governs; this leaf carries only the delta.

## Fork provenance

`src/` is an owned fork of [`doeixd/discern`](https://github.com/doeixd/discern) at commit `ab092e2656d5cb116653e846d3f42c4343bfbdf3` (that commit's `package.json` declares v0.4.0, MIT, Copyright (c) 2026 Patrick Glenn).

Owned means: edit `src/` freely (`REPO-O1`). It is not a `repos/` subtree, so `REPO-S3` does not apply and `git subtree pull` never touches it. Upstream is a reference for reading, never a merge source.

Four repairs landed with the fork, each forced by this repo's stricter configuration rather than by a behaviour change:

- `PatternAst`'s optional `description` widened to `string | undefined`; the construction sites already assign that under `exactOptionalPropertyTypes`.
- A `Probability` decision carries its two outcome labels when a caller omits `criteria`. `Decision.probability` requires them and the decision reaches a provider unencoded.
- Five TSDoc references into the `Model` namespace re-export became backticked prose. API Extractor cannot resolve a namespace member, and an unresolved link fails `api:check`.

## Rules

| ID     | Rule                                                                                                                                                                                                                                                                                                                                              | Gate                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | Two entries — `.` (`src/index.ts`) and `./procedure` (`src/procedure.ts`) — each need an `api-extractor.<name>.json` + `tsconfig.api-<name>.json` pair **and** a line in `typesMap` in `tsdown.config.ts`. Miss either and `api:check` silently skips that entry's surface.                                                                       | `pnpm --filter @systemfsoftware/discern api:check` exits 0 and `etc/` holds one `*.api.md` per entry                                                                                                      |
| **D2** | `dtsRollup` stays `false` in both api-extractor configs: per-entry rollup cannot express `export * as Model from './model.js'`, and the rolled-up declarations do not compile (same finding as `AT1`). tsdown's `dist/*.d.ts` is the shipped declaration surface.                                                                                 | `pnpm --filter @systemfsoftware/discern build` exits 0 with `"dtsRollup": { "enabled": false }` in both configs                                                                                           |
| **D3** | The four repairs above are load-bearing: reverting one re-breaks `typecheck` or `api:check`.                                                                                                                                                                                                                                                      | `pnpm --filter @systemfsoftware/discern typecheck && pnpm --filter @systemfsoftware/discern build` exit 0                                                                                                 |
| **D4** | `src/` is not yet enrolled in oxlint — it still carries upstream's `any`, type assertions, `unknown` and functions above the repo's complexity ceiling. There is deliberately no `lint` script and no `oxlint.config.ts`. A weakened preset added to turn a light green is a violation, not a fix; enrollment lands with the conformance rewrite. | `review` — the reviewer confirms an `oxlint.config.ts` added before that wave still extends the full `recommended` preset and that `src/` was rewritten to pass it, not the preset relaxed to pass `src/` |

Review pair for **D4** — wrong: adding `oxlint.config.ts` with `complexity` and `typescript/no-explicit-any` relaxed so the package lints clean. Right: leaving both files absent and listing the rule families in the conformance wave's scope.

## Verification

```bash
pnpm --filter @systemfsoftware/discern typecheck
pnpm --filter @systemfsoftware/discern build
pnpm --filter @systemfsoftware/discern test
pnpm --filter @systemfsoftware/discern test:types
pnpm --filter @systemfsoftware/discern attw
```
