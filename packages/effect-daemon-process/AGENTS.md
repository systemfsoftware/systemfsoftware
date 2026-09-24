# AGENTS.md — `@systemfsoftware/effect-daemon-process`

The `effect-daemon-spec` medium over operating-system child processes: a supervised command spec spawned through `ChildProcessSpawner`, with exit status and signal reported as observed, and shutdown mapped onto SIGTERM and SIGKILL. Root `AGENTS.md` governs.

## Rules

| ID         | Rule                                                                                                                                                                                                                                                                                        | Gate                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **DSP-A1** | `etc/effect-daemon-process.api.md` is the committed public API snapshot: change an export in `src/ProcessMedium/mod.ts`, then `build`, then `api:update`, then commit `etc/*.api.md`. A new `ae-forgotten-export` warning is fixed by exporting the type or inlining it — never suppressed. | `pnpm --filter @systemfsoftware/effect-daemon-process api:check` (root `pre-push` and CI)                                |
| **DSP-A2** | The API report carries no `ae-forgotten-export` warnings.                                                                                                                                                                                                                                   | `! grep -q ae-forgotten-export packages/effect-daemon-process/etc/effect-daemon-process.api.md`                          |
| **DSP-A3** | `build` precedes `api:check`/`api:update` (`tsdown` emits `dist/mod.d.ts`, then api-extractor writes the report), and `etc/` exists before the first report is written.                                                                                                                     | `pnpm --filter @systemfsoftware/effect-daemon-process build`                                                             |
| **DSP-M1** | The contract lane is the only lane that spawns processes: `tests/**/*.contract.test.ts` belongs to `vitest.contract.config.ts`, and the default `test` lane excludes it.                                                                                                                    | `pnpm --filter @systemfsoftware/effect-daemon-process test` reports no test file; `test:contract` reports nine scenarios |
| **DSP-M2** | A reported failure stays at the declared `exit` level: this package mints no `CauseReport` and no `InferredReport`, and `DeadlineMissed` stays the kernel's.                                                                                                                                | `review` — `medium.ts`'s only report builder is `abnormalExitOf`, and it returns `ExitReport`                            |
| **DSP-M3** | A stop sends the operating system's own signals and nothing else: SIGKILL for `Brutal`, SIGTERM and a force window for `Graceful`, SIGTERM alone for `Infinity`. The child's own journal is the witness, not the medium's claim.                                                            | `tests/process-medium.contract.test.ts` asserts the fixture's journal (`signals: ['IGNORE']`, `['IGNORE', 'TERM']`)      |
| **DSP-M4** | The control channel scripts the child, never the kernel: `control.advance(step)` writes one step tag to the running incarnation's stdin. The fixtures' only kernel call is `Supervisor.shutdown`.                                                                                           | `review` — `tests/__fixtures__/process-runs.ts` offers only `advance` and `Supervisor.shutdown`                          |
| **DSP-M5** | The group stop is atomic because the platform's `kill` awaits the process group's exit. A stop that returned after signalling but before the child was reaped would falsify the `atomic` declaration.                                                                                       | `review` — `stopOf` awaits `handle.kill(...)` and never resolves the report on death                                     |

## Calibration

- **DSP-M2** — wrong: reporting a child killed by SIGKILL as `{ _tag: 'Abnormal', report: { _tag: 'CauseReport', cause } }` (a `Cause` the medium cannot supply, which the projection would silently coerce). Right: the platform's own words decoded into `{ _tag: 'ExitReport', code: 0, signal: 'SIGKILL' }` (`packages/effect-daemon-process/src/ProcessMedium/medium.ts`).
- **DSP-M3 / DSP-M5** — wrong: returning from `stop` as soon as the signal is delivered, so the stop looks as instant as the fibre reference's interrupt and wins any race against a control step that follows. Right: keep the platform's await, and let a harness that needs a settled group stop wait for the supervisor to be quiescent.
- **DSP-M5** — wrong: resolving `report` on the child's actual death instead of on the stop latch. The latch answers `Shutdown` before the signal goes out, which is what the fibre reference does, and resolving later diverges from it in the trace.

## Verification

```bash
pnpm --filter @systemfsoftware/effect-daemon-process typecheck
pnpm --filter @systemfsoftware/effect-daemon-process lint
pnpm --filter @systemfsoftware/effect-daemon-process test
pnpm --filter @systemfsoftware/effect-daemon-process test:contract
pnpm --filter @systemfsoftware/effect-daemon-process build
```
