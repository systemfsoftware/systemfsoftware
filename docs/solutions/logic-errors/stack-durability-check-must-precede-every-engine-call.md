---
title: A stack layer's durability check must run before any destroy, not inside the deploy's build
date: 2026-11-27
category: logic-errors
module: alchemy-stack-layer
problem_type: logic_error
component: tooling
severity: high
applies_when:
  - changing the order of steps in alchemy-stack-layer's deployStack
  - removing the separate state build that reads the state store's id before a cloud deploy
tags: [alchemy, state-store, destroy, ordering, data-loss]
---

## Problem

A cloud deploy (`dev: false`) must fail with `DurableStateRequired` when the stack's state store is `local` or `inmemory`. `deployStack` reads the store id with its own `build` of the stack's providers and state, and `Alchemy.Stack(...)` builds them again when the deploy evaluates the program (`repos/alchemy/packages/alchemy/src/Stack.ts:351-365`). A simplify pass removed that extra build by moving the check into the program handed to `Core.deploy`, as an `Effect.tap` on the compiled stack.

That put the check after the reclaim destroy and after the release-time destroy finalizer. A non-durable store that already records a deployment at the stage then has that deployment destroyed before the run is rejected. On a workstation, `local` state lives on disk under `.alchemy/` and can record real cloud resources from an earlier run.

The existing failure test did not catch it: its in-memory store started empty, so the early destroy deleted nothing.

## Solution

Keep `checkDurability` as the first step of `deployStack`, ahead of `Scope.fork`, the destroy finalizer, the reclaim destroy and the deploy. Accept the extra state and provider build: `Core.destroy` builds them anyway (`repos/alchemy/packages/alchemy-test/src/Core.ts:724-736`), and holding a compiled stack's store open across `Core.destroy` risks a store-lease conflict.

`tests/stack-failures.integration.test.ts` has a scenario "a cloud run over an in-memory store that already records a deployment fails before it touches it". A dev run fills a shared in-memory store, then a cloud run over that store must fail with `DurableStateRequired` and record no delete. With the check moved after the reclaim destroy, the scenario fails with an extra `delete Occupied-probe`.

## Prevention

A test of a guard that protects stored state needs that state to be non-empty. An empty store makes an early destroy look harmless.
