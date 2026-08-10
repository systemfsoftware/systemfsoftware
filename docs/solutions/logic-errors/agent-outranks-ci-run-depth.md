---
title: One CI variable read two ways gave agent runs the thousand-draw forge path
date: "2026-08-09"
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
  - packages/vitest-config
  - packages/effect-gherkin-spec
  - packages/effect-schema-law
  - packages/effect-daemon-spec
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

- The property suites drew the _thorough_ sample count. In `packages/effect-gherkin-spec/vitest.setup.ts` and `packages/effect-schema-law/vitest.setup.ts` the pre-fix presence test classified the agent run as CI, so `numRuns` resolved to `1000` — the tenfold draw intended for a real forge.
- Simultaneously the shared base treated the same run as local. Its pre-fix equality test classified the agent run as not-CI, so reporters stayed on the local `json` form and `coverage.enabled` stayed off.

Measured environment of this agent shell: `AGENT=1`, `CI=1`, `GITHUB_ACTIONS` unset, `TERM=dumb`, `process.stdout.isTTY` undefined.

## What Didn't Work

There was no long failed hunt here — the defect surfaced while investigating unrelated cache misses. What belongs in this section is the _reasoning trap_ that makes the natural fix wrong.

The natural fix is to make every site read `CI === 'true'`, matching GitHub Actions. That is wrong. GitHub Actions writes the literal `"true"`, this agent shell writes `"1"`, and a foreign CI may write anything non-empty. Forcing equality on every site would silently reclassify every non-GitHub forge as local — it moves the disagreement from "some sites said CI" to "no site ever says CI", which is worse because it is uniform and therefore invisible.

Presence beats equality because **presence is the only signal every producer agrees on**: every producer that means "I am CI" sets the variable to _something_, and no two of them agree on what. A presence test never misclassifies a real forge as local; an equality test misclassifies every forge that does not write the exact compared string.

## Solution

One exported predicate in `packages/vitest-config/lib/base.js`; the four duplicate definitions deleted and replaced by an import.

### Pre-fix state (recovered from `git show ef47ba9b06^`)

- `packages/vitest-config/lib/base.js` — equality against `"true"`, with a `GITHUB_ACTIONS` disjunct:

  ```js
  const isCI = process.env['CI'] === 'true' || process.env['GITHUB_ACTIONS'] !== undefined
  const isAgent = !isCI && !process.stdout.isTTY
  ```

  Note that the pre-fix `isAgent` was _inferred_ — not CI and not a TTY — rather than read directly. GitHub Actions writes the literal `"true"` and the agent shell writes `"1"`, so this site alone said false under an agent.

- `packages/effect-gherkin-spec/vitest.setup.ts` and `packages/effect-schema-law/vitest.setup.ts` — presence form:

  ```js
  const isCi = typeof env.CI === 'string' && env.CI.length > 0
  ```

- `packages/effect-daemon-spec/vitest.setup.ts` — `Boolean(process.env.CI)` inside a `Match` expression, feeding `numRuns = { stryker: 30, local: 100, ci: 1000 }[mode]`.

- `packages/rx-effect/vitest.config.ts` — truthiness: `testTimeout: process.env.CI ? 60_000 : 30_000`.

For an environment variable, whose value is always a string or `undefined`, the last three forms are semantically identical: `Boolean(x)`, `x.length > 0` and truthiness all mean set-and-non-empty. So the split is two semantics in four syntactic forms, not four semantics — which is exactly why it survived review. The forms look different enough to seem intentional and behave identically until a producer writes something other than `"true"`.

### Post-fix state (current tree)

`packages/vitest-config/lib/base.js:10` — the single exported predicate:

```js
export const isCI = !isAgent && typeof process.env['CI'] === 'string' && process.env['CI'].length > 0
```

