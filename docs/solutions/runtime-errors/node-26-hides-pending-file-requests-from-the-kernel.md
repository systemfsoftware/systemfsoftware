---
title: "Node 26 hides pending file requests from process.getActiveResourcesInfo, so the kernel read a file wait as a deadlock"
date: 2026-11-22
category: runtime-errors
module: effect-sim-kernel
problem_type: runtime_error
component: testing_framework
symptoms:
  - "On Node 26, `Kernel.run(program, { external: 'await' })` over a program that reads a file fails with a deadlock instead of awaiting the read"
  - "`Kernel.run(program, { external: 'fail' })` over the same program reports `Deadlock` instead of `Blocked` on a File wait"
  - "`Conformance.released` over a program that writes a temporary file reports `Incomplete` instead of `Fail`"
  - "The same tests pass on Node 24"
root_cause: dependency_major_change
resolution_type: code_fix
severity: high
related_components:
  - tooling
tags:
  - node-26
  - async-hooks
  - quiescence
  - effect-sim-kernel
  - turbo-cache
---

# Node 26 hides pending file requests from process.getActiveResourcesInfo, so the kernel read a file wait as a deadlock

## Problem

When a run stalls, the kernel decides whether it waits on the host (a timer, a file, a socket) or is deadlocked by comparing the host's live resources with those alive at run start. It read them from `process.getActiveResourcesInfo()`. Node 26 no longer lists pending file requests there, so a run blocked on a file read saw nothing new and reported a deadlock.

## Symptoms

- On Node 24 an in-flight `fs.readFile` plus `fs.promises.readFile` lists `["FSReqCallback","FSReqPromise", ...]`. On Node 26 the same moment lists neither; `GetAddrInfoReqWrap`, `Timeout` and `Immediate` are still listed.
- `async_hooks` still sees the requests on Node 26: `init` fires with `FSREQCALLBACK` (both callback and promise reads use it on Node 26; Node 24 uses `FSREQPROMISE` for promise reads).

## What Didn't Work

### Tracking every async_hooks resource

Replacing the process list with a map of every resource between `init` and `destroy` counted the wrong things:

- Effect fibers register `effect/Fiber` async resources that live until garbage collection.
- `destroy` for a timer or immediate is delivered late, after its callback has run, so the kernel's own host yield read as a live real timer and `Conformance.released` failed with "blocked on RealTimer".
- `PROMISE` and `FILEHANDLE` also outlive the work they stand for.

The process list is still right for everything except file requests, so only file requests need another source.

### Importing async_hooks in the kernel

The kernel peer-depends on `effect` only and the lint bans Node built-in imports in `src`. Loading the module another way, such as `process.getBuiltinModule`, would evade that rule rather than satisfy it.

## Solution

`Kernel.run` takes a `host` option: a `HostResources` source the run begins at start and ends when it releases. The default is the process list. `Kernel.fileRequestHooks(createHook)` keeps the process list without its `FSReq*` entries, and adds each `FSREQCALLBACK`/`FSREQPROMISE` request from `init` until its `before` hook (a request completes once, and `before` fires just before its callback) or `destroy`. The caller passes Node's `createHook`, so the kernel imports nothing from Node. `Conformance.released` reads the source from `Kernel.HostResourcesService` when an Effect caller provides it.

## Why the failure reached main green

Turbo's task hash did not include the Node release. Main moved from Node 24 to Node 26 without touching any hashed input, so CI restored the Node 24 test results from cache and reported every test task as cached. The setup action now exports `NODE_RUNTIME_VERSION=$(node --version)` and `turbo.json` lists it in `globalEnv`, so a Node release change invalidates every task.

## Prevention

- After a runtime upgrade, check the test job ran its tasks (`Cached: 0 cached`) rather than replaying them.
- Read host state from the narrowest source that stays correct across releases, and pin that with a test that runs a real host wait.
