---
title: Package & Export Topology Compound Pack
created_at: 2026-10-01
topic: package-export-topology-pack
type: feat
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Package & Export Topology Compound Pack

## Goal Capsule

- **Objective:** When an agent plans, reviews, or writes a package in this repo, the law for what earns a package, what earns a subpath, and what may sit on the public surface is in front of it and cited, without any external document.
- **Means:** A Compound Pack at `compound-packs/package-topology/`, declared in `.compound-engineering/config.yaml`, whose rule files carry that law in full.
- **Product Authority:** This pack owns package boundaries, subpath topology, and public-surface shape. Barrel shape stays with `compound-packs/cell-architecture/single-namespace-barrel.md`; file suffixes and folder layout stay with `compound-packs/cell-architecture/service-and-layer-boundaries.md`; export-map condition keys stay with `packs/source-resolution`.
- **Open Blockers:** None.

---

## Product Contract

### Summary

A Compound Pack of prescriptive Markdown rules that `ce-brainstorm`, `ce-plan`, `ce-doc-review`, and `ce-code-review` read at runtime and cite as `(pack: package-topology, <file>)`. Each rule is self-contained: the pack is the only home of this law once its draft source is deleted.

### Problem Frame

The package and public-surface law exists only as a draft outside the repository, and that draft is being deleted. Nothing in the CE pipeline reads it, so plans and reviews never ground in it: packages get split without cause, subpaths re-publish the same vocabulary under several specifiers, and helper functions, eager top-level work, and effectful methods land on public surfaces unchallenged.

### Key Decisions

