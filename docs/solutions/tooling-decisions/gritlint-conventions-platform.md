---
title: File-shape conventions run on gritlint, our own CLI on the gritql engine
date: "2026-09-25"
category: tooling-decisions
module: systemfsoftware
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - Adding a convention about the shape of package.json, tsconfig or bundler config files
  - Writing a new guard script that reads only file contents
  - Re-pinning the biomejs/gritql engine
  - Choosing between biome plugins, the grit CLI and gritlint for a structural rule
root_cause: bespoke_guard_per_convention
resolution_type: owned_cli_on_vendored_engine
related_components:
  - gritlint.json
  - bin/gritlint
  - crates/gritlint_core
  - packs
  - nix/gritlint.nix
  - package.json
tags:
  - gritql
  - gritlint
  - conventions
  - lint
  - nix
  - rust
---

# File-shape conventions run on gritlint, our own CLI on the gritql engine

## Context

The source-resolution convention was encoded three times: in the `workspace-source-resolution` skill, in that skill's
own per-package checker, and in the `check-dev-conditions` guard. The `check-typecheck-build-mode` guard was one more
bespoke Deno script. None of them could be handed to another repository. The conventions worth enforcing join sibling
files in one package directory (a `package.json` beside its `tsconfig.json` or `tsdown.config.ts`), so the engine must
evaluate several files in one query. The platform must also be installable by any repository, which adds its own rules
and proves them.

## Candidates

1. **Repackage the frozen `grit` CLI behind a wrapper** (PR #410, `@systemfsoftware/conventions`). Lost: the last CLI
   release is `0.1.0-alpha.1743007075`, and most of #410 worked around it — findings on stderr, `--grit-dir` ignored for
   pattern loading, a global config that shadows rules, duplicate pattern names that silently shadow each other.
2. **A Node CLI on `@getgrit/gritql`.** Lost: 0.0.3 exposes only a search API that returns matching paths, with no
   findings, lines or messages.
3. **Biome GritQL plugins.** Lost: biome evaluates one file per query and defers multifile support in its
   `GritTargetFile` wrapper; JSON as a plugin language only landed in biomejs/biome#8723. Neither sibling join the
   guards perform can be expressed.
4. **Keep the Deno guards.** Lost: every new file-shape convention meant another bespoke script, and no adopter outside
   this repository could run them.
5. **Publish the crates to crates.io.** Not taken: crates.io refuses crates with git-only dependencies, and only
   `grit-pattern-matcher` and `grit-util` of the engine are published there. npm and nix already reach every adopter.

## Decision

gritlint embeds `marzano-core` and its language crates from `biomejs/gritql` at one pinned `rev`, and never calls
`marzano-gritmodule`'s resolver, so no user-level grit config, cwd walk or standard-library fetch reaches a run. Rules
are GritQL markdown files grouped into opt-in packs. `gritlint test` proves each rule on a known-bad and a known-good
fixture. Distribution copies comment-checker: a flake whose `gritlint` package is the bubblewrap-sandboxed binary, and
per-platform npm packages behind a launcher with no postinstall step.

## Evidence

- The engine contract suite (`engine_contract.rs` in `gritlint_core`) pins every engine behaviour gritlint relies on,
  including multifile sibling joins, key order inside an object, JSON with comments, and a poisoned `$HOME` and cwd
  changing nothing.
- Enrollment in this repository: `pnpm lint:conventions` went red with exit 1 on a planted violation of each of the 14
  bundled rules, in real files of this tree, and each plant fired only its own rule. The restored tree is green:
  `clean: 1990 file(s) selected; zero-file rules: none`.
- The internals-package check got stronger in the move: `check-dev-conditions` skipped packages without a
  `tsdown.config.ts`, while `source-resolution/internals-export-map` checks exactly those.
- Enrollment found one real defect before it could reach an adopter: the walk read every file as UTF-8, so a vendored
  `.tar.gz` made every scan exit 2. The shell now reads only files that some rule language can target
  (`decode::is_scannable`), and `scan_contract.rs` holds the regression.

## Guidance

- A new convention that reads only file contents is a rule in a pack with fixtures, not a script in `scripts/guards/`.
  A check that needs git history, turbo hashes or compiler resolution stays a script (`check-single-plan.ts`,
  `check-changeset.ts`, `check-project-membership.ts`).
- Facts that span packages come from the adopter's `gritlint.json` parameters, because GritQL cannot resolve package
  specifiers.
- Re-pinning the engine is `cargo update` on the `rev`, then the engine contract tests, then the new `cargoHash` in
  `gritlint.nix` that `nix build` reports. The vendor tree is a fixed-output hash on purpose: the gritql checkout holds
  duplicate crate names, and a vendoring step that picks by name alone built different sources on different machines.

## Related

- [dprint-from-the-repo-flake.md](dprint-from-the-repo-flake.md): the flake delivery shape gritlint reuses
- [first-publish-under-oidc-trusted-publishing.md](first-publish-under-oidc-trusted-publishing.md): the npm debut
  gritlint's launcher follows
