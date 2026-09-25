# AGENTS.md — `@systemfsoftware/effect-daemon-cluster`

The `effect-daemon-spec` medium over `effect/unstable/cluster`. Root `AGENTS.md` governs.

## Rules

| ID        | Rule                                                                                                                                                                                                                                                                                                                                                                 | Gate                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **AC-A1** | `etc/effect-daemon-cluster.api.md` is the committed public API snapshot. A change to anything exported by `mod.ts` requires `build`, then `api:update`, then committing `etc/*.api.md`. A new `ae-forgotten-export` warning is fixed by exporting the type or inlining it — never suppressed.                                                                        | `pnpm --filter @systemfsoftware/effect-daemon-cluster api:check`                                                     |
| **AC-A2** | The API report carries no `ae-forgotten-export` warnings.                                                                                                                                                                                                                                                                                                            | `! grep -q ae-forgotten-export packages/daemon/effect-daemon-cluster/etc/effect-daemon-cluster.api.md`               |
| **AC-M1** | The public surface is the `ClusterMedium` namespace barrel; only the `.` entry is exported. `effect` stays a peer and never enters `bundledPackages`.                                                                                                                                                                                                                | `review`                                                                                                             |
| **AC-M2** | The medium owns no recovery: no `Effect.retry`, `retryOrElse`, `forever` or `Stream.retry` inside the medium ports — restarting is the supervisor's decision.                                                                                                                                                                                                        | `review`                                                                                                             |
| **AC-M3** | The liveness probe calls the child directly; `RunnerHealth` is never consulted. Death the medium cannot observe is reported as inferred.                                                                                                                                                                                                                             | `review`                                                                                                             |
| **AC-C1** | `vitest.config.ts` declares three projects with disjoint includes: `unit`, `conformance` (`tests/**/*.conformance.test.ts`, a scripted `Sharding` port) and `contract` (`tests/**/*.contract.test.ts`, Gherkin features whose real oracle is `SingleRunner.layer` over PGlite plus `Crypto`). `test` runs `unit` and `conformance`; `test:contract` runs `contract`. | `pnpm --filter @systemfsoftware/effect-daemon-cluster test:contract` reports only `*.contract.test.ts` files         |
| **AC-C2** | The mutation runner points at `vitest.config.ts`, so every project, the real-oracle contract lane included, gets a chance to kill this package's mutants.                                                                                                                                                                                                            | `pnpm --filter @systemfsoftware/effect-daemon-cluster mutation` (CI's Mutation workflow; never run locally, REPO-D3) |

## Verification

```bash
pnpm --filter @systemfsoftware/effect-daemon-cluster typecheck
pnpm --filter @systemfsoftware/effect-daemon-cluster lint
pnpm --filter @systemfsoftware/effect-daemon-cluster test
pnpm --filter @systemfsoftware/effect-daemon-cluster test:contract
pnpm --filter @systemfsoftware/effect-daemon-cluster build
```
