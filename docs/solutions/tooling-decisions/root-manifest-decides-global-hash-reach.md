---
title: The root manifest's workspace dependencies decide which packages invalidate the whole repo
date: "2026-08-23"
category: tooling-decisions
module: monorepo task graph and cache
problem_type: tooling_decision
component: build
severity: medium
applies_when:
  - estimating the blast radius of a change to a shared workspace package
  - narrowing a task's `inputs` in the hope of reducing cache invalidation
  - adding a workspace dependency to the root manifest
  - reading an `affectedTasks` count and deciding whether it over-reports
tags:
  - turbo
  - cache-invalidation
  - task-graph
  - blast-radius
  - measurement-controls
---

# The root manifest's workspace dependencies decide which packages invalidate the whole repo

## Problem

A one-line edit to the shared test-runner configuration package — a single key added to the exported config object — invalidated **257** tasks. Every other commit in the same branch invalidated 0 or 4. The obvious reading is that most of those 257 are waste: `typecheck`, `lint`, `attw`, `build` and `api:check` accounted for roughly 180 of them, and none of those tasks reads a test-runner config.

The invalidation is real and is not routed through the dependency graph. But it does not reach every package either, and the difference is controllable.

## Mechanism

A task's cache key is composed of three independent parts:

$$H_{\text{task}} = H_{\text{global}} \;\oplus\; H_{\text{inputs}} \;\oplus\; \bigoplus_{u \in \text{upstream}} H_u$$

Task-level `inputs` govern only the middle term. The first term carries a component covering internal workspace packages. The question that decides blast radius is _which_ packages that component covers, and the answer is not "all of them".

It covers the **transitive workspace closure of the root manifest's own dependencies**. A package inside that closure moves the global term when its files change, and therefore invalidates every task in the repository. A package outside it does not, no matter how many dependents it has.

The failure mode this creates is a scoping illusion:

$$\text{blast radius} \neq f(\text{dependents}) \quad\text{when the change moves } H_{\text{global}}$$

An engineer reasoning from the dependency graph predicts "the packages that depend on it." For a package inside the root closure the measured answer is "every task in the repository" — including packages that are _upstream_ of it, along a path down which nothing could propagate.

## Falsified hypotheses

Three plausible explanations were measured and rejected. Each is recorded because each is a tempting "optimization" that changes no hash.

**A root-relative task input.** The `test` task declares a root-relative glob pointing at the shared config package. A root-relative input cannot be attributed to one package, so folding it into the global hash would explain the symptom exactly. Removing that line and re-measuring left every sampled hash moving as before. It is a correct declaration and not the carrier.

**The package's declared file set.** The natural next reading is that any file inside a workspace package's published surface moves the global term. Editing the manifest of two packages outside the root closure — unambiguously declared files — moved nothing.

**Dependent count.** A hub package might plausibly earn global reach by being widely depended upon. It does not. The controls separate the two cleanly:

| edited package                  | dependents | in root closure | global term moved |
| ------------------------------- | ---------- | --------------- | ----------------- |
| a leaf plugin                   | 0          | no              | no                |
| an in-memory filesystem package | 3          | no              | no                |
| the shared test-runner config   | 33         | **yes**         | **yes**           |

Membership decides it; popularity does not.

## Architectural invariants

**INV-1 — Input narrowing is orthogonal to the global term.** Tightening a task's `inputs` reduces $H_{\text{inputs}}$ sensitivity only. It cannot reduce sensitivity to a change that moves $H_{\text{global}}$. Any optimization framed as "narrow the inputs so shared-package edits stop invalidating us" is unfalsifiable by construction — it targets the wrong term.

**INV-2 — The root manifest is a blast-radius control surface, not a convenience list.** Every workspace dependency declared at the root drags its entire transitive closure into the global hash. Adding one root dependency can convert a quiet corner of the repo into a repo-wide invalidation source, and nothing in the task graph records that this happened. A root workspace dependency must be justified by something the root itself imports.

**INV-3 — A workspace dependency nothing imports still costs.** Resolution by workspace filter does not require the root to declare the package, so a root dependency can be entirely unused at the source level while remaining fully live in the hash. Its cost is invisible to every tool that looks for unused imports, because there is no import to find.

**INV-4 — Co-location decides invalidation frequency, inside the closure.** For a package in the closure whose files change with frequency $f$, every task in the repository is invalidated at rate $f$. Placing a volatile file there taxes the whole repository. Outside the closure the same file taxes only genuine dependents.

**INV-5 — Full invalidation from shared test configuration is correct; the rebuild half is not.** When shared test configuration changes, re-running every test is the right answer. Re-building and re-linting for it is not, and that half is not addressable through task configuration — only by keeping the volatile package out of the root closure.

## Verification and prevention

**Always run a null control before attributing a hash movement.** Rewrite the target file with byte-identical content and re-measure. If hashes move under an identical rewrite, the instrument is measuring file metadata rather than content, and every subsequent attribution is noise. In the measurement that produced this document the null control moved 0 of 17 sampled hashes, which is what licensed the rest.

**Always run an attribution control, and make it a negative case.** It is not enough to show that the suspect moves hashes; show that something structurally similar does not. Editing a same-shaped file in a package outside the closure is what turned "everything invalidates" into a mechanism.

**Prefer per-task hash comparison over the affected-task query when the question is causal.** The affected-task query answers "what would run"; comparing the dry-run hash of a named task before and after a controlled edit answers "what actually changed and why." Only the latter distinguishes a global-term movement from a dependency-edge movement, because the two produce identical affected-task output.

**Diff the global cache inputs, not just the task hashes.** The dry-run output exposes the global inputs as separate named components. When a hash moves for a reason the dependency graph does not explain, diffing those components names the carrier in one step instead of inviting a hypothesis loop.

**Audit the root manifest's workspace dependencies as a hash question.** For each one, ask what the root imports it for. The closure it pulls in is the set of packages that can invalidate everything, and it is the only lever that changes that set.

### Code smells

```jsonc
// SMELL: an "optimization" that narrows inputs to escape a shared-package edit.
// Targets the wrong term (INV-1); the global component is untouched.
{ "build": { "inputs": ["src/**"] } }   // already narrow; was never the carrier

// SMELL: deleting a root-relative input because it "looks like" the cause.
// Removes a correctness declaration; measured to change no hash.
{ "test": { "inputs": ["$TURBO_ROOT$/<shared-config-package>/lib/**"] } }

// SMELL: a workspace dependency in the ROOT manifest that no root script or
// config imports. It is free to the eye and repo-wide in the hash (INV-2/INV-3).
{ "devDependencies": { "@scope/some-tool": "workspace:^" } }
```

```txt
SMELL: a shared workspace package inside the root closure whose published
       file set contains frequently-edited files (INV-4).

SMELL: an attribution claim with no negative control. "Editing X invalidates
       everything" is not a finding until some structurally similar Y is
       shown to invalidate nothing.
```

## Related

- `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md` — the same shape in a different instrument: a check keyed on the wrong term is unfalsifiable regardless of how precise it looks.
