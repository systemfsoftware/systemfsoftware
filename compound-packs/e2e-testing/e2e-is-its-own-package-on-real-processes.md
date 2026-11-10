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

Write every e2e test with effect-e2e (`@systemfsoftware/effect-e2e`, `@systemfsoftware/effect-e2e/runner`). Its bar is the [`e2e`](https://www.npmjs.com/package/e2e) runner ([tester-army/e2e](https://github.com/tester-army/e2e)): the same test API, locator actions and matchers, fixtures, replay cache and CI run shape. The examples in this pack use what effect-e2e exports; a line that needs more is marked as waiting on effect-e2e.

Bringing effect-e2e to that bar is effect-e2e's own work. Whatever a test needs that effect-e2e does not export yet waits for that work: the test is never written around the gap and never moved to another runner. The pack lists no missing features, because such a list is stale as soon as effect-e2e ships; read effect-e2e's own exports. When the waiting test is the replacement for a fake Feature the testing pack deletes, the deletion still lands, and the change names the behaviour left uncovered and the effect-e2e work it waits for.
