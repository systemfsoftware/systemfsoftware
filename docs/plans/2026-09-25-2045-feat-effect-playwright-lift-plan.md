---
title: Effect Playwright Lift - Plan
type: feat
date: 2026-09-25
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
supersedes: docs/plans/2026-09-25-1808-feat-effect-playwright-port-plan.md
---

# Effect Playwright Lift - Plan

## Goal

`@systemfsoftware/effect-playwright` lets an Effect program drive a real browser. The library owns only what Playwright does not already give a caller: a lazy, typed-error form of any Playwright call, scope-bound lifetimes for anything Playwright can dispose, event streams that end with their source, page callbacks that run Effects, and a Playwright Test entry that runs Effect test bodies. Every other Playwright operation is called on the raw Playwright object.

## Problem

The first cut ported upstream Jobflow-io/effect-playwright 0.8.0-2 method by method: about 200 hand-written wrappers (`page.goto`, `locator.click`, ...), each one only forwarding to Playwright (`CONST-B3` names that pass-through as the defect). The costs were concrete:

- Every Playwright release adds methods and options the mirror lacks; the port already needed a `use(raw => ...)` escape hatch on every wrapper.
- Wrappers construct each other, so the module graph was cyclic and needed a dependency-injection record just to satisfy `import/no-cycle`.
- The mirror hid the parts that carry real behaviour. The two lifecycle defects review found (an event stream opened on a closed page never ends; an exposed function keeps calling into released services) lived there, untested among the forwarders.
- `PlaywrightError` distinguished timeout from other failures by a `reason` string (`CONST-D2`).

## Alternatives

|   | Design                                                                                                                     | Verdict                                                                                                                                                                                     |
| - | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A | Hand-written mirror of the Playwright surface (upstream's design)                                                          | Rejected: pass-through by construction; drifts on every Playwright release; cyclic wrapper graph.                                                                                           |
| B | Two lifting primitives over raw Playwright objects (`attempt`, `acquire`) plus the few operations with their own semantics | **Chosen**: no forwarding code; every Playwright overload and option keeps its exact type; new Playwright methods work on day one.                                                          |
| C | A `Proxy` that lifts every promise-returning method automatically, typed by a mapped type                                  | Rejected: a mapped type over an overloaded method keeps only the last overload (`evaluate`, `waitForEvent`, `on`), so types degrade silently; the proxy needs unchecked casts (`CONST-B5`). |

B costs call-site brevity: `yield* attempt(() => page.goto(url))` instead of `yield* page.goto(url)`. That is the price of dropping the mirror, and it buys exact Playwright types.

## Surface

Root entry `@systemfsoftware/effect-playwright`:

- `PlaywrightTimeout`, `PlaywrightFailure`: one tagged error per failure (`CONST-D2`), each with `message` and the original error as `cause`. `PlaywrightError` is their union.
- `attempt(run)`: `Effect<A, PlaywrightError>` from a Playwright call, deferred until run.
- `acquire(open)`: `Effect<A, PlaywrightError, Scope>` for anything Playwright can dispose (`Browser`, `BrowserContext`, `Page`, the `Disposable` returned by `route`/`addInitScript`/`exposeBinding`); disposed when the scope closes.
- `pageEvents`, `browserContextEvents`, `browserEvents`: a `Stream` of one event that ends when its source closes or disconnects, including a source that already had.
- `expose(target, { name, run })`: installs a page-callable function whose calls run an Effect with the caller's services; removed when the scope closes.
- `Browser`, `BrowserContext`, `Page`: services holding the raw Playwright objects. `Browser.layer(open)` provides one browser for a layer's lifetime.
- `chromium`, `firefox`, `webkit` re-exported from `playwright-core`.

`./test` entry: `test.effect`, `layer`, `makeMethods` for Playwright Test, providing the fixture `browser`, `context`, and `page` as the services above.

Dropped: the `./experimental` entry (two one-line traversals and a stream composable from `browserContextEvents` + `pageEvents`), `PlaywrightSpawner` (`Browser.layer` plus `acquire` cover it), and every forwarding wrapper. The `effect-playwright` CLI stays: it installs the browser build that matches the bundled `playwright-core`.

## Verification

Gherkin capability features against real headless chromium, one per capability:

1. Calling Playwright: a value comes back; a timeout fails as `PlaywrightTimeout`; any other rejection fails as `PlaywrightFailure` with the original error as cause; nothing runs until the effect runs.
2. Lifetimes: a launched browser, a context, and a page close when their scope closes, innermost first; a CDP connection detaches without stopping the browser; a disposable route stops answering.
3. Events: events arrive in order; a stream ends when its page closes, when its context closes, when its browser disconnects, and at once when the source had already ended.
4. Page callbacks: page code gets the Effect's value; the Effect sees the program's services; a failing Effect rejects in the page; the function is gone after its scope closes.
5. Browser layer: programs in the layer share one browser; the browser closes when the layer is released.

The `./test` entry keeps its four Playwright-runner journeys under `e2e/`, run against source.

## Done

- `pnpm check:local` exits 0; PR #550 CI green.
