---
date: "2026-08-24"
module: stryker-js-cli
problem_type: test_failure
component: contract-lane
severity: high
applies_when:
  - A test harness or fixture declares an exact dependency version
  - A container contract workspace installs packed tarballs with an overrides block
  - Any global setup encodes a copy of a fact the workspace catalog already owns
root_cause: duplicated_decision
resolution_type: code_fix
tags: [pnpm, catalog, overrides, testcontainers, global-setup, version-drift, silent-stale, effect]
related_components:
  - packages/testing/mutation/stryker-js/cli
  - packages/toolchain/tsconfig
symptoms:
  - "the contract lane passes 24/24 while exercising a dependency two release candidates older than the tree it claims to test"
  - "a dependency bump commit updates the catalog, the lockfile, every published manifest and the README install lines, and still leaves one stale literal behind"
  - "no gate, lint rule, or test failure names the stale literal; only an audit of every exact version string finds it"
  - "the comment justifying the pin describes a failure mode (duplicate dependency copies, cross-copy interop death) the lockfile disproves"
---

# A fixture that pins what the catalog owns drifts silently

## Problem

A container contract lane installed the packed tarballs of its package and its
workspace siblings into a scratch workspace. That workspace's manifest carried
an `overrides` block pinning the core dependency to an exact release-candidate
version, and a global-setup constant supplied that version as a string literal.

The workspace catalog owns the exact version of every dependency. The pin was a
second, hand-maintained copy of that decision. When a routine bump moved the
catalog, the lockfile, every published manifest and the README install lines to
the new release candidate, nothing re-derived the fixture's copy: the lane kept
installing the previous candidate, reported green, and exercised a toolchain
two candidates older than the tree that built it - for weeks.

The green run is non-evidence for the copy's correctness. The lane asserts
behaviour of the packed surface, not the identity of the dependency it resolved,
so a stale pin changes what is tested without changing any result.

## Mechanism

- **A duplicated decision has no derivation path.** The catalog resolves the
  version for every workspace consumer through one declaration. A fixture
  literal resolves through nothing - it is its own authority, so the bump that
  moves every other copy leaves it fixed.
- **The failure is silent by shape.** A wrong-but-installable version produces
  a green lane; only the specific interop crash the pin's comment feared would
  turn red, and the lockfile's single resolved copy makes that crash
  unreachable in the first place.
- **The comment outlived its premise.** The pin was added to prevent duplicate
  dependency copies when peer ranges float to a newer candidate than exact
  dependencies pin. After the tree converged on one version everywhere, the
  premise had no referent - but the comment kept asserting it, and the code
  kept enforcing it.

## Resolution

Delete the override and the constant. The scratch workspace installs the packed
tarballs and resolves their declared ranges exactly as a real consumer would;
the catalog remains the single owner of the version. Nothing replaces the
deleted comments - a replacement narrative is the same liability one bump later.

The lane's first green run after the deletion is the warrant that the pin was
never load-bearing: it proves the packed surface resolves one dependency copy
at the catalog's version without the override.

## Architectural invariants

- **A harness must not encode a copy of a decision the workspace already
  owns.** Versions, locations, and workspace membership resolve through the
  package manager's own mechanisms - the catalog for versions, `--filter` by
  name for workspace packages from any directory inside the workspace. A
  fixture that hand-copies one of these facts has no derivation path and no
  gate that re-derives it.
- **Green is non-evidence for unasserted identity.** A lane that does not
  assert which version it resolved cannot notice that it resolved the wrong
  one. The acceptable alternatives are an install-time assertion of the
  resolved version, or accepting the residual that registry-side drift surfaces
  as an interop failure rather than a named cause.
- **A comment that argues for a workaround is a liability with a delay.** It
  survives the condition that falsified it and keeps enforcing the workaround.
  Delete the comment with the workaround, or the next reader inherits an
  argument for a position the tree no longer holds.

## Code smells

- An exact dependency version as a string literal in test infrastructure,
  anywhere a workspace catalog also declares that dependency.
- An `overrides` block in a scratch install manifest that re-states a version
  the packed tarballs already declare.
- A comment whose justification cites a failure mode (duplicate copies,
  cross-copy interop) that the lockfile's single resolution disproves.

## Prevention

- When bumping a workspace-wide dependency, treat every exact version literal
  outside the catalog as a stale copy until proven otherwise - the grep for the
  old version string across the tree is the audit, and README install lines are
  part of that surface.
- When a lane needs reproducibility a floating range cannot give, derive the
  pin from the workspace's own declaration at run time rather than hand-copying
  it - a derived value has a derivation path; a literal has a drift date.

## Related Issues

- docs/solutions/architecture-patterns/first-populated-directory-is-not-the-install-root.md
- docs/solutions/build-errors/pack-lifecycle-hooks-mutate-dist-mid-gate.md
- docs/solutions/test-failures/contract-lane-stops-at-dead-docker-socket.md
- docs/solutions/logic-errors/attw-cli-entrypoints-flags-dropped-and-empty-array-override.md
