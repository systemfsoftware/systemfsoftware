# AGENTS.md — `@systemfsoftware/effect-daemon-socket`

The `effect-daemon-spec` medium over `effect/unstable/socket`: a supervised long-lived connection with readiness conditions, close and refusal reported as received, and graceful-then-forced shutdown. Root `AGENTS.md` governs.

## Rules

| ID         | Rule                                                                                                                                                                                                                                                                     | Gate                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **DSK-A1** | `etc/effect-daemon-socket.api.md` is the committed public API snapshot: change an export in `mod.ts`, then `build`, then `api:update`, then commit `etc/*.api.md`. A new `ae-forgotten-export` warning is fixed by exporting the type or inlining it — never suppressed. | `pnpm --filter @systemfsoftware/effect-daemon-socket api:check` (root `pre-push` and CI)                              |
| **DSK-A2** | The API report carries no `ae-forgotten-export` warnings.                                                                                                                                                                                                                | `! grep -q ae-forgotten-export packages/effect-daemon-socket/etc/effect-daemon-socket.api.md`                         |
| **DSK-A3** | `build` precedes `api:check`/`api:update` (`tsdown` emits `dist/mod.d.ts`, then api-extractor writes the report).                                                                                                                                                        | `pnpm --filter @systemfsoftware/effect-daemon-socket build`                                                           |
| **DSK-S1** | `package.json#exports` and `publishConfig.exports` are tsdown-generated (REPO-S4); change the `injectTypes` callback in `tsdown.config.ts`.                                                                                                                              | `pnpm --filter @systemfsoftware/effect-daemon-socket build` regenerates cleanly                                       |
| **DSK-M1** | The contract lane is the only lane that runs a real socket: `tests/**/*.contract.test.ts` belongs to `vitest.contract.config.ts`, and the default `test` lane excludes it.                                                                                               | `pnpm --filter @systemfsoftware/effect-daemon-socket test` reports no test file; `test:contract` reports five         |
| **DSK-M2** | No recovery inside a `Medium.make` port: a refused dial is reported, never retried. Restarting is the supervisor's decision.                                                                                                                                             | `@systemfsoftware/oxlint-plugin-cell-architecture/medium-owns-no-recovery` at `error` (recommended preset)            |
| **DSK-M3** | A reported failure stays at the declared `exit` level: this package mints no `CauseReport` and no `InferredReport`, and `DeadlineMissed` stays the kernel's.                                                                                                             | `review` — `failureReportOf` returns only `ExitReport`, and `socket-termination.ts` is its only report builder        |
| **DSK-M4** | The loopback fixture scripts the peer, never the child: `advance` reaches the server side of the connection the current incarnation holds, and control never enters the supervisor's mailbox.                                                                            | `review` — `tests/__fixtures__/socket-supervision.fixture.ts` drives only `fixture.advance` and `Supervisor.shutdown` |

## Calibration

- **DSK-M3** — wrong: `report` answering `{ _tag: 'Abnormal', report: { _tag: 'CauseReport', cause } }`, which the projection would silently coerce to `ExitReport`. Right: the socket failure decoded into an `ExitReport` (`packages/effect-daemon-socket/src/SocketMedium/socket-termination.ts`).
- **DSK-M4** — wrong: a contract step that offers a `ShutdownRequested` or a probe result into the handle to move a script along. Right: `fixture.advance(step)` acts on the peer, and only `Supervisor.shutdown` touches the kernel.

## Verification

```bash
pnpm --filter @systemfsoftware/effect-daemon-socket typecheck
pnpm --filter @systemfsoftware/effect-daemon-socket lint
pnpm --filter @systemfsoftware/effect-daemon-socket test
pnpm --filter @systemfsoftware/effect-daemon-socket test:contract
pnpm --filter @systemfsoftware/effect-daemon-socket build
```
