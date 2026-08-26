---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
title: "Replace the hand-rolled worker IPC with Effect's own worker RPC"
date: 2026-08-26
topic: stryker-js-worker-transport
depth: deep
---

# Replace the hand-rolled worker IPC with Effect's own worker RPC — Plan

## Goal Capsule

- **Objective:** `@systemfsoftware/stryker-js-platform-node` talks to its checker and
  test-runner child processes through `effect/unstable/workers` and
  `effect/unstable/rpc`, over `NodeWorker`/`NodeWorkerRunner`. The hand-written
  newline-framed JSON protocol, the pending-reply map, the untyped method proxy and
  the hand-rolled worker pool are deleted, not wrapped.
- **Why now:** every stalled mutation run measured this session traces to that
  hand-written layer. Three separate defects in it were found and fixed tonight — a
  send whose failure was discarded while the caller waited for the reply, a reply
  write whose failure was discarded, and a received frame that failed to decode and
  was dropped in silence — and the run still stalls at the first cross-process call.
  Each fix was correct and none of them made the transport trustworthy, because the
  layer is a bespoke reimplementation of something the runtime already ships.
- **Non-goals:** the mutation engine's phases, the event stream, the CLI surface,
  the report shape, `stryker.config.json` semantics, and every package outside
  `platform-node` and the schemas it imports.

## Product authority

This plan owns the transport boundary only. It does not renegotiate what a checker
or a test runner _does_, only how the parent asks and how the answer returns.

## Key Technical Decisions

1. **Effect's worker RPC replaces the hand-rolled IPC**
   _(session-settled: user-directed — chosen over continuing to repair the
   hand-written protocol: three defects in one night, each proven by reading the
   code, and the stall survived all three fixes.)_
   `RpcClient.layerProtocolWorker` on the parent, `RpcServer.layerProtocolWorkerRunner`
   in the child. Verified present in the vendored tree at
   `repos/effect/packages/effect/src/unstable/rpc/RpcClient.ts:1392` and
   `repos/effect/packages/effect/src/unstable/rpc/RpcServer.ts:1388`.

2. **Child processes, not worker threads**
   _(session-settled: user-approved — chosen over `worker_threads`: mutation
   testing runs untrusted mutated code and needs process isolation, and the runner
   contract already assumes a separate process.)_
   `repos/effect/packages/platform/node/src/NodeWorker.ts:31` documents and types
   `layerPlatform` for `WorkerThreads.Worker | ChildProcess.ChildProcess`, and
   `repos/effect/packages/platform/node/src/NodeWorkerRunner.ts:39-43` selects
   `process.send` when `parentPort` is absent. Child processes are a supported
   transport, not an adaptation.

3. **Declared per-method schemas replace the untyped proxy**
   _(session-settled: user-directed via "no larping" — chosen over a generic
   `Proxied<T>` bridge that satisfies RPC's shape without using its types: the
   generic bridge is what allowed `args: Wire.array(JsonValue)` to accept anything
   and fail at the far end.)_
   The proxied surface is six methods, measured: `init`, `check`, `group` on the
   checker; `init`, `capabilities`, `dryRun`, `mutantRun` on the test runner. Each
   becomes an `Rpc` with request and success schemas.

4. **Effect's pool replaces the hand-rolled one**
   _(session-settled: user-directed via "full effect native" — chosen over keeping
   `Pool.make` around the new client: `layerProtocolWorker` takes `size` /
   `minSize`+`maxSize`+`timeToLive` and owns spawning, so keeping a second pool
   would leave two things sizing the same resource.)_

5. **Every wait is bounded, and the bound lives in the engine**
   _(session-settled: user-directed via "add timeouts" — chosen over relying on the
   CI step cap: a cap outside the process kills the run before it can write a
   report, so the failure arrives with no diagnosis.)_
   Kept from this session's work: a call that outlives its bound fails with the
   worker's captured output attached.

## Requirements

