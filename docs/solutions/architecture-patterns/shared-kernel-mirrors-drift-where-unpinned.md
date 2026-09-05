---
title: "Shared kernel mirrors drift where unpinned; private build-bundled packages need no pin"
date: "2026-09-05"
category: architecture-patterns
module: oxlint-plugin
problem_type: architecture_pattern
component: testing_framework
severity: medium
applies_when:
  - "Several standalone published packages need the same internal logic but must not depend on each other"
  - "A copy discipline is enforced by a test comparing two files byte-for-byte"
  - "A shared module must reach published dists without becoming a runtime dependency"
related_components:
  - oxlint-import-origin
  - oxlint-make-boundary
  - oxlint-plugin-effect-workflow
  - oxlint-plugin-effect-schema
tags: [oxlint-plugins, tsdown-bundling, devdependency-bundling, drift-test, mirror-rot, standalone-artifacts]
---

# Shared kernel mirrors drift where unpinned; private build-bundled packages need no pin

## Context

Three oxlint plugin packages needed the same two internal modules — the `ImportOrigin` resolver and the `MakeBoundary` locator. Because each plugin publishes a standalone artifact and plugins must not depend on each other, the modules were vendored: one copy per package, with a drift test asserting byte-identity between the copies it knew about. Two of the three mirrors were pinned; one was declared "also mirrored" and left unpinned. The unpinned copy drifted — it grew `isSchemaVocabularyOrigin`, a predicate its siblings never had — before any gate noticed.

## Failure mechanism

1. **A byte-identity pin is a conjunction over the pairs it enumerates.** The drift guarantee is `identical(A,B) ∧ identical(A,C) ∧ …` for exactly the copies the pin names. Any copy outside the enumeration has a vacuous guarantee: nothing is false, nothing is checked. The unpinned effect-schema copy proved the hole real.
2. **A mirror whose justification is a build constraint inherits every build decision.** The mirrors existed so published dists would not carry a dependency on another plugin. That goal never required duplicated _source_ — only duplicated _artifacts_.
3. **A drift test is a leaky abstraction at the packaging layer.** It reaches into another package's source tree by relative path, coupling one package's test suite to another's file layout. Any folder restructure breaks it as a path error, masking the contract it exists to defend.

## Architectural invariant

**Artifact independence is a packaging property, not a source property.** Published artifacts stay standalone when shared source is compiled into them at build time; the source of truth stays single.

- Shared module → private workspace package, `private: true`.
- Consumer declares it under `devDependencies` and the bundler inlines it into `dist` (tsdown bundles everything outside `dependencies`/`peerDependencies`; `deps.onlyBundle: false` only silences the hint).
- `dependencies` would externalize the module and force the private package to be published — exactly the coupling to avoid.

## Guidance

- When N≥2 published packages need the same logic, extract one private package per concern, named for what it holds — not one "shared" package named for neither.
- Bundle via devDependency; never list the private package under `dependencies` of a published package.
- Delete the mirrors and the drift test in the same change; a pin whose mirrors are gone is dead weight, and a mirror whose pin is gone is an unobserved drift surface.
- Vocabulary-specific logic extracted from a drifted mirror belongs to the package whose vocabulary it encodes (the schema predicate returned to the schema plugin), not to the shared module.
- A shared package with no tests of its own must not own a mutation config: CI enrollment predicates keyed on config presence would run a test-less package vacuously red. Its behavior is graded through the consumers' suites; state that tradeoff in the package's own AGENTS.md rather than papering over it.

## Why This Works

Duplication shifts the correctness burden from the type system and the bundler onto human discipline (keep N copies identical). A single source plus build-time inlining moves it back onto machinery: the bundler cannot forget to inline, and there is no second copy to disagree with.

## Related

- docs/solutions/architecture-patterns/mutation-budgets-split-rule-packages-into-private-cells.md
- docs/solutions/build-errors/tsdown-private-dependency-bare-import-dist.md
