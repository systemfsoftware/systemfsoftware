---
title: "Conformance credit pins a kernel's tests to its own package"
date: 2026-09-24
category: architecture-patterns
module: packages/toolchain/vitest-config
problem_type: architecture_pattern
component: conformance coverage gate
severity: medium
applies_when:
  - "Breaking a workspace package cycle by moving a package's tests into a separate private package"
  - "A package whose source holds concurrency primitives (Queue, Semaphore, Ref, Deferred) wants its behaviour suite elsewhere"
tags: [conformance, package-cycle, turbo, effect-sim-kernel, effect-gherkin-spec, test-placement]
related_components: [effect-sim-kernel, effect-spec-runtime, effect-gherkin-spec]
---

# Conformance credit pins a kernel's tests to its own package

## Problem

Turbo warns `Circular package dependency detected` on every command for
`effect-gherkin-spec -> effect-spec-runtime -> effect-sim-kernel -> effect-gherkin-spec`.
The closing edge is a devDependency: the kernel's behaviour suite is written as
Gherkin features. Moving those features into a private `effect-sim-kernel-features`
package removes the edge and the warning. It also turns `effect-sim-kernel#test`
red. The kernel's four primitive sites (`Queue.unbounded` and `Semaphore.makeUnsafe`
in the `Unobserved` module, `Ref.makeUnsafe` and `Deferred.makeUnsafe` in the kernel
loop) each report `never ran in any test`, and the run ends `4/4 primitive sites never ran`.

The relocation was reverted. The cycle is only a package-graph warning. It is not a
task-graph cycle, because the kernel's `build` task declares no dependencies.
`pnpm check:local` exits 0 with the cycle present.

## Mechanism

1. The conformance plugin in `@systemfsoftware/vitest-config` scopes every verdict
   to one vitest run. `sourceSetOf` takes the run's own source set:
   `coverage.include` minus `coverage.exclude`, minus test files.
2. A site in that set counts as covered only when a check in the same run drives
   it through `Kernel.run` or `Kernel.search`.
3. A run in another package has a different source set, so it cannot credit the
   kernel's sites. Even if it widened its include, the plugin rules that "a checker
   cannot check itself or a package it depends on".
4. After relocation the kernel's own run had no tests reaching its primitives, so
   every site failed as uncovered. The message reads like dead code, which invites
   the wrong fix of deleting the primitives.

## Architectural Invariant

**A package's conformance sites are discharged only by that package's own test run.**

```
covered(site) ⇔ site ∈ sourceSet(run(pkg)) ∧ ∃ check ∈ run(pkg) reaching site via Kernel.run | Kernel.search
```

Moving tests between packages is therefore not behaviour-preserving for any package
with sites. Break a test-import cycle by changing what the tests import, not where
they live:

- Keep the suite in the kernel and drive its primitives with plain `Conformance` or
  `Differential` checks. Then the devDependency on `effect-gherkin-spec` can go.
- Or accept the dev-only package cycle while the kernel's `build.dependsOn` stays
  empty, so no `^build` loop can form.

## Prevention

Before relocating a package's tests, run its `test` task and read the
`Conformance coverage` summary. `no concurrency primitive in N source files` means
relocation is safe. Any site count means the tests are pinned to the package.

## Related

- `docs/solutions/architecture-patterns/conformance-credit-follows-the-kernel-run.md`: how credit is attributed within one run.
- `docs/solutions/build-errors/turbo-build-cycle-from-self-hosted-devdeps.md`: a toolchain cycle broken by moving edges, where no conformance sites were involved.
