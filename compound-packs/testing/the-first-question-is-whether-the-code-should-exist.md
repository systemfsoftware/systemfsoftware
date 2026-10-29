---
title: Before a test is ordered or written for existing code, the decisions that code owns are named, and code that owns none is removed, never tested
applies_when:
  - an issue, plan, order or review finding whose objective is tests, Features or property laws for code that already exists
  - a review finding or testing gap says code has no test, zero tests or too few tests
  - adding a package, CLI, bin or subcommand
tags: [testing, existence, platform, reuse, deletion, coverage, scope]
---

The first question about existing code that a test would cover is whether the code should exist. Before any test, Feature or property law is ordered or written for it, the unit's plan file (`docs/plans/*.md`, committed in the PR) and its issue carry an `Owned decisions:` block. The block lists each choice, branch or computation the code makes that no platform command or runtime API, existing systemfsoftware tool or upstream release already makes. Each entry gives the file:line that makes it, for code that exists, and the platform command, API or tool that was checked, with its reference URL. A quote from that reference is required only where the block says the platform already does the job. Running, wrapping, re-running or porting a platform command or an existing tool is not a decision. A new package, CLI, bin or subcommand carries the same block, naming the decisions it will own.

Exactly one outcome follows:

- **The block is empty.** The code is removed. Each caller invokes the platform command or the existing tool directly, as a config line, a workflow step or a package script, and no test is ordered or written for the code.
- **Part of the code duplicates the platform.** That part is removed in the same change, and only the listed decisions are specified.
- **Every part is listed.** The other rules of this pack decide how each decision is tested.

This rule decides scope, and no issue, order, contract or plan overrides it. A plan whose order demands tests for code with no owned decision stops and reports that to whoever ordered it. "No test" is never a finding or an issue on its own. A finding names an untested owned decision with its file:line, or names a duplicate of the platform as removable. Pre-existing duplication is no defence for keeping the code and no reason to test it. A regression test added in the same change as the fix it guards is out of scope.

Decision: the judge fails a PR when it adds or orders tests, Features or property laws for code that existed before the PR, or adds a package, CLI, bin or subcommand, and any of these holds:

- no file in the diff carries an `Owned decisions:` block;
- an entry for existing code gives no file:line or no reference URL;
- the block says the platform does a job and quotes nothing;
- the block is empty and tests are added anyway;
- in a source file the block covers, the judge finds a branch, choice or computation beyond invoking the platform that the block leaves out.

An uncertain case escalates.

Defect it prevents: a wrapper around a platform command gets a test suite larger than itself, because the rules that demanded coverage left an artifact and the question of whether the wrapper should exist left none; the suite pins the platform's behaviour, and its cost rides on every later change.

```markdown
<!-- WRONG: a "no test" finding becomes an order to test a wrapper; nobody asks what it decides -->

Objective: cover tooling/frozen-check with Features, one per capability, that drive its bin.
Done when: each capability has a Feature that runs in CI.
```

```markdown
<!-- RIGHT -->

Owned decisions:

- none: tooling/frozen-check/src/main.ts:12 only runs `pnpm install --frozen-lockfile`;
  https://pnpm.io/cli/install: "In a CI environment, installation fails if a lockfile is present but needs an update."
  Objective: remove tooling/frozen-check; the CI step runs pnpm directly.
  Done when: `git grep -n -e tooling/frozen-check origin/main` prints nothing.
```

Source: the owner, 2026-10-29: "Pin the lock file with BDD tests. testing a lockfile. bdd for a lockfile.... what sort of rediculous insanity lead us to this point?". Kent Beck (https://stackoverflow.com/a/153565): "I get paid for code that works, not for tests, so my philosophy is to test as little as possible to reach a given level of confidence". Jeff Atwood, The Best Code is No Code At All (https://blog.codinghorror.com/the-best-code-is-no-code-at-all/).

Gate: judge
