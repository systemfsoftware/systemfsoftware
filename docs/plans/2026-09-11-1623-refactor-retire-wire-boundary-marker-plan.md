---
title: Retire the Wire Boundary Marker - Plan
type: refactor
date: 2026-09-11
topic: retire-wire-boundary-marker
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Retire the Wire Boundary Marker - Plan

## Goal Capsule

- **Objective:** Nobody reading this repository believes the foreign-data boundary is enforced when it is not. The marker that carried that impression is gone, and the unenforced gap is written down, evidenced, and handed to a named owner.
- **Means:** delete the `Wire` module and its glossary entry; ship a record of every form by which a schema can claim a type it never examined, with the tree's live instances and the statement that no command refuses any of them (KTD1, KTD2).
- **Product authority:** the repository owner directed the retirement and settled deletion-only — no refusing command is proposed, specified, or built in this change; further instrument questions route to the instrument owner through the published record.
- **Stop conditions:** if the verification chain cannot pass without reintroducing a marker form, stop and report; the deletion is not negotiable downward. If a consumer outside this workspace surfaces a dependency on the removed exports, stop and report before shipping.
- **Execution profile:** units run sequentially U1→U6 under one executor; U6 lands last. No agent starts a mutation run (`REPO-D3`).
- **Tail ownership:** the executor delivers the pull request and watches checks to green via `REPO-D1`; merging stays human.

---

## Product Contract

### Summary

`@systemfsoftware/effect-cell-types` stops exporting the wire marker, its ten importers move to plain Effect Schema with identical decoded and encoded types, and the boundary hole the marker appeared to close is published as a written record addressed to the instrument owner.

### Problem Frame

The marker was built to answer a question the repository has since answered differently: _who declared this type_. The canon discriminator is _where the bytes have been_ — a value is foreign when it has crossed a process, machine, disk, or serialisation boundary since this process established its invariants. Authorship is the wrong axis, and answering by authorship is what makes the test feel subjective: co-development is not trust, and a workspace-local alias of a vendor type defeats any specifier-keyed predicate.

The instrument followed the axis. Its guarantee is a structural phantom property on a schema, obtainable from a function any call site can call, and therefore a claim rather than a certificate. Five forgery routes were measured against the built package; all compiled without a cast, and the decisive one — donating the marker from a legitimately marked primitive onto a vendor schema — names nothing from the module at all. A marker that any call site can write down certifies only that its author wrote it.

The defect that motivated the work is still open and was never about foreignness. It is a type that claims an examination that never ran. The reproduced case named a foreign type _and_ asserted it with a predicate that admitted any array; the damage came from the predicate, and an identical lie compiles with a wholly domestic type. One such site is live in first-party source today, in a file that has never imported the marker. The library compounds it: every schema's default constructor accepts a documented option that skips checks, and the vendor documentation recommends it whenever the author trusts the data — a judgement no type can make on the author's behalf.

So the marker does not close the hole, and its presence reads as though it does. A zero-examination guarantee is worse than a stated absence, because it removes the reason to look.

### Key Decisions

