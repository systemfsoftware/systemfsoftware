---
name: task-decomposition
description: >-
  Decompose work into bounded, verifiable units before delegating to
  subagents; refuse monolithic dispatches. Use when fanning out subagents,
  parallelizing work, sizing loop work units, or when a worker runs too
  long or its output takes too long to verify. Triggers: 'split into
  subagents', 'fan out', 'parallelize', 'decompose the task'. Do not use
  for one-shot single-agent tasks.
license: MIT
metadata:
  version: "1.2.0"
---

# Task Decomposition

A subagent handed one massive task fails twice: it runs too long, and its output is too large to verify. Both are specification failures, preventable before dispatch — never after. This skill is the pre-dispatch discipline: size the unit, specify it completely, then dispatch or refuse.

Applies to any orchestrator that spawns workers: interactive fan-out, loop work-unit design, multi-agent topology planning.

<!-- BEGIN DOCTRINE KERNEL -->

Refuse monolithic dispatches: size the unit, specify it completely, then dispatch — or do the work inline.

rules:

- GATE: decomposition is mandatory when ANY hold — multi-subsystem; exceeds one focused session for the worker's model class; irreversible side effects; verification longer than the work; incompatible reasoning modes. Dispatching monolithically anyway is an invalid dispatch: split, or do it yourself.
- SPEC: every dispatched unit carries objective, write_scope, verify_commands, acceptance, size_estimate, context_paths, rollback, dependencies — written before work starts. Missing any field is undispatchable.
- CHECK: verifier is not the maker. Run each unit's verify commands fresh in your own context; never accept a worker's reported output or completeness claims. A verify failure rejects the unit: record the failure, re-dispatch with the evidence.
- FENCE: parallel units need disjoint write scopes, confirmed by comparing write_scope declarations literally — never inferred from topic. Overlap forces serialization.

Full doctrine: skill://task-decomposition — sizing calibration, the dispatch contract, rejection rules, repair-retry. Refuse monolithic dispatches: size, specify, then dispatch or refuse.

<!-- END DOCTRINE KERNEL -->

Core rules as a machine-parseable block:

```yaml
rules:
  - id: GATE
    title: Sizing gate mandatory before dispatch
    do: apply the sizing gate (multi-subsystem, exceeds one session, irreversible side effects, verification longer than work) before every subagent dispatch
    dont: skip the gate for async or background workers — the same failure modes apply
    harm: monolithic dispatches run too long, fail more often, and produce unverifiable outputs that waste the orchestrator's verification budget
    check: every dispatch is preceded by a sizing decision (decomposed vs. single-unit) recorded in the unit spec

  - id: SPEC
    title: Complete unit spec required for every dispatch
    do: write every dispatched unit with objective, write_scope, verify_commands, acceptance, size_estimate, context_paths, rollback, dependencies before the worker starts
    dont: dispatch incomplete or vague specs — "implement auth" is not a dispatch
    harm: a worker without a bounded scope produces unbounded output; verification becomes impossible
    check: every dispatch bundle has all eight fields before spawning the worker

  - id: CHECK
    title: Verifier is not the maker
    do: run per-unit verification in a fresh context on a different model lineage than the worker
    dont: accept the worker's own claims about completeness or quality
    harm: self-verified work compounds errors; the failure the worker missed drives the next unit off a wrong baseline
    check: every verify command is run in the orchestrator's context (or a dedicated verifier), never by the maker

  - id: FENCE
    title: Write scopes must be disjoint for parallel units
    do: verify that parallel units touch no overlapping files before dispatching; overlap forces serialization
    dont: infer disjointness from topic — confirm it by comparing write_scope declarations
    harm: parallel writers on overlapping files produce merge conflicts and lost work
    check: every parallel batch has a cross-write-scope comparison recorded
```

## When to Activate

- Before spawning a subagent/worker whose task exceeds one focused work session
- When designing loop work units or delegation policy
- After observing: worker runtime approaching the whole task budget, verification longer than the work, a wandering worker

Do not activate for: work one agent finishes in one sitting, deterministic pipelines, narrow read-only lookups.

