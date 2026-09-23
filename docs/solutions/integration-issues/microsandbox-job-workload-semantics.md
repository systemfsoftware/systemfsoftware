---
title: "microsandbox 0.7.2 workload semantics that are easy to misread when wrapping jobs"
date: 2026-09-22
category: integration-issues
module: effect-microsandbox
problem_type: integration_issue
component: tooling
symptoms:
  - "A job VM boots with its cmd set, but nothing reports the workload's exit code or output"
  - "waitUntilStopped() never resolves after the workload exits"
  - "SIGTERM and SIGKILL deaths are indistinguishable through the SDK"
  - "A README claimed the runtime keeps at most 32 MiB of output per run, which the agent source does not do"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags: [microsandbox, execdefault, exit-code, signal, network-policy, host-access, output-budget]
---

# microsandbox 0.7.2 workload semantics that are easy to misread when wrapping jobs

## Problem

`MicroVM.job(...).run` (issue #471) reports how a one-shot workload ended. That report depends on four microsandbox 0.7.2 behaviours. From the type or constant names alone, each reads one way, but the source shows another. One misreading, a 32 MiB output cap, reached the package README before review caught it.

## Failure Modes

1. **Waiting on the VM instead of the workload.** `Sandbox.waitUntilStopped()` resolves when the VM stops. The VM outlives its workload, so the wait stays pending and no exit code arrives.
2. **Expecting `create()` to run the command.** Since the 2026-08-07 SDK release, `create()` only boots the VM. Nothing executes `ENTRYPOINT` + `.cmd` unless the host asks.
3. **Expecting a signal number.** agentd's `exit_code` returns `WEXITSTATUS` for a normal exit and `-1` for anything else, so every signal death reaches the SDK as `-1`.
4. **Reading a flow-control budget as an output cap.** agentd's `SESSION_OUTPUT_BYTE_CAPACITY` (32 MiB) sizes a semaphore of in-flight guest-to-host bytes, and permits return once the host consumes an envelope (agentd's own session-budget unit tests). Output past 32 MiB waits for the host instead of being truncated.
5. **Allowing only `host`.** `NetworkPolicy.fromProfiles` builds a deny-by-default policy that allows exactly the listed destination groups, so `['host']` alone removes default public egress.

## Solution

- `awaitJobCompletion` calls `Sandbox.execDefault()` exactly once. It runs the effective OCI `ENTRYPOINT` plus the builder `.cmd` override and resolves to `ExecOutput` with `code`, `stdoutBytes()`, and `stderrBytes()` (https://docs.microsandbox.dev/sandboxes/commands.md, "Run the image default workload").
- `classifyJobExit` maps `code >= 0` to `JobExited({ code })` and `code < 0` to `JobSignaled({})`, which has no signal field. `JobExited.code` is a non-negative integer, so a mis-routed `-1` cannot decode as an exit.
- `JobCompletion` carries the whole output as `Uint8Array` from the byte accessors; the string accessors decode UTF-8 lossily. The README states that `.run` holds all of the output in memory and names no cap.
- `compilePlan` applies `NetworkPolicy.fromProfiles(['public', 'host'])` only when a job opted in with `withHostAccess(true)`. The guest reaches the host at `host.microsandbox.internal`.

## Architectural Invariants

- **Observe the unit you report on.** A completion API waits on the workload's own exit event, never on the lifecycle of the container that hosts it.
- **Signal identity is not recoverable below the agent.** Any status type built on this SDK carries only exited-with-code or signaled until agentd transmits signal numbers. Adding an always-empty `signal` field would be dead API.
- **A capacity constant names its semaphore, not the stream.** Before stating a size limit, find where the constant is acquired and released. A budget that is released on consumption limits concurrency, not totals.
- **Host opt-in is additive.** An opt-in profile set is the default set plus `host`, so opting in never removes egress the job already had.

## Prevention

- Before documenting a lifecycle or limit claim about microsandbox, read the agentd source at the pinned version (`https://docs.rs/crate/microsandbox-agentd/<version>/source/`) rather than inferring it from a constant or type name.
- On an SDK bump, re-read agentd's `exit_code`. A release that reports signal numbers is the point to add one to `JobSignaled`.
- The real-VM smoke journey is the only layer that proves these behaviours. It must fail without KVM rather than skip, or the proof silently disappears.

## Related Issues

- Issue #471 (job completion, host access, workdir)
- Plan `docs/plans/2026-09-22-2217-feat-microsandbox-job-completion-plan.md`. Its KTD4 repeats the 32 MiB-cap misreading; this doc supersedes that line.
