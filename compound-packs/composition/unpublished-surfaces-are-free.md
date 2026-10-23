---
title: An unpublished library's wrong shape is deleted and rebuilt with all its consumers in one change, never shimmed, aliased or kept for compatibility
applies_when:
  - a private workspace library's exports, names or structure are wrong
  - deciding whether a change to a private package needs a deprecation path or a compatibility re-export
  - bringing an existing private library into line with another rule in this pack
  - applying package-topology's versioning rules to a private package
  - a private package exports one symbol two ways, or a subpath is proposed for chunking
tags: [composition, versioning, delete-and-rebuild, private, shims]
---

## Rule

A library marked `"private": true` has no consumers outside this repository, so it has no versioned surface. When its shape is wrong, the change deletes the wrong shape, builds the right one, and updates every consumer in the same change. It does not add:

- an alias (a second key resolving to the same file, or a re-export under an old name);
- a shim or adapter that keeps the old call shape alive;
- a deprecation period.

Versioning by what a change removes or renames applies only to published packages (pack: package-topology, surface-changes-are-versioned.md). Two more package-topology rules read as unscoped but govern published packages only: (pack: package-topology, one-access-path.md) ("keeps both until a versioned change removes one") and (pack: package-topology, declared-entry-points.md) (subpaths justified by chunking). For a private library, this rule and (pack: composition, role-entries-only.md) decide.

## Why

Keeping a wrong internal shape alive with aliases and shims pays the cost of a published package without its reason, and it is how workarounds become architecture: the shim gets its own consumers and can then never be removed. All 24 `@younna/*` packages are private, so the published-package versioning rule never fired there, and nothing else stopped the surface from growing ((pack: composition, evidence/FINDINGS.md) Cycle 007, "What they miss" 8).

## Evidence

- (pack: composition, evidence/PACK.md) Part 3, row 4: "Private packages get the usage gate instead of semver."
- Rat Stack treats removal as a checklist of exact files, dependencies and config entries, done in one change ((pack: composition, evidence/FINDINGS.md) Cycle 005, finding 7).

## Wrong / right

```jsonc
// WRONG: packages/kit/package.json keeps the old specifier alive
"exports": { ".": "./src/mod.ts", "./button": "./src/mod.ts" }

// RIGHT: "./button" is deleted; every importer of "@scope/kit/button" is rewritten to "@scope/kit" in the same change
"exports": { ".": "./src/mod.ts" }
```

## Gate

Not yet run in CI: `.github/workflows/ci.yml` runs only `repo-checks single-plan`, and no workflow runs any `composition-*` check (pack: composition, gates-are-facts-or-calibrated-judges.md).

Fact-gated: `repo-checks composition-entries` (`scripts/tools/repo-checks/composition.ts`) fails a private library whose exports map has two keys resolving to one file. Gate: none yet for shims and re-exports under old names; the fact it would read is a change's removed exported names (from the compiler, before and after) against names re-exported from the same private library in the same change.