For deep research problems that require comprehensive multi-source analysis with adversarial review, route by capability: a deep-research pipeline that performs tier-adaptive multi-source analysis with adversarial audit (triggers: 'deep research', 'comprehensive analysis', 'literature review'). Decomposition of a research query into atomic items is step 1 of that pipeline; this skill covers the sizing and specification of coding-task units.

## The Sizing Gate

Decomposition is mandatory when ANY hold:

1. **Multi-subsystem** — the task touches more than one architectural layer or package boundary
2. **Exceeds one session** — it cannot be completed in one focused work session for the assigned worker's model class
3. **Irreversible side effects** — migrations, deletions, external API writes that cannot be rolled back atomically
4. **Verification longer than work** — reviewing the whole result would take longer than producing it
5. **Reasoning-mode conflict** — the task requires multiple incompatible reasoning modes (abductive exploration, counterfactual analysis, meta-inductive rule extraction, corrective debugging) that pull a shared context in conflicting directions

Gate fires and you dispatch monolithically anyway → invalid dispatch. Split, or do the work yourself sequentially. Budgets are model-relative — a cheap small-context worker gets smaller units than a frontier worker.

Model-relative budgets, full criteria, and the calibration procedure: read `references/sizing-gate.md`; if it is not loaded, stop and load it before sizing units.

## The Unit Spec — no dispatch without it

Every dispatched unit carries, written before work starts:

| Field             | Purpose                                                                        |
| ----------------- | ------------------------------------------------------------------------------ |
| `objective`       | One sentence: what exists after this unit that did not exist before            |
| `write_scope`     | Explicit file/glob ownership; worker modifies nothing outside it               |
| `verify_commands` | Exact runnable checks for this unit, scoped to the increment                   |
| `acceptance`      | Observable behavior a reviewer can confirm on this increment alone             |
| `size_estimate`   | Expected files and verify minutes; must fit the assigned worker's class budget |
| `context_paths`   | The exact files the worker must read first                                     |
| `rollback`        | Recovery path if the unit leaves a partial state                               |
| `dependencies`    | Units that must complete first                                                 |

Missing any field → undispatchable. If a field is unfillable, the task is not decomposed enough.

## Surface Classification

Before decomposing, classify what each unit can touch:

| Surface          | Rule                                                | Example                                                      |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| Locked           | Never modified by a worker; orchestrator-only       | CI configs, deploy manifests, shared schemas, root AGENTS.md |
| Editable         | Declared in write_scope; worker owns it until merge | A package's source files, a feature's test files             |
| Append-only      | Workers append but never overwrite                  | Logs, changelogs, durable action records                     |
| Human-controlled | Worker prepares but never submits                   | PRs, deploys, releases, database migrations, credentials     |

The `write_scope` field in every unit spec declares the editable surfaces the worker may touch. Fence breaches (touching undeclared surfaces) are rejection grounds per the dispatch contract.

## The Dispatch Contract

- Vague delegation ("implement auth", "review this phase") is invalid — decompose further or do it inline.
- Hand off a file, not a chat message; pass the path.
- Parallel writers need disjoint write scopes; overlap → serialize.
- Sequential units verify green before the next starts; never implement-all-then-test.
- One maker per unit; verifier is not the maker (fresh context, different lineage where affordable).

Rejection rules, acceptance protocol, and repair-retry: read `references/dispatch-contract.md`; if it is not loaded, stop and load it before accepting any worker result.

## Context and Gate Discipline

Two structural innovations from the latest SOTA research that refine how units are dispatched and verified:

### Context window isolation

Each unit operates in a **clean context window**. The orchestrator never passes accumulated history from prior units into a new worker — context coupling degrades edit reliability and inflates cost. On completion, the unit folds its state (summarises what it learned and what changed) for the orchestrator, then the worker's context is evicted entirely.

Implementation: the unit spec's `context_paths` field lists only the files the worker MUST read first. The orchestrator launches each worker with only those files plus the unit spec. No prior unit's conversation, no accumulated tool output, no stale state.

