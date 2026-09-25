# AGENTS.md — `@systemfsoftware/effect-daemon-conformance`

The pairwise conformance kit for `effect-daemon-spec` media: a pure core (`ChildScript`, the
scenario catalogue, `project-trace.workflow.ts`, `compare-traces.workflow.ts`) plus the run side
(`conformance.ts`) medium authors call. Root `AGENTS.md` governs.

## Rules

| ID        | Rule                                                                                                                                                                                                                                                                                              | Gate                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **DC-A1** | `etc/effect-daemon-conformance.api.md` is the committed public API snapshot. A change to anything exported by `mod.ts` requires `build`, then `api:update`, then committing `etc/*.api.md`. A new `ae-forgotten-export` warning is fixed by exporting the type or inlining it — never suppressed. | `pnpm --filter @systemfsoftware/effect-daemon-conformance api:check` (wired into root `pre-push` and CI) |
| **DC-A2** | The API report carries no `ae-forgotten-export` warnings.                                                                                                                                                                                                                                         | `! grep -q ae-forgotten-export packages/effect-daemon-conformance/etc/effect-daemon-conformance.api.md`  |
| **DC-A3** | `build` precedes `api:check`/`api:update` (`tsdown` emits `dist/mod.d.ts`, then api-extractor writes the report).                                                                                                                                                                                 | `pnpm --filter @systemfsoftware/effect-daemon-conformance build`                                         |
| **DC-S1** | `package.json#exports` and `publishConfig.exports` are tsdown-generated (REPO-S4); change the `injectTypes` callback in `tsdown.config.ts`.                                                                                                                                                       | `pnpm --filter @systemfsoftware/effect-daemon-conformance build` regenerates cleanly                     |
| **DC-M1** | The public surface is the `Conformance` namespace barrel; only the `.` entry is exported. `effect` stays a peer and never enters `bundledPackages`.                                                                                                                                               | `review`                                                                                                 |
| **DC-M2** | Comparison never reads a medium's own report shape: it reads the projected `ObservedStep`, whose kinds, child identities and generations are what a trace compares.                                                                                                                               | `review`                                                                                                 |

## Verification

```bash
pnpm --filter @systemfsoftware/effect-daemon-conformance typecheck
pnpm --filter @systemfsoftware/effect-daemon-conformance test
pnpm --filter @systemfsoftware/effect-daemon-conformance api:check
```
