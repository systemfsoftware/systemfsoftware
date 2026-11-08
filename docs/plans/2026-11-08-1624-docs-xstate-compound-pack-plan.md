---
title: XState Compound Pack - Plan
type: docs
date: 2026-11-08
topic: xstate-compound-pack
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
---

# XState Compound Pack - Plan

## Goal Capsule

- **Objective:** Make consistent XState guidance available to agents across first-party repositories without making cell architecture own library-specific APIs.
- **Means:** Publish a separately declared pack with the XState source and narrow the existing cell-state rule to its ownership decision.
- **Product authority:** The owner requested a separate pack, cross-repository enrollment, and a requirements document before implementation.
- **Open blockers:** None for planning. Publishing the source pack and changing consumer repositories require work in those repositories.

## Product Contract

### Summary

Provide versioned XState usage rules from the library's repository, and declare that pack throughout participating first-party repositories. Keep cell architecture responsible for state ownership and the decision to use a machine, not the details of XState APIs.

### Problem Frame

The current cell-architecture rule contains concrete XState machine, actor and store APIs. Library evolution can make those details stale independently of the library's source, and a repo that has not declared the rule cannot receive it through pack discovery.

### Key Decisions

- **Library-owned pack.** Prefer the XState source repository over a second library-specific pack in this repository: API and usage guidance evolve under the same owner. The resolver can fetch a pinned Git source and subdirectory. Governs R1, R2.
- **Enroll before first use.** Declare the pack in every participating first-party repository, including those without an XState dependency, so guidance is available when a new machine is proposed. Match rules by their situational triggers, not by assuming all rules apply everywhere. Governs R3, R4.
- **Separate selection from implementation.** Cell architecture retains its state-ownership decision and cites the XState pack for library-specific usage. Governs R12, R13.

### Requirements

**Source and enrollment**

- R1. Place the XState pack in `systemfsoftware/xstate` as a resolver-readable source directory, with its rule files versioned alongside that repository's releases.
- R2. Make each consumer declaration use an explicit immutable Git ref compatible with its XState packages, and update the declaration when the compatible library release changes.
- R3. Enroll the pack in each participating first-party repository, including the library repository itself and repositories not yet depending on an `@systemfsoftware/xstate*` package.
- R4. Declare the pack explicitly in each repository's `.compound-engineering/config.yaml`, preserving existing pack entries and avoiding duplicate pack IDs.
- R5. State that a package dependency, Nix `file:` catalog entry, or installed tarball alone does not enroll a pack under the current resolver.
- R6. Verify that the declared source resolves to the intended pack and that applicable rules are selected in a real agent session; discovery alone is not evidence of uptake.

**Rule coverage**

- R7. Specify how to choose a named-state machine, an observable store, or a plain keyed table or counter based on the state and its transitions and subscriptions.
- R8. Specify that a machine actor belongs to its Layer-built service and is started and stopped with that service's scope.
- R9. Forbid hand-rolled status-field machines where the machine decision in R7 applies, and forbid global or module-level live actors.
- R10. Require machine tests to exercise model paths with `@systemfsoftware/xstate-test` against observable behavior rather than certify a mocked implementation against itself.
- R11. Require typed events and guards at the machine boundary, using APIs actually exported by the selected fork version.
- R12. Keep the named-state machine and Layer ownership decision in `compound-packs/cell-architecture/instance-state-lives-in-the-constructor.md` and cross-link the XState pack for its detailed rules.
- R13. Remove library-specific API instructions from that cell-architecture rule without removing its existing state ownership, cache and request-context boundaries.
- R14. Give every rule a clear scope, situational `applies_when`, defined decision terms, and at most one short WRONG/RIGHT pair, following the local pack conventions. (pack: cell-architecture, instance-state-lives-in-the-constructor.md)
- R15. Ground named APIs and examples in the fork's public exports at the applicable pinned source revision, and record any experimental API status.