with `isAgent` as `process.env['AGENT'] !== undefined` (`base.js:6`) and `isGithubActions` as `process.env['GITHUB_ACTIONS'] !== undefined` (`base.js:12`). The type declaration is `packages/vitest-config/lib/base.d.ts:5`, exported at `:7`.

The four consumers now import it rather than redefining it: `packages/effect-gherkin-spec/vitest.setup.ts:2` (used at `:7`), `packages/effect-schema-law/vitest.setup.ts:1` (used at `:11`), `packages/effect-daemon-spec/vitest.setup.ts:1` (used at `:7`), and `packages/rx-effect/vitest.config.ts:1` (used at `:7`).

## Why This Works

Three design decisions, each deliberate and each separable.

1. **Presence, not equality.** Presence is the only signal every producer agrees on. Testing against any one literal classifies every other producer as local; presence never does.

2. **AGENT outranks CI.** An agent run is a dev run and wants fast feedback, so the thorough tenfold draw is reserved for a real forge. `isCI` is false whenever `AGENT` is set, even though `CI` is also set. This also replaces the old _inferred_ `isAgent = !isCI && !process.stdout.isTTY` with an explicit signal — the inference was fragile precisely because a TTY check is a proxy for agency rather than a statement of it.

3. **Reporter and coverage split on what the setting answers.** `reporters` keys on `GITHUB_ACTIONS` (`base.js:30`) because it answers _who reads this output_; `coverage.enabled` keeps `isCI` (`base.js:35`) because coverage is a thoroughness decision. Under an agent run `isCI` is false and the reporter stays on the local `json` form, which is correct — nothing reads agent output as a GitHub Actions report.

### The cache-key half

`AGENT` was added to turbo's `test` and `mutation` env keys because it now changes the answer. In the current tree the `test` task env is `["NODE_ENV", "CI", "AGENT"]` and the `mutation` task env is `["NODE_ENV", "CI", "AGENT"]`.

The invariant is plain: **a variable that changes a task's answer must be in that task's key, or the cache serves one caller's result to another.** Before this change an agent run and a forge run differed only in `AGENT`, so a key omitting it would have served a hundred-draw result to a caller asking for a thousand.

### Qualifying the sibling doc

[A turbo cache that is never warm](../performance-issues/turbo-cache-never-warm.md) removed `AGENT` from the `lint` task's key, and generalized that into a prevention rule against ever keying on `AGENT`. **That generalization is too broad, and this learning is the counterexample.** The two moves are opposite on different tasks and both correct, because the governing rule is narrower than either:

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

## Related

- [A turbo cache that is never warm has its causes in the key, not the storage](../performance-issues/turbo-cache-never-warm.md) — closest neighbour, and **partially contradicted by this learning**. Its symptom "the same task hashes differently depending on whether an agent, a human, or CI invoked it" is the same phenomenon from the cache side, and its own narrower reasoning is correct; only its generalized "never key on `AGENT`" bullet over-reaches. See the qualification above.
- [Enabling a turbo cache requires a complete input hash](../tooling-decisions/turbo-cache-requires-complete-input-hash.md) — the doctrine antecedent. Its rule that anything whose change can change the verdict belongs in the key is exactly what adding `AGENT` to `test` and `mutation` applies. Note its worked example showing the `lint` env as `["NODE_ENV", "AGENT", "GITHUB_ACTIONS"]` is stale against the tree, which now reads `["NODE_ENV", "GITHUB_ACTIONS"]`.
- [A dead vite-tsconfig-paths plugin was most of every vitest wall clock](../performance-issues/dead-vite-tsconfig-paths-plugin.md) — same session, same packages, same vitest wall-clock investigation, but a disjoint defect. Related by circumstance rather than by mechanism.
- [`../../../CONCEPTS.md`](../../../CONCEPTS.md) — the `machine mode (stryker CLI)` entry already defines `AGENT` as set to any non-empty value, which is the same presence-not-equality convention this learning codifies for `CI`. The `Key partition` entry in the Build cache cluster states the general test this learning applies per task.
