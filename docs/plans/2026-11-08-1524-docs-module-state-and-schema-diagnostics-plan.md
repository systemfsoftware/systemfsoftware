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
- **Means:** Extend the state rule and add a schema diagnostic (KTD1).
- **Product authority:** The owner confirmed both placements and the incident's evidentiary limits.
- **Stop conditions:** A new gate or external consumer change requires its own authorization and owner.
- **Execution profile:** Implement the pack rules and verify consumer pickup; do not alter application code.

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
- R12. Make generation constructive without weakening the decoded domain or reducing property runs, including when heavy discards occur against an already-correct schema. (pack: schema-modelling, generation-constraints-the-derivation-reads.md)
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
- AE3. **Covers R9–R13.** If the schema admits independently established domain-forbidden values, strengthen it, construct valid inputs, and delete only guards rendered unreachable; if the schema is already correct but discards are heavy, fix generation without changing the domain.
- AE4. **Covers R10, R14.** If accepted cases are slow with low discard and invalid-input shares, or contention changes timing materially, investigate measured computation or contention instead of declaring an anemic schema the cause.
- AE5. **Covers R11, R14.** A weekly trading interval that crosses the week boundary and a closing time expressed in a different zone remain valid unless independent domain evidence establishes otherwise.
- AE6. **Covers R17, R18.** A detector flags an observable module-level mutation but does not reject an immutable literal merely because it is declared at module scope; opaque factory behavior is not certified safe.

### Scope Boundaries

- This plan changes pack guidance and verifies its consumption; it does not change production code, tests, CI, or a private application's source.
- The existing pack rules retain ownership of schema construction, import-time effects, configuration, service provisioning, and generation details; the diagnostic links to them rather than duplicating them.
- The incident is an example of a rejected ownership workaround and an unproven schema hypothesis, not a worked proof of causation.

---

## Planning Contract

**Product Contract preservation:** Changed R12 and AE3 to incorporate the accepted review finding: heavy discards alone do not justify a domain change. Other product decisions and IDs are preserved.

### Key Technical Decisions

- KTD1. **Extend one rule and add one diagnostic.** The two existing packs are already declared in `.compound-engineering/config.yaml`; keep each normative obligation in its owning rule and cross-link them. (pack: cell-architecture, instance-state-lives-in-the-constructor.md) (pack: schema-modelling, invariants-live-in-the-schema.md)
- KTD2. **Treat pack discovery and behavioral uptake as separate evidence.** A resolver finds pack roots; only a real fresh agent session demonstrating selection and use of each applicable rule proves pickup. Neither proves deterministic enforcement. `compound-packs/README.md` and the CE pack resolver define the delivery path.
- KTD3. **Defer a new detector to the instrument owner.** A bounded AST detector is feasible for syntactically proven cases, but the current filename-limited rule is not complete or sound for the full semantic contract. A new gate requires explicit approval and a separate owner under R19.
- KTD4. **Leave the absent CI cross-link unresolved.** Do not invent a `ci-wall-clock` rule or link to a historical pack that this branch does not publish; retain the missing target in the delivery report.

### Detector feasibility

`packages/oxlint-plugin/oxlint-plugin-cell-architecture/src/rules/kind-file-holds-no-module-state.ts` runs only on `.blueprint.ts` and `.handle.ts` files. It reports top-level non-`const` declarations, directly constructed `Map`, `Set`, `WeakMap`, and `WeakSet`, selected Effect Ref constructors, and direct writes or named mutators on top-level array/object literals. `module-origin.ts` resolves selected import aliases; `module-scope.ts` enumerates top-level declarations.

The present implementation is not a proof of the requested detector: constructor matching is spelling-based, and literal-write analysis does not resolve all aliases, shadowing, escapes, nested mutator receivers, or unknown factories. It can also report a same-named local constructor or shadowed identifier, so do not present it as false-positive-free.

A future detector's sound subset can report actual reassignment of a resolved module binding, mutation of a resolved module-owned literal through statically resolved local aliases, and construction or mutation of a resolved built-in mutable container. It must resolve lexical bindings and built-in origins rather than names, include nested property writes and known mutators, and exclude immutable literals, schemas, Context tags, and Layer descriptions. Unknown factory behavior, arbitrary cross-module aliases, reflective mutation, runtime ownership and exception justification are unproven and remain review cases, not passes. Validate this subset with positive and negative examples before proposing enforcement; neither a lint fixture nor a filename suffix proves universal coverage.

**Counter-case:** Broadly flagging every `let`, collection name or factory call would find more candidates, but flags immutable construction, shadowed names, and valid runtime-context carriers without establishing state lifetime. A scope-aware proven subset plus explicit unknowns avoids that false precision. Gritlint is invoked by `pnpm lint:conventions`; its capacity for this semantic analysis is unverified and is not a basis for an enrollment claim. Codegraph is useful for investigation, not established here as an enforcement gate.

### Assumptions

- The user-directed plan-write proceeds without a second scope confirmation; the product contract and accepted correction remain authoritative.
- A real agent session can be run by the implementation owner with the relevant CE skill and access to the changed checkout; if not, pickup remains unverified rather than inferred from resolver output.

---

## Implementation Units

### U1. Extend instance-state ownership

