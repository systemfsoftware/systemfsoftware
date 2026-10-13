---
title: The command run before pushing is the pull-request gate's own definition, with only resource knobs free to differ
applies_when:
  - changing a root gate script (`check:*`, `gate:*`) or the command an agent instruction file tells an agent to run before pushing
  - adding or removing a task, a depth profile or an environment switch in a pull-request gate job
  - adding a check that runs only in CI, or only locally
tags: [ci, gates, local, presubmit, agents, workflows, wall-clock]
---

A coding agent runs one command before it pushes and reads its result as the pull request's likely verdict. When that command is a second definition of the gate, the two drift, and the agent learns about the difference from CI, a round trip later. #510 (`13fab8d87b`, 2026-09-24) gave `check:local` its own task list and `CONFORMANCE_PROFILE=local`, while the CI gate ran the unset, ten-times-heavier profile; the CI gate grew from about 7.5 minutes to past its 45-minute timeout, and the solution doc's Prevention line says `check:local` "runs the `local` profile and cannot show it" (`docs/solutions/performance-issues/ci-gate-silent-then-timed-out-after-kernel-exploration.md:9,41,59`). The reverse also happens: a stale `dist/` failed `dts:check` locally "while CI, building from an empty tree, stayed green" (`1c78b6959b`).

## Rule

The command run before pushing calls the pull-request gate's own definition: the same tasks, the same depth profile and the same tree preconditions, with only resource knobs (worker counts, turbo concurrency) free to differ.

- **One definition:** the local command invokes the script the PR gate job runs, or the job invokes the local command; neither re-lists the other's tasks.
- **Same depth:** a profile, seed count, timeout or test filter that changes what a test proves is the PR gate's value locally too. Worker counts and concurrency only change how fast, so they may differ.
- **Same tree:** a precondition the PR gate gets from a fresh checkout (an empty `dist/`, a frozen install) is part of the definition; the local command restores it or the gate's own tasks do.
- **Same projects:** a project the PR gate runs that the host cannot (one needing `/dev/kvm`, another OS, a credential) stays in the local command and reports the missing capability by name, as a skip whose title names it or as a failure, never as a silent pass; a local green then reads as green except those projects. In this repo the microVM package's integration project skips locally with the reason in its title and fails in CI without `/dev/kvm` (`packages/daemon/effect-daemon-microvm/AGENTS.md:12`, MV-A2).
- **Both sides in one diff:** a diff that adds a task, profile or switch to one side changes the other in the same diff.
- Main-only depth (postsubmit suites, a heavier profile on main) is outside this equality; `heavy-suites-judge-every-main-commit` governs it.

```json
// WRONG: systemfsoftware/systemfsoftware 13fab8d87b:package.json:16-17,21,23
// #510: the local gate re-lists the tasks, drops `attw`, and sets a lighter profile CI never ran.
    "gate:tasks": "pnpm test:scripts && pnpm guard:projects && turbo --concurrency=${TURBO_CONCURRENCY:-50%} --continue lint lint:tsgo typecheck test test:types attw check",
    "gate:local": "pnpm test:scripts && pnpm guard:projects && turbo --concurrency=${TURBO_CONCURRENCY:-100%} build && turbo --concurrency=${TURBO_CONCURRENCY:-100%} --continue lint lint:tsgo typecheck test test:types check",
    "check:ci": "s=0; pnpm format:check || s=1; TURBO_CONCURRENCY=${TURBO_CONCURRENCY:-100%} pnpm gate:tasks || s=1; pnpm gate:dist || s=1; exit $s",
    "check:local": "s=0; ./bin/dprint check || s=1; CONFORMANCE_PROFILE=local VITEST_MAX_WORKERS=${VITEST_MAX_WORKERS:-4} pnpm gate:local || s=1; exit $s",

// WRONG: systemfsoftware/systemfsoftware 8d07118079:package.json:17,19
// Still two lists: the PR gate's `gate:tasks` runs `attw`; `gate:local`, which `check:local` runs, does not.
    "gate:tasks": "pnpm gate:repo && turbo --concurrency=${TURBO_CONCURRENCY:-50%} --continue lint lint:tsgo typecheck test:types attw check",
    "gate:local": "pnpm gate:repo && turbo --concurrency=${TURBO_CONCURRENCY:-100%} build && turbo --concurrency=${TURBO_CONCURRENCY:-100%} --continue lint lint:tsgo typecheck test test:types check",

// RIGHT: systemfsoftware/pnpm-release-management b9b4a1d:package.json:33 and CONTRIBUTING.md:17-18
// One script is the gate; CI runs it and the contributor guide tells everyone to run it:
// "Run the same commands locally that CI runs; `pnpm check:ci` is all of them, and CI fails when any one does."
    "check:ci": "s=0; pnpm format:check || s=1; TURBO_CONCURRENCY=${TURBO_CONCURRENCY:-100%} pnpm gate:tasks || s=1; pnpm gate:dist || s=1; exit $s",

// RIGHT: neutral shape, no citation. The local command is the gate plus resource knobs only.
    "check:local": "VITEST_MAX_WORKERS=${VITEST_MAX_WORKERS:-4} TURBO_CONCURRENCY=${TURBO_CONCURRENCY:-50%} pnpm check:ci",
```

In this repo the PR gate's `check:ci` is documented as "everything reusable-checks.yml runs" (`.github/AGENTS.md:10`), while root `AGENTS.md` REPO-D1 names `pnpm check:local` as the delivery gate (`AGENTS.md:67`). Which name survives is not this rule's decision; that they are one definition is. `docs/solutions/logic-errors/agent-outranks-ci-run-depth.md:138` records a third difference, "An agent's green `check:local` is not evidence for CI's configuration", because an `AGENT` variable outranks `CI` for depth and timeouts; under this rule that difference is a divergence unless it only changes speed.

Gate: `review`. Does the diff make the pull-request gate run a task, depth profile, environment switch or tree precondition that the documented pre-push command does not, or the reverse, or define the pre-push command apart from the gate's own script instead of calling it? Does it let a project the gate runs pass silently on a host that cannot run it, instead of naming the missing capability?
