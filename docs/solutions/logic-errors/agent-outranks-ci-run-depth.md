---
title: One CI variable read two ways gave agent runs the thousand-draw forge path
date: "2026-08-09"
last_updated: "2026-09-22"
category: logic-errors
module: systemfsoftware
problem_type: logic_error
component: testing_framework
symptoms:
  - "Agent shell runs drew 1000 fast-check property samples instead of the 100 intended for a dev run"
  - "The same CI=1 value classified as local by the shared vitest base and as CI by the per-package setup files"
  - "Five call sites derived the CI boolean two incompatible ways, so one value answered differently at each"
  - "No error and no crash - two halves of one run silently disagreed about what CI meant"
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - packages/toolchain/vitest-config
  - packages/gherkin/effect-gherkin-spec
  - packages/schema/effect-schema-law
  - packages/daemon/effect-daemon-spec
  - packages/rx-effect
  - turbo.json
tags:
  - ci
  - environment-variable
  - vitest-config
  - property-testing
  - fast-check
  - cache-key
  - agent
---

# One CI variable read two ways gave agent runs the thousand-draw forge path

## Problem

Five call sites read the `CI` environment variable through two incompatible semantics — equality against `"true"`, and presence — written in four different syntactic forms. One value therefore classified differently at different sites. This agent shell sets **both** `AGENT=1` and `CI=1`. The shared vitest base tested `CI === 'true'` and said "local", while the per-package setup files tested presence and said "CI". Agent runs consequently drew 1000 property samples (the slow path meant for a real forge) while the shared base's reporter and coverage decisions read the same variable as false.

The fix is commit `ef47ba9b06` (`fix(vitest-config): let agent outrank ci when choosing run depth`). It is local to `main` and not yet on `origin/main` (`origin/main` tip is `e1cfc7c6f9`), so the SHA may be rewritten on a future push — search the commit by subject line rather than by this hash.

## Symptoms

Under the agent shell the failure was concrete and observable, but silent: no error, no crash — two parts of the same run disagreed about what "CI" meant.

- The property suites drew the _thorough_ sample count. In the `vitest.setup.ts` of `@systemfsoftware/effect-gherkin-spec` and of `@systemfsoftware/effect-schema-law`, the pre-fix presence test classified the agent run as CI, so `numRuns` resolved to `1000` — the tenfold draw intended for a real forge.
- Simultaneously the shared base treated the same run as local. Its pre-fix equality test classified the agent run as not-CI, so reporters stayed on the local `json` form and `coverage.enabled` stayed off.

Measured environment of this agent shell: `AGENT=1`, `CI=1`, `GITHUB_ACTIONS` unset, `TERM=dumb`, `process.stdout.isTTY` undefined.

## What Didn't Work

There was no long failed hunt here — the defect surfaced while investigating unrelated cache misses. What belongs in this section is the _reasoning trap_ that makes the natural fix wrong.

The natural fix is to make every site read `CI === 'true'`, matching GitHub Actions. That is wrong. GitHub Actions writes the literal `"true"`, this agent shell writes `"1"`, and a foreign CI may write anything non-empty. Forcing equality on every site would silently reclassify every non-GitHub forge as local — it moves the disagreement from "some sites said CI" to "no site ever says CI", which is worse because it is uniform and therefore invisible.

Presence beats equality because **presence is the only signal every producer agrees on**: every producer that means "I am CI" sets the variable to _something_, and no two of them agree on what. A presence test never misclassifies a real forge as local; an equality test misclassifies every forge that does not write the exact compared string.

## Solution

One exported predicate in the shared vitest base (`@systemfsoftware/vitest-config`); the four duplicate definitions deleted and replaced by an import.

### Pre-fix state (recovered from `git show ef47ba9b06^`)

- The shared vitest base (`@systemfsoftware/vitest-config`) — equality against `"true"`, with a `GITHUB_ACTIONS` disjunct:

  ```js
  const isCI = process.env['CI'] === 'true' || process.env['GITHUB_ACTIONS'] !== undefined
  const isAgent = !isCI && !process.stdout.isTTY
  ```

  Note that the pre-fix `isAgent` was _inferred_ — not CI and not a TTY — rather than read directly. GitHub Actions writes the literal `"true"` and the agent shell writes `"1"`, so this site alone said false under an agent.

- The `vitest.setup.ts` of `@systemfsoftware/effect-gherkin-spec` and of `@systemfsoftware/effect-schema-law` — presence form:

  ```js
  const isCi = typeof env.CI === 'string' && env.CI.length > 0
  ```

- The `vitest.setup.ts` of `@systemfsoftware/effect-daemon-spec` — `Boolean(process.env.CI)` inside a `Match` expression, feeding `numRuns = { stryker: 30, local: 100, ci: 1000 }[mode]`.

- The vitest config of `@systemfsoftware/rx-effect` — truthiness: `testTimeout: process.env.CI ? 60_000 : 30_000`.

For an environment variable, whose value is always a string or `undefined`, the last three forms are semantically identical: `Boolean(x)`, `x.length > 0` and truthiness all mean set-and-non-empty. So the split is two semantics in four syntactic forms, not four semantics — which is exactly why it survived review. The forms look different enough to seem intentional and behave identically until a producer writes something other than `"true"`.

