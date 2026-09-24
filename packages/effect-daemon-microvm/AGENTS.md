# AGENTS.md — `@systemfsoftware/effect-daemon-microvm`

The microVM medium for `@systemfsoftware/effect-daemon-spec`: one incarnation is one sandbox booted
through `@systemfsoftware/effect-microsandbox`, running one workload. The package also ships the
conformance driver that proves the medium against the fiber reference. Root `AGENTS.md` governs.

## Rules

| ID    | Rule                                                                                                                                                                                                                                                                                              | Gate                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| MV-A1 | `etc/effect-daemon-microvm.api.md` is the committed public API snapshot. A change to anything exported by `src/mod.ts` requires `build`, then `api:update`, then committing `etc/*.api.md`. A new `ae-forgotten-export` warning is fixed by exporting the type or inlining it — never suppressed. | `pnpm --filter @systemfsoftware/effect-daemon-microvm api:check`                                                                                   |
| MV-A2 | The contract lane runs only where hardware virtualization exists. Locally without an accessible `/dev/kvm` every suite skips with the reason in its title; in CI (`CI` set) a missing `/dev/kvm` fails the lane from `vitest.contract.config.ts` — it never skips.                                | `env -u CI pnpm --filter @systemfsoftware/effect-daemon-microvm test:contract` (skips) and the same with `CI=1` (fails without KVM)                |
| MV-A3 | The default `test` lane never runs a contract suite.                                                                                                                                                                                                                                              | `vitest.config.ts` excludes `tests/**/*.contract.test.ts`; `pnpm --filter @systemfsoftware/effect-daemon-microvm test` reports no test files       |
| MV-A4 | Every contract scenario runs against a real microVM; no fake stands in for the medium's oracle.                                                                                                                                                                                                   | `review` — the reviewer confirms each `tests/*.contract.test.ts` scenario boots a sandbox through `MicroVMMedium.port` or proves a driver over one |
| MV-A5 | The fixture image is pinned by content digest, and the digest's provenance is recorded in `README.md`.                                                                                                                                                                                            | `review` — the reviewer matches the digest in `tests/__fixtures__/child-script.ts` against the retrieval recorded in `README.md`                   |
| MV-A6 | The fixture's step lines are `MicroVMMedium.ChildStepLines`; a fixture script is built from that table, never transcribed from it.                                                                                                                                                                | `review` — the reviewer confirms no step label is spelled out beside the table                                                                     |

## Verification

```bash
pnpm --filter @systemfsoftware/effect-daemon-microvm typecheck
pnpm --filter @systemfsoftware/effect-daemon-microvm test
pnpm --filter @systemfsoftware/effect-daemon-microvm test:contract
pnpm --filter @systemfsoftware/effect-daemon-microvm build
```