- **The axis is examination, not provenance.** A schema's obligation is to refuse what its type says it refuses; where a type was declared is not a question this work answers. Governs R6.
- **Deletion over reconstruction.** No rebuilt marker survives the certificate test, because the ecosystem ships a documented off-switch on the constructors a marker would depend on, and no refusing command ships beside the deletion. Governs R1, R2, R6, R8. (session-settled: user-directed — chosen over a rebuilt idiomatic marker, over a declaration-resolving checker, and over bundling a gate specification beside the deletion: the owner rejected each instrument proposed in the marker's place, and the graded work may not build its own grader)
- **The gap is published, not patched.** Building the gate that would close it is an Evaluator surface, and the graded work may not build its own grader. Governs R6, R7.
- **No new tests.** The only test change is the deletion of assertions whose subject no longer exists. Governs R3.

### Requirements

**Deletion**

- R1. The marker module's seven exports leave the published surface, and no file in the workspace imports any of them afterwards.
- R2. Every call site that used the marker is rewritten to plain Effect Schema with the same decoded type and the same encoded type per member; a member that was admitted wholesale as unknown stays unknown, now stated plainly.
- R3. The type assertions that pinned the marker's refusals and its forgery routes are deleted with it, and no surviving assertion names a removed export.

**Doctrine**

- R4. The glossary no longer defines a wire declaration. Retirement of the entry is routed through the capability that owns glossary retirement, not edited inline by this work.
- R5. The measured postmortem on donatable phantom marks survives as a mechanism analysis in the present tense; it neither claims the marker is shipped nor carries a supersession note.

**The published gap**

- R6. A written record ships with this change naming each form by which a schema can assert a type it does not examine — the unchecked cast, the check-skipping constructor option, the declared type with an inadequate predicate, the unknown admitted at a boundary, the zero-filter brand, and the deleted marker — with the tree's live instances and the statement that no command refuses any of them.
- R7. The record names the instrument owner as its recipient, states that building the refusing command is outside this work, and separates what a text gate can refuse outright from what it can only require justification for.
- R8. The one capability the deletion gives up is stated explicitly in the record: a raw vendor schema dropped into a marked struct field no longer fails to compile.

### Acceptance Examples

- AE1. Rewritten member keeps both types
  - **Covers R2.**
  - **Given:** a member previously written as a marked finite number carrying a range check
  - **When:** the call site is rewritten to plain Schema
  - **Then:** the decoded type and the encoded type are unchanged, and no marker appears in the expression
- AE2. Wholesale admission stays honest
  - **Covers R2.**
  - **Given:** a member previously marked over `Unknown` to satisfy the marker
  - **When:** the call site is rewritten
  - **Then:** the member is `Unknown` with no wrapper, and the record names this shape as an unrefused form
- AE3. A cold reader can enumerate the gap
  - **Covers R6, R7.**
  - **Given:** an engineer or agent who was not in this work
  - **When:** they read the record once
  - **Then:** they can name every unrefused form, point at a live instance of each, and say which of them a text gate could refuse outright
- AE4. The given-up refusal is visible
  - **Covers R8.**
  - **Given:** a vendor schema placed directly as a struct member
  - **When:** the file is compiled after this change
  - **Then:** it compiles, and the record states that it does

### Success Criteria

- The instrument owner can act on the record without a follow-up question: every named form carries a live instance or an explicit statement that none exists.
- A reader of the package's published surface finds no type whose purpose is to mark provenance.

### Scope Boundaries

- Deferred: the refusing command itself; the obligation that a boundary schema be refuted by a checked-in corpus of real payloads it must reject; generating boundary schemas from a machine-readable foreign contract where one exists; any change to the cell spine's phase typing.
- Outside: adopter-facing reach. Nothing here promises a refusal in a stranger's compiler, and the marker's published declaration was the only channel that ever carried one.
- Outside: the declaration-resolving checker specified in 2026-08-15. Its predicate answers the provenance question this work drops, and the evidence directory it was justified by is gitignored scratch that no longer exists in any checkout.

### Dependencies / Assumptions

- A1. The check-skipping constructor option is public, documented vendor API, recommended for trusted input, and demonstrated by the vendor on a branded schema. A future gate therefore refuses a documented option, and its message must say why the option is unavailable at a boundary. Warrant: vendor primary documentation.
- A2. No command in this repository refuses any form named in R6. Warrant: assumption scoped to what was searched — the guard directory, the root script chain, and the lint rule inventory; absence of a firing is not provable from the tree, so this is recorded rather than asserted.
- A3. A text gate can refuse an unchecked cast and a check-skipping option outright, but can only require justification for a declared type, because the declaration form is legal and only its predicate can be inadequate. Warrant: derived, and it is the reason R7 separates the two classes.
- A4. Destructive review ran before this write under the Inversion lens; the inverted design — keep the marker, ban the escape hatches — was rejected because the marker is itself one of the forms an author writes to silence the compiler, and its own guarantee is donatable. Its residue is R8.
- Dependency: R4's route depends on the glossary-retirement capability being invoked rather than bypassed.

### Sources / Research

- `packages/effect-cell-types/src/Wire.ts` — the marker, its door, and its struct wrapper
- `packages/effect-cell-types/test-types/Wire.tst.ts` — refusals and forgery routes pinned as passing assertions
- `packages/effect-cell-types/src/Cell.ts`, `src/Workflow.ts` — the sibling brands, both registered symbols rather than unexported ones
- `packages/stryker-js/stryker-js-vitest-runner/src/Runner.schema.ts:59-62` — the live declared type with an inadequate predicate
- `docs/plans/2026-08-15-001-feat-foreign-edge-boundary-law-plan.md` — the law this retires, its reproduced corruption, and its unshipped checker
- `docs/plans/2026-08-27-001-feat-wire-declaration-boundary-plan.md` — the surface shrink that landed and the guard that did not
- `docs/solutions/architecture-patterns/phantom-marks-are-donatable.md` — the measured forgery routes
- `docs/solutions/architecture-patterns/cell-suffix-fleet-deleted-unowned.md` — the deleted ACL suffix rule and its empty catch record
- `CONCEPTS.md` — the wire-declaration entry and the generated-schema-law entry, which covers only what a schema accepts
- `CONSTITUTION.md` — `CONST-S4`, `CONST-E9`, `CONST-B5`, `CONST-T10`
- <https://effect.website/docs/v4/schema/default-constructors> — the documented check-skipping option, including on a branded schema
- <https://cekrem.github.io/posts/parse-dont-validate-typescript/> — the ecosystem's independent arrival at an unexported-symbol brand, one cast inside the parser, and a lint rule to keep it from leaking

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Deletion-only scope.** No refusing command is proposed, specified, or built in this change; the R6 record is the entire handoff, addressed to the instrument owner, and separates text-refusable forms from justification-only forms per A3. (session-settled: user-directed — chosen over bundling a gate specification beside the deletion: `CONST-E9` forbids the graded work from building its own grader) Governs R6, R7.
- KTD2. **Call sites unwrap to the expression they already evaluated to.** `Wire.wire(f)` → `S.Struct(f)`; `Wire.mint(x)` → `x`; `Wire.Minted<A, I>` → `S.Codec<A, I>`; `Wire.Fields` → `S.Struct.Fields`; the namespace import is removed. `mint` was an identity function behind an assertion signature, so every member keeps its decoded and encoded type. Governs R2.
- KTD3. **Doctrine rewrites, never tombstones.** The glossary entry is deleted through the capability that owns glossary retirement, and the postmortem keeps its mechanism analysis in the present tense with no supersession note. (session-settled: user-directed — chosen over supersession notes in the doctrine: a "no longer shipped" note is a tombstone) Governs R4, R5.
- KTD4. **Release intents follow the turbo build hash.** `major` intent on `@systemfsoftware/effect-cell-types` (seven published exports removed, migration is the unwrap map); `none` intents on the consumer packages whose sources change without a surface change. Governs R1.
- KTD5. **Lint-plugin fixtures keep their coverage with a local factory.** The two rules under test key on wrapper-call transparency, not on the marker's name, so each fixture replaces the removed namespace import with a local identity factory and asserts the same findings. Governs R3.

### Assumptions

- The marker's forgery-probe directory does not exist in this checkout (glob over the package returned no such path).
- No consumer outside this workspace is known to depend on the removed exports; the verification chain and `attw` are the arbiters at ship time.
- Product Contract preservation: unchanged except R5, rewritten from a supersession-note requirement to a no-tombstone requirement at the owner's direction; the blocking Outstanding Question was settled deletion-only and the section is resolved rather than carried.

---

## Implementation Units

### U1. Unwrap marker call sites

- **Goal:** every member that carried the marker is a plain Effect Schema expression with identical decoded and encoded types.
- **Requirements:** R2 (per KTD2).
- **Dependencies:** none.
- **Files:** `packages/stryker-js/stryker-js/src/ReporterEvent.schema.ts`, `packages/stryker-js/stryker-js/src/Run.schema.ts`, `packages/stryker-js/stryker-js/src/Schema.schema.ts`, `packages/stryker-js/stryker-js-engine/src/Config.schema.ts`, `packages/stryker-js/stryker-js-engine/src/Config.ts`, `packages/stryker-js/stryker-js-engine/src/IncrementalReport.schema.ts`, `packages/stryker-js/stryker-js-engine/src/Worker.schema.ts`, `packages/stryker-js/stryker-js-html-reporter/src/Reporter.schema.ts`, `packages/stryker-js/stryker-js-instrumenter/src/Instrument.schema.ts`, `packages/stryker-js/stryker-js-typescript-checker/src/CheckMutants.schema.ts`.
- **Approach:**
  - strip `Wire.mint(` with its balanced closing paren, innermost nesting included
  - rewrite `Wire.wire(` to `S.Struct(`, `Wire.Fields` to `S.Struct.Fields`, `Wire.Minted<` to `S.Codec<`
  - remove the namespace import where no other reference remains
- **Test scenarios:**
  - Covers AE1, AE2. Each touched package's existing typecheck, test, and lint suites pass unchanged — the rewrite is type-identical and value-identical per member, so the shipped suites are the witness.
- **Test expectation:** none — no new tests by Key Decision; the existing suites are the oracle.
- **Verification:** `pnpm --filter <pkg> typecheck && pnpm --filter <pkg> test && pnpm --filter <pkg> lint` exits 0 for every touched package.

### U2. Delete the marker module and its assertions

- **Goal:** the seven exports and their type assertions no longer exist in the package.
- **Requirements:** R1, R3.
- **Dependencies:** U1.
- **Files:** `packages/effect-cell-types/src/Wire.ts` (deleted), `packages/effect-cell-types/test-types/Wire.tst.ts` (deleted), `packages/effect-cell-types/src/mod.ts`.
- **Approach:** delete the module and its assertion file whole; remove the barrel export line.
- **Test scenarios:**
  - the package's `test:types` and `test` suites pass without the deleted assertions
  - a workspace-wide search for the marker's import specifier returns no production hit
- **Verification:** package `typecheck`, `test:types`, `test` exit 0; search clean.

### U3. Retire the doctrine entries

- **Goal:** the glossary no longer defines the marker, and the postmortem reads as a present-tense mechanism analysis.
- **Requirements:** R4, R5 (per KTD3).
- **Dependencies:** U2.
- **Files:** `CONCEPTS.md` (through the glossary-retirement capability), `docs/solutions/architecture-patterns/phantom-marks-are-donatable.md`.
- **Approach:** delete the wire-declaration entry through the owning capability; keep the postmortem's analysis, its route table, and its diagnostic trap in the present tense with no supersession note.
- **Test expectation:** none — documentation only.

### U4. Preserve lint-plugin fixture coverage

- **Goal:** the two rules keep their wrapper-transparency and can't-decide coverage without the marker's name.
- **Requirements:** R3 (per KTD5).
- **Dependencies:** none.
- **Files:** `packages/oxlint-plugin/oxlint-plugin-effect-schema/src/rules/__tests__/schema-declaration-location.test.ts`, `packages/oxlint-plugin/oxlint-plugin-effect-schema/src/rules/__tests__/schema-checked-element-named.test.ts`.
- **Test scenarios:**
  - the local-factory fixture still passes as a can't-decide case
  - the union-array fixture still reports one error per checked member through the wrapper
- **Verification:** `pnpm --filter @systemfsoftware/oxlint-plugin-effect-schema typecheck && pnpm --filter @systemfsoftware/oxlint-plugin-effect-schema test && pnpm --filter @systemfsoftware/oxlint-plugin-effect-schema lint` exit 0.

### U5. Regenerate the API report and write release intents

- **Goal:** the published surface report matches the shrunken export set, and every moved build hash carries an intent.
- **Requirements:** R1 (per KTD4).
- **Dependencies:** U2.
- **Files:** `packages/effect-cell-types/etc/effect-cell-types.api.md`, `.changeset/*`.
- **Approach:** regenerate the API report; write the `major` intent for the marker package with the unwrap map as its consumer-facing body, and `none` intents for the touched consumer packages.
- **Test scenarios:**
  - the changeset gate concedes the pull request — no missing-intent failure
- **Verification:** `pnpm --filter @systemfsoftware/effect-cell-types api:check` exits 0.

### U6. Full verification chain and pull request

- **Goal:** the whole change satisfies the repository's definition of done and lands as a watched pull request.
- **Requirements:** global.
- **Dependencies:** U1–U5.
- **Verification:** `pnpm check:local` exits 0 after the last edit; the pull request is opened and watched to green (`REPO-D1`).

---

## Verification Contract

| Scope                  | Command                                                                                                                                                                                                                                                                                                                                                              | Proves     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Marker package         | `pnpm --filter @systemfsoftware/effect-cell-types typecheck && pnpm --filter @systemfsoftware/effect-cell-types test:types && pnpm --filter @systemfsoftware/effect-cell-types test && pnpm --filter @systemfsoftware/effect-cell-types lint && pnpm --filter @systemfsoftware/effect-cell-types api:check && pnpm --filter @systemfsoftware/effect-cell-types attw` | R1, R3     |
| Consumer packages      | `pnpm --filter <pkg> typecheck && pnpm --filter <pkg> test && pnpm --filter <pkg> lint` for each touched stryker-js package                                                                                                                                                                                                                                          | R2         |
| Lint-plugin fixtures   | `pnpm --filter @systemfsoftware/oxlint-plugin-effect-schema test`                                                                                                                                                                                                                                                                                                    | R3 (KTD5)  |
| Migration completeness | workspace search for the marker's import specifier — production hits must be zero                                                                                                                                                                                                                                                                                    | R1         |
| Published gap record   | the record names all six forms with live instances or an explicit none                                                                                                                                                                                                                                                                                               | R6, R7, R8 |
| Whole repository       | `pnpm check:local` after the last edit                                                                                                                                                                                                                                                                                                                               | `REPO-D1`  |
| Pull request           | checks watched to green                                                                                                                                                                                                                                                                                                                                              | `REPO-D1`  |

---

## Definition of Done

- U1–U5 complete; every Verification Contract row exits 0.
- `pnpm check:local` exits 0 after the last edit (`REPO-D1`).
- The published gap record names all six unrefused forms, addresses the instrument owner, and states the given-up refusal (R6–R8).
- No mutation run is started by an agent (`REPO-D3`); the advisory Mutation workflow report stays advisory.
- Cleanup: no scratch transform scripts remain anywhere in the tree; the only new files are the plan artifact and the release intents.
- Pull request open and watched to green; merge left to the human.
