---
title: A test never starts a child process; one that does is not a behaviour test and fails
applies_when:
  - a test, Feature, fixture or helper starts a process (child_process, Bun.spawn, Deno.Command, an effect platform Command, execa, a shell)
  - a test runs git, a package manager, a build tool or the package's own CLI binary, or writes a shim script for one
  - testing a command-line tool or code that shells out
tags: [testing, behaviour-test, child-process, cli, git, shim, stand-in]
---

No test starts a child process: not git, not a package manager or build tool, not a shell, not the package's own CLI binary, and not a shim script written to stand in for one. A Feature that does is not a behaviour test of our system; it tests the host's binaries, their versions and their output formats, and it fails.

A command-line tool is tested by calling its entry function in the test's own process through the package's published surface, with each thing it reads from outside (the repository's history, the build tool's plan, the filesystem) reached through a port. The scenario provides those ports' layers and reads what the entry returns or reports. Code under test that must run another program does so inside one boundary adapter behind such a port; the code that calls that port is what the Feature specifies, and the adapter itself is outside every test.

Decision: the judge fails the file, the Feature or the PR if any test, fixture, step or helper it runs starts a process, runs git or a CLI binary, or writes an executable shim (a chmod +x on a fixture counts). There is no exception for a "live" Feature, a recorded capture replayed by a shim, or a fixture repository. An uncertain case escalates.

Defect it prevents: a test that spawns git or a build tool passes or fails with the host's binaries, their versions and their output format, and a shim that replays a recorded capture pins a third party's wire format inside the fixture; neither says whether our code does what its consumer needs.

```typescript
// WRONG
Feature('Reading the affected plan')
  .live('the plan command runs git and the build tool as child processes')
// with a fixture that writes .fixture-shims/<tool> and runs chmod +x on it
```

```typescript
// RIGHT: the entry runs in-process; the repository and the build tool are ports with scenario layers
When('the affected plan is read')('plan', () => Plan.affected({ base }).pipe(Effect.result)),
Then('only the changed packages are planned')((s, expect) =>
  expect(s.plan).toEqual(Result.succeed(['answer']))),
```

Source: owner ruling, 2026-10-28: "NO GIT AS CHILD PROCESS. ANYTHING THAT RUNS A CHILD PROCESS IS AUTOMATIC FAIL", "NOT A BDD TEST".

Gate: judge
