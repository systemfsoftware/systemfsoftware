---
title: Browser-mode test toolchain for atom-react
date: "2026-08-14"
module: systemfsoftware
problem_type: tooling_decision
component: packages/effect-atom/atom-react
severity: medium
applies_when:
  - React component tests exercise browser-only APIs (useSyncExternalStore server snapshots, Suspense, real DOM)
root_cause: test_environment_gap
resolution_type: tooling_change
tags:
  - vitest
  - playwright
  - browser-mode
  - react
---

# Browser-mode test toolchain for atom-react

## Candidates

1. **Vitest browser mode with playwright chromium** — real chromium, real DOM, real `useSyncExternalStore`/Suspense semantics.
2. **jsdom** — fast, no browser binary, but fakes the DOM and cannot exercise browser-only code paths or real layout.
3. **happy-dom** — lighter than jsdom but shares the same fundamental gap: it is not a browser.

## Deciding criterion

`atom-react`'s `Hooks.ts` depends on React 19 `useSyncExternalStore` server-snapshot behavior and Suspense; those semantics only hold in a real browser. jsdom/happy-dom would let tests pass while the shipped browser behavior is broken — the exact silent-pass failure the test environment exists to catch. Playwright chromium gives the real runtime; the only cost is the browser binary, which the CI gate installs (`pnpm exec playwright install chromium`).

## Reversing observation

The choice is a single-file change in `atom-react/vitest.config.ts` (`provider: 'playwright'`). Reversing means switching the provider to jsdom/happy-dom and rewriting `expect.element` assertions back to DOM queries — contained to the test setup.