### Post-fix state (current tree, re-read 2026-09-25)

The shared base (`@systemfsoftware/vitest-config`, `lib/base.js`) holds the single exported predicate:

```js
export const isCI = !isAgent && typeof process.env['CI'] === 'string' && process.env['CI'].length > 0
```

with `isAgent` as `process.env['AGENT'] !== undefined`.

The per-package setup files that imported it at fix time are gone. The base now owns the property-draw tier itself — `propertyRuns` is 30 under a Stryker worker, 1000 when `isCI`, 100 otherwise — and hands it to the runner through `provide`. The one remaining direct consumer is `@systemfsoftware/rx-effect`'s vitest config, which widens its test timeout when `isCI`.

## Why This Works

Three design decisions, each deliberate and each separable.

1. **Presence, not equality.** Presence is the only signal every producer agrees on. Testing against any one literal classifies every other producer as local; presence never does.

2. **AGENT outranks CI.** An agent run is a dev run and wants fast feedback, so the thorough tenfold draw is reserved for a real forge. `isCI` is false whenever `AGENT` is set, even though `CI` is also set. This also replaces the old _inferred_ `isAgent = !isCI && !process.stdout.isTTY` with an explicit signal — the inference was fragile precisely because a TTY check is a proxy for agency rather than a statement of it.

3. **Each setting keys on what it answers.** `isCI` selects the CI reporters (`agent` and `github-actions`) as well as the thorough draw; coverage no longer keys on CI at all but on an explicit `COVERAGE=true`, so a thoroughness decision and a reporting decision are asked for separately. Under an agent run `isCI` is false, so the agent gets neither the CI reporters nor the 1000-draw tier; it gets `bail: 1` and `passed-only` output instead.

### The cache-key half

`AGENT` was added to turbo's `test` and `mutation` env keys because it now changes the answer; both keys still carry it alongside `CI`.

The invariant is plain: **a variable that changes a task's answer must be in that task's key, or the cache serves one caller's result to another.** Before this change an agent run and a forge run differed only in `AGENT`, so a key omitting it would have served a hundred-draw result to a caller asking for a thousand.

### Qualifying the sibling doc

[A turbo cache requires a complete input hash](../tooling-decisions/turbo-cache-requires-complete-input-hash.md) shows the permanent-miss direction of the same doctrine: a cache that is cold (the key moves when the answer did not). This learning is the opposite direction on a different task: **that generalization is too broad.** Same variable, same repo, opposite correct answers, decided per task by what the variable actually changes.

> Key on a variable if and only if it can change that task's answer.

For `lint`, `AGENT` selected `--format=unix --quiet`, which changes output presentation and never the pass/fail verdict — so keying on it bought no safety and cost every hit. For `test` and `mutation`, `AGENT` selects 100 draws against 1000 — a different verdict, cheaply mistaken for the same one. Same variable, same repo, opposite correct answers, decided per task by what the variable actually changes.

## Prevention

- **Find divergent readings of one variable before they diverge in behavior.** From the repo root:

  ```sh
  grep -rnE "env\.CI|env\['CI'\]|env\[\"CI\"\]|process\.env\.CI" packages/ --include='*.ts' --include='*.js'
  ```

  Inspect each hit for its comparison form. The check passes when every hit either imports the shared predicate or _writes_ the variable — never a second reader with its own comparison. After this fix none of the four consumers mentions `process.env.CI` at all; they import `isCI`.

- **One variable, one predicate, exported from one place.** A second definition is a second opinion, and two opinions diverge the moment a producer writes a value one of them does not expect. The divergence is silent until then, which is why it survives code review.

- **Prefer presence to equality for any "am I in environment X" variable.** Producers agree that the variable is set and agree on nothing else. Reserve equality for a variable whose exact values you own.

- **A boolean derived from the environment is a decision, so it belongs in a cache key — but only where it changes the answer.** Both halves bind. Omit an answer-changing variable and the cache serves one caller's result to another; include a presentation-only variable and you partition the cache by who ran it, paying on every invocation for nothing.

- **An agent's green `check:local` is not evidence for CI's configuration.** Because `AGENT` outranks `CI`, an agent shell never runs with the 30 s timeout, the CI reporters, or the forge draw count. A test that is sensitive to that configuration passes every local run and fails only in CI. The observed case, from when coverage still keyed on `CI`, is a test that runs a nested `startVitest` against the package's own config: under `CI` the nested run turned V8 coverage on inside an already-instrumented process and reported no annotations. The fix is `coverage: { enabled: false }` on the nested run, because that run is the instrument and not the subject. Reproduce CI's configuration before pushing a change that touches runner configuration or nests a runner:

  ```sh
  env -u AGENT CI=true pnpm --filter <pkg> test
  ```

## Related

- [A turbo cache requires a complete input hash](../tooling-decisions/turbo-cache-requires-complete-input-hash.md) — the doctrine antecedent covering all three failure modes: false green, permanent miss, and entry-point variance. Its rule that anything whose change can change the verdict belongs in the key is exactly what adding `AGENT` to `test` and `mutation` applies. The `lint` env has moved since either doc was written: the current tree keys `lint` on `AGENT` again, next to `OXLINT_FORMAT`.
