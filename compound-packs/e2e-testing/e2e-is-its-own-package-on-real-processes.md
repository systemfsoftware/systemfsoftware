---
title: An end-to-end test lives in the project's own E2E package and drives the real processes the system ships as
applies_when:
  - a behaviour needs the real CLI binary, a real server process, or several services running together
  - deciding where a test that starts processes belongs
  - adding services an E2E run needs
tags: [e2e, effect-e2e, real-processes, tiers]
---

Put end-to-end tests in a package of their own (such as `apps/<service>-e2e`) and nowhere else: never in a package's `tests/` beside its integration tests, and never named or shaped as an integration test.

An E2E run drives the system as it ships (the real binary or server) with its services running alongside, and asserts what a person or calling system observes: an HTTP response, a page, a CLI's output and exit, a row a reader can query. It never imports the code under test's internals.