- **Compound Pack, not a lint pack.** Rules are matched semantically and graded by review through citation; no new gate is built (GATE1, CONST-E9). Governs R1, R3. (session-settled: user-directed — chosen over a GritQL rule pack under `packs/`: the pack exists to carry the law, per the Compound Packs guide the work started from)
- **The pack replaces the draft source.** Every rule carries its law in full and cites nothing outside the repo. Governs R2. (session-settled: user-directed — chosen over citing the draft as an external authority: the draft is being deleted)
- **Scope is packages, subpaths, and public surface only.** File suffixes, folder layout, config wiring, and cross-capability imports are out of scope. (session-settled: user-directed — chosen over also carrying the draft's file and folder topology: no scope expansion)
- **Disjoint from packs already in force.** Where an existing pack rule already prescribes a behavior, this pack cites it instead of restating it, so review never reports one defect twice under two rules. Governs R4, R12.

### Requirements

**Pack shape**

- R1. The pack lives at `compound-packs/package-topology/` with a `README.md` stating its scope and one top-level `.md` per rule, each with `title` and situational `applies_when` lines written in a task's vocabulary (e.g. "adding a new package", "adding or changing a package's subpath exports", "adding an export to a published module").
- R2. Each rule body carries its law self-contained: what to do, what not to do, the harm, a wrong/right example, and a closing `Gate:` line; no rule references the draft source or its section IDs.
- R3. A rule's `Gate:` line names only a gate that exists in the repo at write time, defaulting to `review`; a missing mechanical gate is stated as ungated, never claimed.
- R4. Where a behavior is already prescribed by a rule in `cell-architecture`, `schema-laws`, or `boundary-testing`, this pack's rule cites that rule by path instead of restating it.
- R5. The pack is declared under `packs:` in `.compound-engineering/config.yaml`, and the CE pack resolver lists it with every rule file discovered and no skipped-file or storage-only warnings.

**Package boundary law**

- R6. One capability is one package publishing its whole curated surface from the single root entry `"."`; vocabulary, workflows, cells, and published fakes are internal modules behind that entry.
- R7. A separate package is earned by exactly two conditions, defined in the rule: an **External Binder** (a dependency visible in the public signature, such as a test runner or compiler plugin, that a consumer may not want) or **Substrate Contamination** (a platform substrate, such as Node builtins or a native binary, that a rootless consumer must not be forced to install). Adapters and executable composition roots are the packages these conditions earn.
- R8. The rule rejects: a package minted without an earner (including a `-language`/`-engine` or vocabulary/workflow split of one capability); a package named for a host platform (`*-platform-node`, `*-platform-bun`), because the host platform is an adapter provided at the composition root; and an umbrella package containing only re-exports of other packages.

**Subpath topology law**

- R9. A subpath split is decided by the shared identity set S, defined in the rule as the brands, schemas, and `Context.Service` tags that two or more proposed subpaths both need, with three verdicts: S empty, the split stands; S declarations-only, the shared set sinks into one entry and no symbol gets a second import path, collapsing to the root entry when the subpaths are dense in S; S contains behavior, the subpaths merge.
- R10. The rule rejects one specifier per class or implementation layer (including `/schema` and `/workflow` subpaths beside the root) and any symbol importable under two specifiers.

**Public surface law**

- R11. Every export is one of five published shapes, carried in the rule as a table: **Cells** (`Cell<I, A, E, R>` and its combinators; earned by an outside interaction with input, output, and refusals), **Schemas** (decodable contracts and smart constructors; earned by an untrusted byte boundary), **Ports** (`Context.Service` contracts; earned by a substitutable dependency the consumer provides), **Unions** (tagged variants of closed data with constructors and pure projections; earned by mutually exclusive domain states), **Handles** (nominal records with members; earned by unserializable members such as functions or generic identity). An export anchored to none of them, such as a standalone helper or loose constant, is homeless and rejected; a function stays anchored as a constructor, combinator, or evaluator of a shape in its own module.
- R12. Barrel shape is not restated: the rule cites `cell-architecture/single-namespace-barrel.md`, and the draft's two barrel points that rule lacks — a capability-level `mod.ts` re-exports with `export * as`, and workflows never appear in any `mod.ts` — are merged into that existing rule.
- R13. What is public is decided by the export map and the rollup leak check (a published signature that references an unpublished type fails), never by a folder name; `internal/` holds what fails the affordance test (no consumer constructs, composes, decodes, dispatches, or provides it).
- R14. Importing any published module executes no side effects: no eager promises, environment reads, sockets, or global mutation at module top level.
- R15. Domain data types carry pure field projections only; a method returning `Effect` or `Promise` on a domain class or struct is rejected, and the effect is published as a Cell instead.

### Acceptance Examples

- AE1. Covers R6, R10. Given a capability package whose export map has only the root entry, when a plan or review touches its exports, the pack cites no violation.
- AE2. Covers R9, R10. Given a package that adds `./schema` and `./workflow` subpaths beside `"."` over one shared vocabulary, when `ce-doc-review` or `ce-code-review` runs, it flags the split citing `(pack: package-topology, <subpath rule file>)` with the S verdict.
- AE3. Covers R7, R8. Given a plan that splits one capability into `search-language` and `search-engine` with no binder or substrate dependency, when `ce-plan` or `ce-doc-review` runs, the split is rejected citing the earned-boundary rule.
- AE4. Covers R11. Given a domain module that exports `formatMoney = (cents: number) => …`, when `ce-code-review` runs, it flags a homeless export; anchoring it as an operation on a `Money` schema in the same module clears the finding.
- AE5. Covers R14. Given a module with `export const db = new DatabaseConnection(process.env.DB_URL!)` at top level, review flags import-time work and points to a lazy `Context.Service` tag.

### Success Criteria

- The CE pack resolver lists `package-topology` with no errors or warnings (R5).
- Searching the pack and the plan for the draft's location or its section ID prefixes returns nothing (R2).

### Scope Boundaries

- **Outside this pack:** file suffixes, capability folder size and depth, config-as-tag wiring, and capability-to-capability decoupling; suffixes and layout stay with `cell-architecture/service-and-layer-boundaries.md`.
- **Outside this pack:** export-map condition keys and their order, owned by `packs/source-resolution`.
- **Non-goal:** building or changing any lint, GritQL, or CI gate.
- **Non-goal:** renaming or restructuring existing packages to comply; the pack flags, follow-up work fixes.
