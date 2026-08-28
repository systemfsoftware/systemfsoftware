---
title: "turbo package-boundary audit catches undeclared runtime dependencies"
date: 2026-08-28
category: tooling-decisions
module: stryker-js-platform-node
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - a package value-imports a runtime dependency its manifest does not declare
  - verifying a dependency-declaration change before shipping
tags: [turbo, boundaries, undeclared-dependency, pnpm-catalog]
---

# turbo package-boundary audit catches undeclared runtime dependencies

## Problem

Issue #297: `@systemfsoftware/stryker-js-platform-node` value-imports `mutation-testing-metrics` in its shipped Reporter and verdict-envelope modules and type-imports it in its Reporter schema, but the package manifest never declared the dependency. Resolution succeeded through pnpm hoisting, and installs, builds, and tests all stayed green — the defect surfaced only when the turbo package-boundary audit ran and reported `cannot import package mutation-testing-metrics because it is not a dependency` for three files.

## Mechanism / Failure Modes

1. **Hoisting-masked undeclared import.** A workspace package imports a package it does not declare; pnpm's node_modules layout happens to place the dependency where Node's resolution finds it. Every local gate — install, build, test — passes, because the resolution works on this tree.
2. **Adopter-facing break at a distance.** The same tree with a different hoisting layout, or a consumer installing only the published tarball, resolves the import differently: the module fails to load at runtime or the install drops the transitive package. The break is displaced from the change that caused it and appears as someone else's environment problem.
3. **Silent until audited.** Nothing in the normal build-and-test pipeline reads the manifest-to-import correspondence, so the defect class has no loud local signal — it needs a check whose input is exactly that correspondence.

## Architectural Invariant

**The manifest is the contract for every import reachable from shipped source.** For each runtime import in a package's published code there must be a matching declaration in that package's `dependencies`, and the single source of truth for the version lives in the workspace catalog (`catalogs.stryker` for the mutation-testing-* family) with the manifest referencing `catalog:stryker`, never a second literal pin. The declaration change and the release intent ship together: a change that moves a publishable package's turbo `build` hash carries a `.changeset/` intent (`REPO-R2`), so adopters observe the manifest change in the changelog.

## Verification / Prevention

- **Run the boundary audit as a shipping gate.** `pnpm exec turbo query 'query { boundaries { items { message path } length } }'` reports a diagnostic for every import without a declaration; a clean result (no message naming the touched packages) is part of the definition of done for any dependency-declaration change.
- **Read a diagnostic as a manifest bug.** The audit names the missing declaration; fix the manifest, then re-run — do not silence or special-case the import.
- **Declare, then let the build reconcile generated fields.** Add the version to the catalog, reference `catalog:stryker` from `dependencies`, regenerate the lockfile. Never hand-edit generated fields such as tsdown's `inlinedDependencies`: the build rewrites that field from the set of packages actually inlined, so a stale entry disappears on the next build — the #297 build dropped the stale metrics entry that way.
- **Keep the release intent anchored.** Emit the `.changeset/` intent in the same change (REPO-R2: hash-moving publishable changes ship an intent), so the fix and its adopter-observable record land together.

## Anti-pattern Smells

- Package compiles and tests green locally, but its manifest never declares a dependency it imports — the hoisting reliance smell.
- `inlinedDependencies` claims a package the build no longer inlines — stale generated output; rebuild, never hand-edit.
- A second literal version pin of a catalog-managed family — the duplication drift named in `docs/solutions/test-failures/fixture-pin-duplicates-the-catalogs-decision.md`.

## Related

- Issue #297 (fix pending on branch gh-297; plan: `docs/plans/2026-08-28-005-fix-declare-runtime-deps-catalog-plan.md`)
- `docs/solutions/tooling-decisions/pnpm-catalogs-for-monorepo-dependency-management.md` — the catalog convention this fix follows
- `docs/solutions/tooling-decisions/root-workspace-protocol-hashes-every-task.md` — why the stryker axis uses `catalog:stryker`
- `docs/solutions/tooling-decisions/tsdown-manages-publishconfig-during-build.md` — sibling tsdown-generated-field learning
- `docs/solutions/test-failures/fixture-pin-duplicates-the-catalogs-decision.md` — the duplication drift a second pin creates