### Acceptance Examples

- AE1. **Covers R3-R5.** A first-party repository without XState installed still declares the pack; merely adding a dependency does not make the resolver load it.
- AE2. **Covers R7-R9.** A connection lifecycle has an owned scoped machine actor, while an unsubscribed keyed counter remains a service-owned table or reference.
- AE3. **Covers R10-R11, R15.** A machine with typed events is tested through model paths and externally observable outcomes, using a test API verified in the fork rather than an invented import.
- AE4. **Covers R6, R12-R13.** A real agent session planning a stateful service identifies the relevant declared guidance and its source; the cell rule does not duplicate library-specific instructions.

### Scope Boundaries

- This document changes no pack, application, dependency, repository enrollment, or CI configuration.
- No new enforcement gate is authorized by this requirements document. Pack rules guide agent judgment and do not themselves enforce dependency-based enrollment.
- UI atom consumption and schema tagged unions remain governed by their existing rules; the XState pack must not duplicate or contradict those boundaries.
- The existing module-state plan is a separate artifact. If both plans are proposed in one PR, consolidate them first to satisfy REPO-D2.

### Dependencies and Assumptions

The recommended rollout covers first-party repositories participating in the shared Compound Engineering conventions, not arbitrary third-party repositories. A complete repository inventory and the compatible pack ref for each consumer must be established during planning; no fleet-wide enrollment is claimed here. The XState repository's config lookup at the cited commit returned HTTP 404, so its existing CE enrollment has not been established.

Git pack refs and Nix package versions are independent inputs. A release tag or commit must actually contain the pack before consumers can pin it; a repo hosted pack does not by itself put rules in a published npm tarball. The resolver warns and continues when a Git source is unreachable, so declared enrollment is not a fail-closed guarantee.

### Sources

- [Compound Packs guide](https://github.com/EveryInc/compound-engineering-plugin/blob/main/docs/guides/packs.md): declared sources, pinned Git refs, pack discovery, rule matching and source cache behavior.
- `compound-packs/README.md` and `.compound-engineering/config.yaml`: local rule shape, enrollment and the 13 currently declared roots. The local `ce-brainstorm` `scripts/packs-resolve.py` reads CE configuration entries and path or Git sources, not dependency manifests.
- Fork source at `688aabff96cee96c168d80b277b7616f9faca67d`: [`@systemfsoftware/xstate` exports `createMachine` and `setup`](https://github.com/systemfsoftware/xstate/blob/688aabff96cee96c168d80b277b7616f9faca67d/packages/xstate/src/index.ts), with typed schemas and guards in [`setup`](https://github.com/systemfsoftware/xstate/blob/688aabff96cee96c168d80b277b7616f9faca67d/packages/xstate/src/setup.ts).
- Fork source: [`@systemfsoftware/xstate-effect` exports `createEffectActor`](https://github.com/systemfsoftware/xstate/blob/688aabff96cee96c168d80b277b7616f9faca67d/packages/xstate-effect/src/index.ts), whose [implementation](https://github.com/systemfsoftware/xstate/blob/688aabff96cee96c168d80b277b7616f9faca67d/packages/xstate-effect/src/createEffectActor.ts) starts an actor and releases it with its enclosing scope.
- Fork source: [`@systemfsoftware/xstate-store` exports `createStore`](https://github.com/systemfsoftware/xstate/blob/688aabff96cee96c168d80b277b7616f9faca67d/packages/xstate-store/src/index.ts); [`@systemfsoftware/xstate-test` exports `testPaths`](https://github.com/systemfsoftware/xstate/blob/688aabff96cee96c168d80b277b7616f9faca67d/packages/xstate-test/src/index.ts), documented as experimental in its [implementation](https://github.com/systemfsoftware/xstate/blob/688aabff96cee96c168d80b277b7616f9faca67d/packages/xstate-test/src/propertyTest.ts).
