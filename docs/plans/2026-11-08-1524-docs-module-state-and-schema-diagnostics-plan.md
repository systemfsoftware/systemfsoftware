---
title: Module State and Schema Diagnostics - Plan
type: docs
date: 2026-11-08
topic: module-state-and-schema-diagnostics
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Module State and Schema Diagnostics - Plan

## Goal Capsule

- **Objective:** Keep mutable state within its owner and direct slow-property investigations to evidenced root causes instead of process-wide caches.
- **Means:** Extend the existing cell-architecture rule and add a diagnostic alongside schema-modelling rules.
- **Product authority:** The owner confirmed both placements and the incident's evidentiary limits.
- **Open blockers:** None for planning.

## Product Contract

### Summary

Strengthen the existing guidance on module-scoped state and add a diagnostic connecting property-test symptoms and defensive workflows to potentially under-constrained schemas. The diagnostic distinguishes invalid generation and rejection from genuine computation and contention before prescribing a repair.

### Problem Frame

A rejected performance change used a module-scoped timezone-parts cache to speed properties under contention. The cache retained mutable results across callers instead of belonging to a cell or scoped service. The incident also raises a schema question: its candle endpoints were independent integers and weekly clock fields were unrestricted integers, but those observations do not establish why the properties timed out.

Weekly sessions can wrap across the week boundary, and a close zone can differ from the trading-window zone. Neither simple endpoint ordering for weekly windows nor zone equality is justified without a domain invariant. Reported repeated timezone computation and contention are evidence to investigate, not proof of the cause of a particular CI timeout.

### Key Decisions

- **Extend existing ownership guidance** rather than create a competing pack (session-settled: user-approved — chosen over a new module-state pack: the existing rule already owns instance-state lifetime). Governs R1–R8.
- **Add a schema diagnostic beside existing schema-modelling rules** rather than duplicate their invariant and generation mechanisms (session-settled: user-approved — chosen over a separate schema-laws pack: current rules already own those mechanisms). Governs R9–R14.
- **Treat the incident's schema cause as unproven** (session-settled: user-directed — chosen over presenting it as an established cause: the available measurements do not demonstrate invalid-generation or rejection cost). Governs R10, R14.

### Requirements

**State ownership**

- R1. Extend `compound-packs/cell-architecture/instance-state-lives-in-the-constructor.md` to cover mutable state retained at module lifetime across library and application modules, including composition roots. (pack: cell-architecture, instance-state-lives-in-the-constructor.md)
- R2. Identify mutable bindings, mutable containers, caches, counters, registries, memo tables, connections, and stateful singletons by retained behavior and reachability, including mutation through aliases, closures, and nested values.
- R3. Permit immutable constants, schemas, functions, immutable lookup tables, and lazily constructed immutable values when their observable contents cannot change or grow after construction; `const`, TypeScript `readonly`, or shallow `Object.freeze` alone is not proof of deep immutability.
- R4. Give a memo cache, registry, or counter to its owning cell or service instance, using an instance-owned `Ref` or private closure as appropriate.
- R5. Acquire a connection within a scoped service or Layer and obtain application configuration through the existing configuration service; pass values explicitly when no service is needed. (pack: cell-architecture, services-are-provided-once-at-the-composition-root.md) (pack: configuration, settings-reach-code-through-context.md)
- R6. Restrict exceptional mutable module-lifetime state to a demonstrably necessary request-context carrier such as an `AsyncLocalStorage` instance or an explicitly identified platform-mandated singleton whose required lifetime cannot be represented by cell or Layer ownership.
- R7. Require each exception to identify its platform contract, why explicit or scoped ownership cannot satisfy it, its lifetime and cleanup, and evidence of request isolation; a `WeakMap` keyed by caller-owned objects does not qualify merely because its keys are weak.
- Effect `Context` tags are identities, not mutable service instances. A module-scoped `FiberRef` is permitted only as a context carrier meeting R6 and R7, never as a general cache or registry.
- R8. Require a measured production need for a cache and give it a cell or scoped-service owner; faster tests alone do not justify a cache or mutable module state.

