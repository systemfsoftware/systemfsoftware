# AGENTS.md — `@systemfsoftware/effect-daemon-spec`

Supervision-tree daemons for Effect-TS. Root `AGENTS.md` governs.

## Rules

| ID        | Rule                                                                                                                                                                                                                                                                                                | Gate                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **DS-A1** | `etc/effect-daemon-spec.api.md` is the committed public API snapshot. A change to anything exported by `mod.ts` requires `build`, then `api:update`, then committing `etc/*.api.md`. A new `ae-forgotten-export` warning is fixed by exporting the type or inlining it — never suppressed.          | `pnpm --filter @systemfsoftware/effect-daemon-spec api:check` (wired into root `pre-push` and CI) |
| **DS-A2** | The 11 `ae-forgotten-export … _base` entries in the report are baseline (synthetic intermediates from effect's `Schema.Class`/`Context.Tag`/`TaggedError` factories) — never delete them; a NEW `*_base` warning requires a named base const at the source or explicit reviewer approval in the PR. | `review`                                                                                          |
| **DS-A3** | `build` precedes `api:check`/`api:update` (`tsdown` → `dist/index.d.ts` → api-extractor rollup + report).                                                                                                                                                                                           | `pnpm --filter @systemfsoftware/effect-daemon-spec build`                                         |
| **DS-S1** | `package.json#exports` and `publishConfig.exports` are tsdown-generated (REPO-S4); change the `injectApiExtractorTypes` callback in `tsdown.config.ts`. New subpath exports require an `apiExtractorRollups` entry; `types` stays before `default`.                                                 | `pnpm --filter @systemfsoftware/effect-daemon-spec build` regenerates cleanly                     |
| **DS-M1** | Never add `effect` to `bundledPackages` in `api-extractor.json` (peer dep — would freeze effect's types into the rollup); never gitignore `etc/`; never import internals via subpath — only the `.` entry is exported.                                                                              | `review`                                                                                          |

## Verification

```bash
pnpm --filter @systemfsoftware/effect-daemon-spec typecheck
pnpm --filter @systemfsoftware/effect-daemon-spec test
pnpm --filter @systemfsoftware/effect-daemon-spec api:check
```