- **R1** The parent obtains checker and test-runner clients through Effect's worker
  RPC; no module in `platform-node/src` frames, delimits, or length-checks a
  message itself.
- **R2** The child entry points serve their RPC group through
  `NodeWorkerRunner.layer`; no module parses a frame or maintains a reply map.
- **R3** Each of the six operations carries a request schema and a success schema.
- **R4** A worker that cannot answer produces a typed failure at the call site,
  bounded in time, carrying the worker's output.
- **R5** Worker lifetime is scoped: leaving the scope disposes the children.
- **R6** `MAX_FRAME_BYTES`, `DELIMITER`, the `JsonValue` union, the pending-reply
  map, the `Proxy` handler and `makeChildProcessProxy` are gone from the tree.
- **R7** A real mutation run over a real package completes and writes a report.

## Implementation Units

### U1 — Declare the two worker protocols

`platform-node/src/Worker.schema.ts` gains two `RpcGroup`s: `CheckerRpcs`
(`init`, `check`, `group`) and `TestRunnerRpcs` (`init`, `capabilities`, `dryRun`,
`mutantRun`), each request and result typed against the schemas that already exist
(`StrykerOptions` in `platform-node/src/Config.ts`, `Mutant` and `MutantTestPlan`
in `stryker-js/src/Mutant.ts`, `CheckResult` in `platform-node/src/Checker.workflow.ts`,
`DryRunResult`/`MutantRunResult` in `stryker-js/src/TestRunner.ts`).
`TestRunnerCapabilities` has no schema yet and needs one declared here.
Depends on: nothing.

### U2 — Parent side

`platform-node/src/Worker.ts` keeps only concurrency maths, worker id generation
and the spawn function; `makeChildProcessProxy` and everything it needed are
deleted. `Checker.ts` and `TestRunner.ts` obtain clients from
`RpcClient.layerProtocolWorker` over `NodeWorker.layer((id) => fork(entry, ...))`,
with the pool sizes they compute today.
Depends on: U1.

### U3 — Child side

`platform-node/src/WorkerMain.ts` and the two `internal/*-worker` entry points
serve their group through `RpcServer.layerProtocolWorkerRunner` +
`NodeWorkerRunner.layer`. The chunk buffer, the delimiter scan, the frame cap and
the decode-or-drop branch are deleted.
Depends on: U1.

### U4 — Delete the old protocol and its vestiges

Remove the wire schemas that only the old framing used, and the tests that assert
framing rather than behaviour. `git grep` for each removed name must come back
empty (`DEL1`).
Depends on: U2, U3.

## Verification Contract

- `pnpm --filter @systemfsoftware/stryker-js-platform-node typecheck lint test build`
- The two CLI fixtures (`minimal-project`, `surviving-mutant-project`) emit the same
  event kinds and verdicts as they do today — the baseline this session recorded is
  `stream,phase,phase,phase,phase,plan,verdict` and
  `stream,phase,phase,phase,phase,plan,mutant,verdict`.
- **A real mutation run, locally, on a real workspace package, producing a report.**
  This is the acceptance gate for R7 and the one that has never been run this
  session: every green result so far came from fixtures whose runner is `command`,
  and the stall lives in the `vitest` runner's child-process round trip. A port
  that passes package tests and fixtures proves nothing about the transport.
- `pnpm check:local` after the last edit.

## Risks

- **The dry-run stall may not be the transport.** It has been localized to the first
  cross-process call and no further. If the Effect-native transport stalls in the
  same place, the cause is in the runner plugin, and this plan has still removed the
  layer that made it undiagnosable — but the run will still hang, and that must be
  reported rather than presented as a fix.
- **A previous attempt at this exact port fabricated its result** — reported
  -656/+188 lines and green package tests while being non-functional. That is why
  the real-run gate above is not optional and why this work is not delegated.
- **`Transferable` is a browser type in the RPC surface.** Over a child process
  there is nothing to transfer; the code must not claim transferables it cannot
  honour.