Measured effect (SWE-Edit, 2026): +2.1 pp resolve rate, -17.9% inference cost on SWE-Bench Verified by decomposing Viewer from Editor into isolated contexts.

### Verifiable acceptance gates

A "done" claim from a worker is not evidence. The only valid signal is a **falsifiable gate that the orchestrator itself runs** — a verify command that could fail, checked before accepting the result.

Principle (Goal-Autopilot, 2026): under gate soundness, floor enforcement, and plan coverage, termination implies the goal holds. The structural failure mode is an honest stall (gate didn't pass → don't claim done), never a fabricated success (claim done without running the gate).

Implementation:

- Every unit spec's `verify_commands` MUST be runnable by the orchestrator in its own context, not by the worker.
- The orchestrator runs the verify commands FRESH — never accepts the worker's reported output.
- If a verify command fails, the unit is rejected. The correct response is honest-stall: record the failure, re-dispatch with the failure evidence.
- A unit whose verify commands cannot be run independently of the worker's context is structurally undispatchable — decompose further.

Measured effect (Goal-Autopilot, 2026): 0.67% fabrication on SWE-bench Lite vs 33.7% (StateFlow baseline) — paired difference -33.07 pp [95% CI -36.53, -29.73].

## Examples

**Good unit spec** (single subsystem, bounded verify):

```
objective: "Add POST /api/checkout endpoint with Stripe session creation"
write_scope: ["apps/api/src/routes/checkout.ts", "apps/api/src/routes/checkout.test.ts"]
verify_commands:
  - "pnpm --filter api test -- tests/routes/checkout.test.ts"
  - "curl -s -X POST http://localhost:3000/api/checkout -d '{}' | grep -c sessionId"
acceptance: "POST /api/checkout returns 201 with a Stripe session ID for a valid cart"
size_estimate: { files: 3, verify_minutes: 2 }
rollback: "git checkout HEAD -- apps/api/src/routes/checkout.ts"
dependencies: []
```

**Bad unit spec** — multi-subsystem, unverifiable, no bounded scope:

```
"implement Stripe billing"
```

**Why bad**: no filesystem boundary (UI + API + DB + webhooks), no verify commands, no acceptance criteria, no size estimate. The worker produces output spanning the entire app; verification is impossible. Correct decomposition: split into UI checkout / API session creation / webhook handling / subscription state — four units, each with its own complete spec.

## Integration

- **Loop kits**: the sizing gate lives in the kit's delegation block and requirement inventory, enforced at seal time and at dispatch time. Architect units once; every fresh iteration inherits them pre-sized.
- **Interactive fan-out**: apply the gate before each spawn; write each unit spec to a scratch file; pass paths.
- **Topology last**: decide agent count and roles only after the units exist — a swarm sized before the units produces coordinated noise.
- **Hierarchy placement**: this skill is the how (loaded on trigger); the must (mandatory gate before delegation) lives in the CLAUDE.md or AGENTS.md always-in-context rules. The harness provides the mandate; this skill provides the procedure.
- **Capability-aligned decomposition**: decompose by capability boundary, not by topic. A "checkout" unit that writes frontend + API + DB touches three capabilities — split further. Each unit aligns with one capability boundary: tool authority, data domain, verification design. Verification design is a first-class dimension of the unit, not a post-hoc addition. Research basis: CEAD reference architecture ([arXiv:2605.08258](https://arxiv.org/abs/2605.08258)).

Research basis for every rule (specification/verification failure taxonomy, front-loaded instruction effects, per-step verification, attention degradation, heterogeneous model routing, context coupling and clean-context decomposition, verifiable anti-fabrication gates, reasoning-mode decomposition, capability-aligned verification design, multi-stage tool-augmented decomposition, verifiable task synthesis at scale): read `references/research-grounding.md` — consult when justifying or calibrating a rule, not for routine dispatches.

## Resources

- `references/sizing-gate.md` — gate criteria, model-relative budgets, calibration, edge cases
- `references/dispatch-contract.md` — bundle fields, rejection rules, repair-retry, action records
- `references/research-grounding.md` — peer-reviewed basis and its limits