**Schema diagnostic**

- R9. Add a diagnostic alongside `compound-packs/schema-modelling` that treats slow, flaky, or timing-out properties and repeated defensive validation, normalization, early returns, or invalid-input skipping as reasons to investigate schema constraints, not as proof of a defect.
- R10. Separate invalid generated inputs and rejection sampling from genuine computation and runner contention using discard ratios, the share of generated inputs that violate independently established domain rules, and time per accepted case under comparable uncontended and contended conditions.
- R11. When evidence establishes an under-constrained schema, first encode the real domain invariants using refinements, struct-level checks, or tagged unions as appropriate. (pack: schema-modelling, invariants-live-in-the-schema.md) (pack: schema-modelling, states-are-tagged-unions.md)
- R12. After the invariant is encoded, make generation constructive without weakening the decoded domain or reducing property runs. (pack: schema-modelling, generation-constraints-the-derivation-reads.md)
- R13. Delete workflow defenses made dead by the enforced invariant, while retaining branches for valid domain outcomes and external failures.
- R14. Do not treat a timeout as justification to raise timeouts, shrink runs, or use caches or module state to accelerate the workflow; do not assert the motivating incident's schema caused its timeout without supporting measurements.
- R15. Cross-link the state rule and schema diagnostic; record the requested CI wall-clock cross-link as unresolved because that pack is absent from this branch.

**Mechanical feasibility**

- R16. Evaluate the existing `kind-file-holds-no-module-state` Oxlint rule and available static tooling before proposing another detector; distinguish current filename-limited coverage from the desired behavior-based scope.
- R17. Specify a detector that identifies module-scope rebinding and demonstrably mutable containers or writes while accepting genuine immutable constants, schemas, tags, and Layer descriptions.
- R18. Account explicitly for aliases, nested writes, mutator calls, escaped references, lazy initialization, and unknown factory results; label unprovable cases for review rather than claim complete static detection without false positives.
- R19. Treat a new or changed enforcement gate as a separately owned proposal requiring operator approval, not as part of the pack-rule change. `repos/constitution/ENFORCEMENT.md` governs any eventual instrument.

### Acceptance Examples

- AE1. **Covers R2, R4, R8.** A module-scoped map evicting cached timezone conversions to make a property faster violates ownership even when the binding is `const`; an instance-owned cache needs demonstrated production benefit.
- AE2. **Covers R3, R6, R7.** An immutable schema or deeply immutable table is allowed; a `WeakMap` is not exempt, and a request-context carrier needs the stated evidence.
- AE3. **Covers R9–R13.** If independently established domain-invalid draws or discards dominate a property, strengthen the schema, construct valid inputs, and delete only the guards rendered unreachable.
- AE4. **Covers R10, R14.** If accepted cases are slow with low discard and invalid-input shares, or contention changes timing materially, investigate measured computation or contention instead of declaring an anemic schema the cause.
- AE5. **Covers R11, R14.** A weekly trading interval that crosses the week boundary and a closing time expressed in a different zone remain valid unless independent domain evidence establishes otherwise.
- AE6. **Covers R17, R18.** A detector flags an observable module-level mutation but does not reject an immutable literal merely because it is declared at module scope; opaque factory behavior is not certified safe.

### Scope Boundaries

- This artifact defines requirements only; it does not change pack rules, code, tests, CI, or a private application's source.
- The existing pack rules retain ownership of schema construction, import-time effects, configuration, service provisioning, and generation details; the diagnostic links to them rather than duplicating them.
- The incident is an example of a rejected ownership workaround and an unproven schema hypothesis, not a worked proof of causation.

### Outstanding Questions

- **Deferred to Planning:** Where should the CI wall-clock cross-link live if that pack remains absent when the rule is implemented?
- **Deferred to Planning:** Which existing static mechanism can soundly enforce the provable subset after its real coverage and enrollment are assessed?