**Goal:** Make the existing rule cover the full ownership and exception contract without a competing state rule.

**Requirements:** R1–R8; AE1–AE2; KTD1.

**Dependencies:** None.

**Files:** `compound-packs/cell-architecture/instance-state-lives-in-the-constructor.md`; consult `compound-packs/cell-architecture/services-are-provided-once-at-the-composition-root.md` and `compound-packs/configuration/settings-reach-code-through-context.md`.

**Approach:** Update the title and `applies_when` to include state in libraries and composition roots. Replace the broad composition-root carve-out with R6–R7's closed categories and proof obligations. Cover the actual alternatives in R4–R5, deep immutability limits, `WeakMap`, `Context` tags, `FiberRef`, and production cache evidence. Add the schema-diagnostic cross-link after U2; keep the rule short and avoid incident details in the pack.

**Test expectation:** No permanent test for prose; use the real-session scenarios in the Verification Contract.

**Verification:** The triggering cache is rejected, immutable declarations and justified context carriers are distinguished, and ownership alternatives cover cache, registry, counter, connection, and config.

### U2. Add the schema diagnostic

**Goal:** Make symptom-to-cause investigation distinguish weak domains, sparse generation, actual work, and contention.

**Requirements:** R9–R15; AE3–AE5; KTD1, KTD4.

**Dependencies:** U1 for the reciprocal link.

**Files:** Create `compound-packs/schema-modelling/diagnose-slow-properties-before-optimizing.md`; consult `compound-packs/schema-modelling/invariants-live-in-the-schema.md`, `states-are-tagged-unions.md`, and `generation-constraints-the-derivation-reads.md` in the same directory; update the U1 rule for the reciprocal link.

**Approach:** Use the standard top-level rule frontmatter and symptom-shaped `applies_when`. Direct the reader through R10's measurements and independent domain evidence, then link to the existing invariant, union, and generation owners for the applicable remedy. Explicitly distinguish a correct schema with high discards from a schema admitting forbidden values. Keep the incident and unproven causal claims out of the rule body. Preserve valid weekly wraparound and independently chosen close zones when discussing examples.

**Test expectation:** No permanent test for prose; use the real-session scenarios in the Verification Contract.

**Verification:** A correct but sparse schema leads to constructive generation alone; a proven weak schema leads to R11–R13; low rejection and slow accepted cases do not become a schema diagnosis by assertion.

### U3. Verify discovery and actual agent uptake

**Goal:** Show that both changed rules are discoverable and selected by a real agent, not merely present on disk.

**Requirements:** R15–R19; AE6; KTD2–KTD4.

**Dependencies:** U1 and U2.

**Files:** `.compound-engineering/config.yaml`; `compound-packs/README.md`; both rule files from U1 and U2.

**Approach:** The two packs are already enrolled by directory, so do not add duplicate declarations or regenerate an index unless a repository consumer actually requires one. Confirm valid frontmatter and top-level placement through the same CE resolver the real session invokes; check its JSON warnings and errors rather than treating exit zero as discovery. Then run fresh, separate relevant agent sessions through the configured CE workflow, with neutral tasks that do not name the rule or its conclusion. Retain session transcripts outside the repository as evidence.

**Test scenarios:** No permanent fixture suite; exercise these observable session scenarios:

- A task proposing a module-scoped cache for test speed causes the agent to identify the state rule and recommend an owned alternative.
- A slow property with a correct schema and high discards causes the agent to identify the diagnostic and recommend constructive generation without changing the domain.
- A property with independently established forbidden accepted values causes the agent to distinguish a domain fix from a generation-only fix.

**Verification:** For each session, the transcript shows the resolver result, rule file read or citation, and a decision consistent with the scenario. A missing tool call, empty response, absent citation/read, or inaccessible session is a failed or blocked uptake check, not proof of pickup. These probes show observed uptake, not an enforcement guarantee.

---

## Verification Contract

- Inspect the actual resolver output for the declared `cell-architecture` and `schema-modelling` roots and any warnings or errors; `.compound-engineering/config.yaml` already names both. Rules must be top-level Markdown with `title` and `applies_when`; the README is not itself a rule.
- Execute U3's real-session scenarios with the actual CE skill in a fresh session and record the trace, input, output, model and checkout identity. Keep private application names and paths out of committed evidence. This plan does not prescribe an unverified CLI invocation.
- Do not run mutation, end-to-end, journey, Playwright, or full-gate suites on this host (OP28). If the required agent-session proof is an end-to-end lane, run it off-host and report the exact command, environment, checkout, and result; a resolver-only check is not a substitute.
- Pack prose creates no new test, lint gate, or CI requirement. Any later instrument proposal follows R19 and `repos/constitution/ENFORCEMENT.md`; its clean-tree enrollment and independent owner are prerequisites, not work hidden in U1–U3.

---

## Definition of Done

- U1 and U2 satisfy their traced requirements and retain the existing pack format and non-duplication boundaries.
- U3 records observed discovery and real-session uptake for all three scenarios, or explicitly reports the unavailable session as a blocker.
- The absent CI wall-clock cross-link and detector enforcement are reported as unresolved external follow-ups; no fabricated link or silently introduced gate ships.
- No abandoned fixtures, scratch outputs, unrelated edits, or private incident identifiers remain in the deliverable.
