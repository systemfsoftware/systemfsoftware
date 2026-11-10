---
title: An end-to-end test lives in the project's own E2E package and drives the real processes the system ships as
applies_when:
  - a behaviour needs the real CLI binary, a real server process, or several services running together
  - deciding where a test that starts processes belongs
  - adding services an E2E run needs
tags: [e2e, effect-e2e, real-processes, tiers]
---

Put end-to-end tests in a package of their own (such as `apps/<service>-e2e`) and nowhere else: never in a package's `tests/` beside its integration tests, and never named or shaped as an integration test.

An E2E run drives the system as it ships (the real binary or server) with its services running alongside, and asserts what a person or calling system observes: an HTTP response, a page, a CLI's output and exit, state read back through the system's own API. It never imports the code under test's internals.

A behaviour that needs real IO is preferably specified here, through effect-e2e, rather than as a Feature that stubs the IO or does none. Such a Feature is deleted (testing pack: features-specify-our-systems-observable-behaviour.md).

Write every e2e test with effect-e2e (`@systemfsoftware/effect-e2e`, `@systemfsoftware/effect-e2e/runner`). Its bar is the [`e2e`](https://www.npmjs.com/package/e2e) runner ([tester-army/e2e](https://github.com/tester-army/e2e)): the same test API, locator actions and matchers, fixtures, replay cache and CI run shape. The examples in this pack are written to that bar in effect-e2e's names.

effect-e2e does not meet the bar yet. It exports no locator actions (`tap`, `fill`, `press`, `check`, `select`, `hover`), no `toHaveCount` or `toHaveURL`, no `browser` fixture, no `test.extend`, no sign-in sessions and no serial `describe`. Bringing it to the bar is effect-e2e's own work. Until a feature lands, a test that needs it waits for that work; it is never written around the gap and never moved to another runner.
