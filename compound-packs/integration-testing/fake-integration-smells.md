---
title: A test that shows any fake-integration smell is not an integration test and fails
applies_when:
  - reviewing or writing an integration test, a Feature or its fixtures
  - a test passes but nobody can say which behaviour of ours it would catch breaking
tags: [integration, smells, mocks, shims, stand-in, child-process, review]
---

Each of these marks a test that looks like integration but proves nothing about our system. One is enough to fail it:

1. It starts a child process: git, a CLI, a build tool, a shell, a server.
2. It writes an executable shim, or replays a recorded capture of a third party's output through one.
3. It does IO on the host: a temp directory, a host port, a developer's running service.
4. It replaces a driver, binding or client (HttpClient, a database client, a platform binding) with a mock, spy, `vi.fn` or a hand-built object.
5. Its Then reads what a stand-in received (method, URL, header, body) instead of what our caller gets back.
6. Its subject is a third party's API or wire format rather than our system's behaviour.
7. It is named live, real or end-to-end but runs nothing a person or caller would.
8. It was deleted, with its test target, and the package it covered stayed (the testing pack's a-package-that-cannot-be-specified-is-removed-or-redesigned).

Decision: the judge lists every smell it finds with the file and line, and fails the test on any one. An uncertain case escalates.

Defect it prevents: a suite that is green on smells is green whatever our code does; it costs review and CI time and hides that the behaviour is untested.

Source: owner rulings, 2026-10-28: "NO GIT AS CHILD PROCESS. ANYTHING THAT RUNS A CHILD PROCESS IS AUTOMATIC FAIL", "fake integration smells to avoid like CHILD PROCESS", "IM TIRED OF THE DUMPSTIER TIER TEST SUITES THAT DONT TEST ANYTHING USEFUL", and on a third-party API suite: "YOU DONT TEST OPENROUTER. OPENROUTER IS NOT A BEHAVIOUR."

Gate: judge
