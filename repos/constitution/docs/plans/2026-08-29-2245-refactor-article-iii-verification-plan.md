---
title: Article III Verification Doctrine Rehaul - Plan
type: refactor
date: 2026-08-29
supersedes: docs/plans/2026-08-29-2210-refactor-article-iii-verification-plan.md
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Article III Verification Doctrine Rehaul - Plan

## Goal Capsule

- **Objective:** The constitution's verification law binds only what measured evidence supports — oracle independence, observer-fit test placement, change-relevant mutation over a named non-empty set, published-contract pinning before deletion, and recomputed gate keys — and no longer prescribes the Testing Trophy, mandatory mocked composition, blanket property coverage of the core, or characterization as a standing duty. The corpus gate is Deno. A reader outside this repo can confirm it: `pnpm test` passes with 33 rules across both corpus files, and `pnpm test --against <rev>` run after the corpus commit names exactly CONST-T1, CONST-T2, and CONST-T5 as vacated with no id reassigned.
- **Means:** The corpus gate is rewritten as a Deno script that implements the behavior the repo's own documentation specifies (vacated-id and uncompared-file reporting); Article III is replaced (vacate T1/T2/T5, reword T3, keep T4, mint T8–T14 plus CONST-E5); CONST-S4 is repointed to CONST-T9; AGENTS.md and README.md prose is reconciled (KTD1–KTD5; normative rule text in Appendix A).
- **Authority:** The H1–H12 verdict dossier and the org-mechanism specification (both delivered in the invoking conversation) govern doctrine conflicts. The corpus's own id-surgery table in AGENTS.md governs id handling. Ecosystem tooling law: Deno only for code (software-wiki harness law). The current corpus at `origin/main` (28 rules: 7 resident Article V + 21 retrieved) is the base being amended, not evidence of correctness (CONST-S2).
- **Execution profile:** One feature branch; four conventional commits in order — plan checkpoint, validator, corpus, prose — pushed together in one PR; no consumer-repo changes.
- **Stop conditions:** A gate failure not explained by the amendment's own edits stops the run. An edit whose find-pattern misses (grep still finds the old text after the edit) stops the run for repair. Implementation-time evidence contradicting a settled decision stops the run.
- **Tail ownership:** Branch shipping, PR, and CI watch belong to the calling pipeline. The org tree's watchdog and mutation-config updates belong to that repo after its next vendor pull.

---

## Product Contract

### Summary

Replace the Python corpus gate with a Deno script implementing the full documented behavior — schema, coverage, families, gates, dangling citations, cross-revision reassignment, and vacated-id/uncompared-file reporting. Rewrite Article III of `CONSTITUTION-ARTICLES.md` so the verification doctrine matches the evidence: observer-fit placement instead of trophy widths, a narrow grant for property tests instead of a blanket mandate, mutation gated on a named change-relevant set whose run also grades the test files, published-contract pinning instead of characterization, an independent-oracle requirement with a refusal complement, and one enforcement rule (CONST-E5) binding every gate's key to a recomputation. Repoint CONST-S4's rebuild pin from the vacated CONST-T5 to the new CONST-T9, and reconcile AGENTS.md and README.md so no prose teaches the vacated doctrine or a false rule count.

### Problem Frame

The org's enforcing tree already implements observer-fit placement, toothless-property detection, mutation of named sets, a contract lane driven from outside the process, and import-keyed test classification. The constitution still describes a Testing Trophy with mocked composition as the widest band and mandatory characterization before every rebuild. Agents obey `check:` lines, so the stale doctrine is not inert prose — it actively instructs behavior the enforcing tree refuted. The dossier (H1–H12, 73 primary sources) adjudicates the doctrine: same-session test generation is tautology-prone without an independent oracle (H1), the two-surface count is underdetermined (H2), decision-only mutation over-claims observer-fit (H5), a decision-layer fault-majority is false as a census (H6), and gates bind through accountability while advisory surfacing is inert (H12). The constitution must state principles at that altitude and leave mechanism binding to consumer trees, because consumer repos in several languages vendor this file.

The amendment prunes refuted doctrine and replaces it with a larger instruction surface: Article III grows from 5 to 9 rules and the corpus from 28 to 33. That growth is deliberate — each minted rule names an observer, oracle, or gate discipline the old five could not express, and the refuted doctrine is gone from every line the nine now occupy. The no-retirement id rule means each mint is permanent; that cost is accepted per rule, not in aggregate.

### Key Decisions

- **Vacate CONST-T1 and CONST-T5 rather than reword them.** The trophy and the characterization duty are refuted doctrine, not rewordable ones; their numbers stay vacant forever per the corpus's own id-surgery rule. (session-settled: user-directed — chosen over keeping trophy and characterization as reworded doctrine: the org tree's measured mechanisms and the dossier refuted both.) Governs R2, R3, R20.
- **The dossier adjudicates doctrine conflicts.** Where the org tree's current mechanisms and the evidence disagree, the evidence wins: mutation scope is change-relevant, not decision-only (H5); the organizing principle is oracle independence, not a surface count (H2). (session-settled: user-directed — chosen over encoding the org repo's mechanisms verbatim: H5 refuted decision-only scoping as observer-fit and H2 refuted the exhaustive two-surface claim.) Governs R5, R8.
- **CONST-E5 ships in this amendment.** The unforgeable-gate rule is in scope now, not deferred. (session-settled: user-directed — chosen over deferring gate-verification doctrine to a later amendment: user directed inclusion when the deferral was presented as default.) Governs R14.
- **Principles only — no tool names, no consumer names, no filename suffixes in rule YAML.** Mutation is an instrument class; how a tree scopes its mutant set is that tree's config. (session-settled: user-directed — chosen over naming the enforcing stack as exemplar: consumer repos in other languages vendor this file, and a named first consumer turns a house rule into law.) Governs R19.

### Requirements

**Corpus gate (Deno)**

- R1. `scripts/validate-constitution.py` is deleted; a Deno script at `scripts/validate-constitution.ts` implements the same gate — the two-file corpus contract, fenced-YAML coverage accounting, the rule schema (required, optional, and gate fields), the family registry, duplicate-id detection, dangling-citation resolution across both files, and the `--against` cross-revision reassignment check — plus the vacated-id and uncompared-file reporting on the success line that AGENTS.md and `docs/solutions/architecture-patterns/the-vacuous-pass-gate-input-sets.md` already specify. Exit codes: 0 clean, 1 with named defects, 3 unmeasurable. `pnpm test` invokes the script directly; the shebang carries the permission flags (read limited to the two corpus files, run limited to `git`); the `@std/yaml` dependency is declared in `deno.json` imports.

**Article III surgery**

- R2. CONST-T1 is removed from `CONSTITUTION-ARTICLES.md`; the number is never reused; no corpus text prescribes trophy layers, widths, or mocked composition as doctrine.
- R3. CONST-T5 is removed; "characterization" appears nowhere in the corpus as a standing duty.
- R4. CONST-T2 is removed; its blanket property mandate does not survive in any reworded rule (see KTD1 for why the replacement takes a fresh id and a fresh title).
- R5. CONST-T3 keeps its id and title "Mutation Is the Measure" with a reworded body: the gate covers a named, non-empty, change-relevant mutated set; the `dont` list covers suppression, after-the-fact narrowing, gate-lowering, an empty set, and raw cross-project percentage comparison.
- R6. CONST-T4's text stands byte-identical.
- R7. CONST-T14 "Properties Where the Surface Cannot Reach" is minted: a property is earned when a universal over generated input, or a refusal no generated law can express, cannot be reached from the published surface; a `dont` forbids properties that restate a decision already pinned from above.
- R8. CONST-T8 "The Observer Must See the Fault Class" is minted: each behavior is enrolled in the observer that can see its failure class; `dont` entries forbid orchestrator suites, mixed mutant populations, and substitutes whose expected value derives from the single implementation they replace.
- R9. CONST-T13 "Mutation Also Grades the Tests" is minted: a run whose mutants all died fails when an authored property file defends nothing the rest of the suite does not; opting out happens in the mutation config, never by deleting the named file.
- R10. CONST-T9 "Pin the Published Contract Before You Delete a Path" is minted: observables are pinned with an expected side independent of the implementation under change; a persisted gold survives a rewrite only when externally authored, independently gated, and cheap to re-bless.
- R11. CONST-T10 "The Oracle Is Not the System Under Test" is minted: every assertion draws on an oracle the SUT did not produce, and a hand-written refusal survives beside generated accept-laws at any specifiable refusal boundary.
- R12. CONST-T11 "Snapshots and Differentials Are Published-Surface Oracles" is minted: snapshot and differential fixtures are produced only through the package's published export map.
- R13. CONST-T12 "Altitude Is What the Test Calls" is minted: a test's observer is decided by what it imports and invokes, never by filename, folder, or suffix; the check is lint.
- R14. CONST-E5 "A Gate's Key Is Recomputed, Never Reported" is minted at the end of Article III's rules block (retrieved placement — see KTD3): gates key on recomputation from source bytes, a compiler verdict, or a rehash; a gate whose verdict the gated agent can produce or observe is unverified until an independent channel confirms it.

**Resident law**

- R15. CONST-S4's structural-rebuild bullet cites CONST-T9 instead of CONST-T5, and its `check` clause requires a CONST-T9 pin on every published path a rebuild deletes. No other S4 text changes.

**Prose reconciliation**

- R16. AGENTS.md's file-choice paragraph cites CONST-T14 as its review-gated artifact-announced testing example instead of CONST-T2; the "28 of 34 rules" count sentence is recomputed against the amended corpus (33 rules) and restated with measured numbers; its vacated-id reporting claim is now backed by the gate's real behavior.
- R17. README.md's Article III row describes the new doctrine without naming the Testing Trophy, and the "Rules: 34" badge is recomputed to 33.

**Refusals**

- R19. No rule YAML names a tool, a consumer repository, a language stack, or a filename suffix.
- R20. No Testing Trophy diagram, width metaphor, or layer table survives anywhere in the corpus.

### Success Criteria

- `pnpm test` exits 0 and its success line reports the post-amendment corpus (33 rules across both files).
- After the corpus commit, `pnpm test --against <the commit immediately preceding it>` exits 0, prints no reassignment, and names exactly CONST-T1, CONST-T2, and CONST-T5 as vacated.
- Against a pre-#9 revision, the same gate names exactly CONST-E1, CONST-E2, CONST-E3, CONST-E4, CONST-G1, and CONST-G2 as vacated.
- A probe that adds a citation to a vacated id makes the gate fail naming the dangling citation; the probe is reverted after the demonstration.
- A grep sweep over the corpus, AGENTS.md, README.md, and `scripts/` finds no reference to CONST-T1, CONST-T2, CONST-T5, "Testing Trophy", or characterization-as-duty.

### Scope Boundaries

In scope: `CONSTITUTION-ARTICLES.md`, `CONSTITUTION.md`, `scripts/validate-constitution.py` (deleted), `scripts/validate-constitution.ts` (new), `deno.json` (new), `package.json` (test script), `AGENTS.md`, `README.md`, and this plan.

### Deferred to Follow-Up Work

- The org tree's `WATCHDOG.md` police-checks "T1 = trophy, T5 = pin with characterization" (measured in the invoking conversation); it enforces vacated obligations after this amendment and must be updated in that repo after its next vendor pull. Other consumer repos are unmeasured; vacancy failure at their pulls is loud by design. A tracker ticket for this follow-up is filed by the shipping pipeline.
- Restructuring AGENTS.md's measured-count prose so future amendments drift less is a separate docs decision.

Outside this amendment's identity: validator schema, family registry, or gate registration changes (none needed — E and T are registered, `review`/`lint`/`mutation` are registered gates); renumbering to close id gaps (forbidden by the corpus's own rule); restoring the Application section or the Preamble that commits #9/#10 removed.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **CONST-T2 is vacated; its replacement is minted as CONST-T14 with a distinct title.** The narrowed grant forbids what the old `do` required — blanket property coverage of the core violates the new `dont` — so the obligation narrowed, and the corpus's id-surgery table assigns a narrowed obligation a new id. The `--against` reassignment check compares titles, and only for ids present at both revisions, so it is structurally blind to a body-narrowing under a kept id; id discipline for body-level obligation change is therefore review-only, which is exactly why the narrowed grant takes a fresh id and a fresh title ("Properties Where the Surface Cannot Reach") — no reader can mistake the new rule for a light edit of the old. AGENTS.md's prose citation of CONST-T2 re-points to CONST-T14 (R16), which is likewise review-gated and artifact-announced.
- KTD2. **CONST-T3 keeps its id and title.** The reword adds only loophole-closers (empty set, after-the-fact narrowing, raw-percentage comparison) and renames the gated set from "the core" to a named change-relevant set; nothing the old text required is now forbidden, so an agent compliant with the old text still complies. Same obligation, sharper instrument hygiene.
- KTD3. **CONST-E5 is retrieved law at the end of Article III, not resident law.** Commit ebd9b10 (#9) removed the resident Application section — CONST-G1/E1–E4/G2 — with the rationale that gate accumulation had produced cargo-culted checks; recreating a resident enforcement block for one rule reopens exactly that. The resident file is now conduct-only by direction of #9, and CONST-E5 is not conduct. It belongs where the work announces it: an agent authoring or judging a gate holds a verification artifact, which is Article III's retrieval trigger. Family follows about-ness, not placement — the corpus's own precedent is CONST-P3 (purity) living in Article II. E5 is the next free E number because E1–E4, though deleted in #9, are permanently vacant. Grounding: this repo's vacuous-pass learning ("never key a gate on a value its own author supplies") and dossier H12 (enforced gates bind, advisory surfacing is inert; an instrument correlated with the work can manufacture a false verdict). The rule stops at accountability — a recomputed key plus an independent confirmation channel — because binding by a machine gate an agent merely observes is unmeasured (dossier open question Q6).
- KTD4. **Numbering follows the settled mint set; the bundle is one doctrine revision.** CONST-T8 through CONST-T13 per the specification; CONST-T14 for the property grant; CONST-E5 in the E family. T6 and T7 remain vacant alongside T1, T2, and T5; gaps are free and a citation into a gap fails loudly. The eight mints ship as one amendment deliberately: the rules are mutually dependent — T9's pinning assumes T10's oracle independence, T11's snapshots and T12's altitude both key on T8's observer placement, and CONST-E5 disciplines the gates the T-family names — so splitting them would mint rules that cite rules that do not exist yet.
- KTD5. **Four commits, pushed together as one PR: plan checkpoint, validator, corpus, prose.** The Deno gate lands before the corpus commit so the amendment it judges is verified by a gate that already reports vacancies; the corpus commit carries both constitution files; prose lands last. The intermediate states exist only on the local branch for minutes — CI and consumer repos see only the PR head. The corpus/prose divergence window never publishes, and each layer stays auditable on its own.
- KTD6. **The gate is Deno, not Python.** Ecosystem tooling law is Deno-only for code, and the user directed it for this run. The rewrite is a port, not a redesign: every check the Python gate made is preserved, and the one addition is the vacated-id/uncompared-file reporting the repo's documentation already specifies (AGENTS.md's gate paragraph; the vacuous-pass learning's success-line shape). The `@std/yaml` parser is declared in `deno.json` and imported by bare name; the shebang carries the least-privilege flags so callers invoke the script directly.

### Id surgery map

| Action | Id | Title |
|---|---|---|
| Vacate | CONST-T1 | The Testing Trophy |
| Vacate | CONST-T2 | Properties Over Examples (blanket mandate) |
| Vacate | CONST-T5 | Pin Behavior Before You Rebuild |
| Keep id, reword body | CONST-T3 | Mutation Is the Measure |
| Keep, byte-identical | CONST-T4 | Behavior Lives Where the Mutator Sees It |
| Mint | CONST-T8 | The Observer Must See the Fault Class |
| Mint | CONST-T9 | Pin the Published Contract Before You Delete a Path |
| Mint | CONST-T10 | The Oracle Is Not the System Under Test |
| Mint | CONST-T11 | Snapshots and Differentials Are Published-Surface Oracles |
| Mint | CONST-T12 | Altitude Is What the Test Calls |
| Mint | CONST-T13 | Mutation Also Grades the Tests |
| Mint | CONST-T14 | Properties Where the Surface Cannot Reach |
| Mint | CONST-E5 | A Gate's Key Is Recomputed, Never Reported |

Base: 28 rules (CONSTITUTION.md 7 + CONSTITUTION-ARTICLES.md 21). Post-amendment: 28 − 3 + 8 = 33.

### Assumptions

- The org tree's enforcing mechanisms are taken as specified in the invoking conversation; they were measured in that repo and are not re-verified from here.
- The dossier's adjudications are taken as the doctrine authority as delivered; primary-source re-derivation is out of scope for this amendment.
- CONST-T2's vacancy (KTD1) is resolved by the corpus's own id-surgery table after the question was declined in dialogue; the user redirected nothing when authorizing autonomous shipping.
- The two inference-grade `harm` fields (the empty-set guard's catching behavior, machine-gate binding on an observing agent) are stated as rationale, not measured findings, and the rules that carry them are framed as guards and accountability requirements.
- The locked-surface guidance for verification scripts is overridden for the gate file itself by direct user direction (Python out, Deno in); the override is declared in the validator commit body.

### Risks & Dependencies

- Consumer repos citing CONST-T1, CONST-T2, or CONST-T5 fail loudly at their next vendor pull. That is the intended vacancy behavior — a citation into a gap resolves to nothing, which the gate surfaces by name. One consumer is known to cite them (the org tree's `WATCHDOG.md`, per the invoking conversation); its repair is the deferred follow-up, not a shim here.
- AGENTS.md's measured-count prose will drift again on the next amendment. Accepted; the amendment checklist already requires recomputation on delete/split/merge/re-scope commits.
- The first `pnpm test` run after the Deno rewrite fetches `@std/yaml` from JSR (as the old command fetched PyPI); subsequent runs are cached.

### System-Wide Impact

Every consumer repo's agents receive the amended doctrine at their next vendor pull; the constitution repo's own harness (AGENTS.md guidance, README's doctrine table and badge) changes with it. The gate moves from Python to Deno — consumer repos that invoke the vendored validator directly inherit a Deno dependency; those using `pnpm test` inherit it transparently.

---

## Implementation Units

### U5. Deno corpus gate

**Goal:** The corpus gate is a Deno script implementing the full documented behavior, including vacated-id and uncompared-file reporting; the Python file is gone.

**Requirements:** R1

**Dependencies:** none (executes first)

**Files:** `scripts/validate-constitution.ts` (new), `scripts/validate-constitution.py` (deleted), `deno.json` (new), `package.json` (test script)

**Approach:**

1. Read the Python gate in full and port every check: two-file coverage, fenced-block extraction and per-block parse errors, declared-vs-parsed id accounting, schema fields, gate values, family registry, duplicate ids, `do`/`dont` string-or-string-list shape, `example` map-of-strings shape, cross-file dangling citations, `--against` title-keyed reassignment.
2. Add the success-line reporting: ids vacated since the revision, and corpus paths absent at it — neither fails the run; both are named.
3. Declare `@std/yaml` in `deno.json` imports; point `package.json`'s `test` script at the script path; carry permissions in the shebang (`--allow-read` limited to the two corpus files, `--allow-run=git`); mark the file executable.

**Patterns to follow:** the reporting shape in the vacuous-pass learning ("what cannot be failed must be reported"); the Python gate's error-message voice.

**Test scenarios:**

- Red-first: before the rewrite, `pnpm test --against ebd9b10~1` (captured) prints only `no id reassigned` — six vacated ids unreported.
- After the rewrite, against `ebd9b10~1`: names exactly CONST-E1, CONST-E2, CONST-E3, CONST-E4, CONST-G1, CONST-G2 as vacated; exit 0.
- Against the pre-split revision `28c79e6~1`: names `CONSTITUTION-ARTICLES.md` as not compared; exit 0.
- Against the current HEAD: names nothing vacated; exit 0.
- Without `--against`: output shape unchanged from the Python gate's, exit 0.
- Dangling-citation fixture: a temporary citation to a vacated id fails the run naming it.

**Verification:** the six scenarios pass; `deno lint` on the new script is clean.

### U1. Article III surgery

**Goal:** Article III states observer-fit, oracle-independence, mutation, pinning, and gate-key doctrine; the trophy and the characterization duty are gone.

**Requirements:** R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R19, R20

**Dependencies:** none on U5 (independent content; ordering matters only for U4's evidence)

**Files:** `CONSTITUTION-ARTICLES.md`

**Approach:**

1. Read the current Article III block before editing.
2. Replace the rules block with the Appendix A block verbatim: CONST-T8, CONST-T14, CONST-T3, CONST-T13, CONST-T4, CONST-T9, CONST-T10, CONST-T11, CONST-T12, then CONST-E5 as the terminal rule. CONST-T4's entry stays byte-identical to the current text.
3. Article III's heading and the surrounding article structure do not change.

**Patterns to follow:** the existing rule YAML schema (`id`, `title`, `gate`, `do`, `dont`, `harm`, `check`); gate values limited to the registered set.

**Test scenarios:** (all run at the corpus-commit boundary, after U2's S4 repoint — the dangling T5 citation in CONSTITUTION.md keeps the gate red until then)

- Validator schema: `pnpm test` exits 0; the success line reports 33 rules.
- Dangling-citation probe: temporarily add a citation to CONST-T5 in a corpus file; the gate fails naming the dangling citation; revert the probe and confirm green.
- Stale-doctrine sweep: a grep over the corpus for `CONST-T1`, `CONST-T2`, `CONST-T5`, `Testing Trophy`, and `characterization` returns nothing.

**Verification:** the three scenarios pass at the corpus-commit boundary.

### U2. S4 repoint

**Goal:** CONST-S4 pins structural rebuilds with CONST-T9 instead of the vacated CONST-T5.

**Requirements:** R15

**Dependencies:** U1 (the citation target must exist)

**Files:** `CONSTITUTION.md`

**Approach:**

1. Read the current CONST-S4 block before editing and confirm both find-patterns are present verbatim.
2. In the structural-rebuild bullet, replace "behaviour pinned with characterization tests first, CONST-T5" with "published contract pinned first (CONST-T9)".
3. In the `check` clause, replace "a structural rebuild ships its characterization tests" with "a structural rebuild ships a CONST-T9 pin on every published path it deletes".
4. If either find-pattern misses, stop for amendment repair — do not approximate the edit.

**Patterns to follow:** the resident Article V rule shape; no other S4 field changes.

**Test scenarios:**

- A grep of `CONSTITUTION.md` for CONST-T5 returns nothing; a grep for CONST-T9 returns the S4 citation.
- `pnpm test` exits 0 at the corpus-commit boundary (with U1).

**Verification:** both scenarios pass.

### U3. Harness prose reconciliation

**Goal:** The harness and front-page prose teach the amended doctrine, cite only live rules, and carry measured numbers.

**Requirements:** R16, R17

**Dependencies:** U1, U2, U5 (prose must match final rule text, ids, and gate behavior)

**Files:** `AGENTS.md`, `README.md`

**Approach:**

1. In AGENTS.md's file-choice paragraph, replace the CONST-T2 example citation with CONST-T14.
2. In AGENTS.md's gate-explanation paragraph, recompute the inbound-citation count and the corpus total (33) against the amended files and restate the sentence with the measured numbers; its vacated-reporting claim now names real behavior.
3. In README.md's doctrine table, rewrite the Article III row to describe observer-fit placement, properties by narrow grant, and mutation as the measure; recompute the "Rules" badge from 34 to 33.

**Patterns to follow:** AGENTS.md's existing measured-claim style; README.md's table-row and badge shapes.

**Test scenarios:**

- Repo-wide grep sweep (excluding `.git`, lock files, and this plan) for CONST-T1, CONST-T2, CONST-T5, "Testing Trophy", and characterization-as-duty returns nothing.
- The recomputed AGENTS.md and README numbers match fresh counts run at implementation time, not numbers carried from this plan.

**Verification:** both scenarios pass.

### U4. Verification battery and commits

**Goal:** Evidence is recorded and the work lands as four conventional commits.

**Requirements:** all

**Dependencies:** U5, U1, U2, U3

**Files:** none new

**Approach:**

1. Run the full Verification Contract in order.
2. Commit the plan checkpoint (`docs(plans):`) first; then the Deno gate (`feat(scripts)!:`) with the locked-surface override declared in the body; then the corpus change (U1 + U2, `refactor(constitution)!:`); then the prose (U3, `docs:`).
3. Run commitlint over all four commits.

**Test scenarios:**

- All four commits pass `pnpm exec commitlint --from HEAD~4`.
- The working tree is clean after the commits.

**Verification:** the Verification Contract's exit criteria all hold.

---

## Verification Contract

| Check | Command / method | Exit criterion |
|---|---|---|
| Corpus gate | `pnpm test` | Exit 0; success line reports 33 rules across both corpus files |
| Vacancy gate | `pnpm test --against <commit immediately preceding the corpus commit>` | Exit 0; no reassignment; names exactly CONST-T1, CONST-T2, CONST-T5 vacated |
| Backfill fixture | `pnpm test --against ebd9b10~1` | Exit 0; names exactly the six #9-removed ids vacated |
| Uncompared fixture | `pnpm test --against 28c79e6~1` | Exit 0; names `CONSTITUTION-ARTICLES.md` not compared |
| Dangling-citation probe | temporary citation to a vacated id, then `pnpm test` | Fails naming the citation; probe reverted; gate green again |
| Stale-doctrine sweep | grep corpus, AGENTS.md, README.md, `scripts/` for vacated ids and retired doctrine names | Zero matches |
| Commit format | `pnpm exec commitlint --from HEAD~4` | Exit 0 for all four commits |
| Clean state | `git status --porcelain` | Empty after commits |

---

## Definition of Done

- All requirements R1–R20 hold in the tree.
- The Verification Contract passes in full, in the current session.
- The four commits (plan, validator, corpus, prose) are separate, conventional, and pushed together in one PR.
- No consumer-repo file is touched; the org-tree watchdog follow-up remains deferred with its tracker ticket filed.
- Working tree is clean.

---

## Appendix A — Article III replacement block

Normative payload for U1. YAML block content, replacing the current Article III `rules:` sequence:

```yaml
rules:
  - id: CONST-T8
    title: The Observer Must See the Fault Class
    gate: review
    do: enroll each behavior in the observer that can see its failure class — a pure decision is read by properties and by mutation of that decision; a published operation is read by tests that call only exported names; a shell that only translates is read by those exported-name tests, not by a suite of its own
    dont:
      - give the orchestrator its own test suite — extract the decision or live with the exported-name test
      - enroll adapters, codecs, or wiring in the same mutant set as decisions
      - treat a substitute whose expected value derives from the single implementation it replaces as an observer
    harm: the wrong instrument reports coverage and measures nothing; mocked composition certifies wiring; a fat middle grows where decisions and I/O stay tangled
    check: review — every new test names the surface it binds (decision or published export) and does not import a non-exported symbol to assert it
  - id: CONST-T14
    title: Properties Where the Surface Cannot Reach
    gate: review
    do: prove a pure decision with a property when a universal over generated input, or a refusal no generated law can express, cannot be reached from the published surface; the type is the generator
    dont:
      - cover the core with hand-picked example unit tests
      - write a property for a decision already fully pinned from above just because the decision is important
    harm: a green suite that tests only the cases you imagined; or a property farm that restates the public contract and dies with it
    check: review — each authored property names the universal the public surface cannot reach
  - id: CONST-T3
    title: Mutation Is the Measure
    gate: mutation
    do: gate a named, change-relevant mutated set at a perfect kill score; the set names the behavior it covers, and its scope is a cost decision, never a fault-majority claim; kill a survivor with a sharper property or by deleting the dead branch it exploits
    dont:
      - reach the number by a suppression comment
      - reach the number by narrowing the mutated set after the fact
      - reach the number by lowering the gate
      - let an empty mutated set pass
      - treat a raw mutation percentage as comparable across changes or codebases
    harm: a score certifying tests that notice nothing; an empty or author-shrunk set passing vacuously
    check: mutation gate (break = 100) on the declared mutated set; lint banning suppression, scope-narrowing, and an empty set
  - id: CONST-T13
    title: Mutation Also Grades the Tests
    gate: mutation
    do: fail a run whose mutants all died if an authored property file defends nothing the rest of the suite does not; opt out in the mutation config, never by deleting the file the gate named
    dont:
      - treat a perfect mutant score as proof every test pulled its weight
      - accuse a file that covered an unattributed kill
    harm: toothless properties accumulate; deleting them to silence the gate removes the only named contract
    check: mutation — the test-set verdict is part of the same run as the score
  - id: CONST-T4
    title: Behavior Lives Where the Mutator Sees It
    gate: lint
    do: put any code that can be wrong (transform, check, branch) in a file the mutator covers
    dont: place behavior in a declaration file (types, schemas, constant data), excluded from mutation
    harm: a bug hidden behind a perfect score, in a file nothing mutates
    check: lint — declaration files contain no behavior
  - id: CONST-T9
    title: Pin the Published Contract Before You Delete a Path
    gate: review
    do: before removing or replacing a published operation, pin its observables (value, error variant, serialized document, process result) with examples or properties whose expected side is not the implementation under change; if the old operation still runs, compare old and new on the same published inputs until they agree, then delete old
    dont:
      - pin private functions
      - derive expected values by running the implementation under change
      - treat a mutation or property score as proof a deleted published capability still exists — those are blind to absence
      - leave a persisted gold after the old path is gone unless the gold is externally authored, independently gated, and cheap to re-bless
    harm: a rebuild silently drops a capability; same-session gold blesses the bug; a clean score after a delete is a silent regression
    check: review — pins call only published names; each expected value names an independent source (spec clause, prior published major, second implementation, or a hand-written oracle next to the constructor)
  - id: CONST-T10
    title: The Oracle Is Not the System Under Test
    gate: review
    do: every assertion has an oracle the SUT did not produce — a spec literal, a fixture not generated by importing the module, a law relating two views of the same value, or a second implementation; generated round-trip laws on a type cover what the type accepts and nothing it should reject, so a hand-written refusal survives beside them at any specifiable refusal boundary
    dont:
      - compute expected by calling the SUT
      - assert collaborator call graphs
      - treat generated accept-laws as full coverage of a refinement
    harm: a green suite that cannot fail when the behavior is wrong; widening a refinement leaves generated laws green
    check: review — plus sabotage: after green, break one core law and one published field; at least one test must go red
  - id: CONST-T11
    title: Snapshots and Differentials Are Published-Surface Oracles
    gate: lint
    do: snapshot only canonicalized published output; compare two implementations only of the same published operation (or a prior published major against current)
    dont:
      - snapshot or compare private helpers, mappers, or unexported modules
      - snapshot a value small enough to be a property or a named example
    harm: tests that fail on refactors callers cannot see and pass on contract breaks they can
    check: lint — snapshot and differential fixtures are produced only through the package's published export map
  - id: CONST-T12
    title: Altitude Is What the Test Calls
    gate: lint
    do: decide a test's observer from what it imports and invokes — published names or a decision under mutation — never from a filename, folder, or suffix
    dont: key which doctrine applies to a test on a label the author can rename
    harm: a rename silently un-enrolls the file from its observer; the absence reads as coverage
    check: lint — no rule that selects tests by filename suffix
  - id: CONST-E5
    title: A Gate's Key Is Recomputed, Never Reported
    gate: review
    do:
      - key every gate on a recomputation from source bytes, a compiler verdict, or a rehash — never on a field the gated work's author supplied; when a gate reads a field, recompute that field in the same run
      - treat a gate whose verdict the gated agent can produce or observe as unverified until an independent channel confirms it — an instrument the agent does not control, or review by someone who is not the gated agent
    dont:
      - accept a self-reported field, a presence flag, a metadata suffix, or a comment as evidence a property holds
      - treat a mechanical gate's green as self-certifying
    harm: a check keyed on author-supplied values passes everything and catches nothing, and the green then masks the broken invariant the gate exists to catch; an instrument correlated with the work under test can manufacture a verdict no single observer catches
    check: review — each gate names the recomputation it runs and the independent channel that confirms its verdict
```

---

## Appendix B — CONST-S4 edits

Normative payload for U2, verified verbatim against the current corpus. Two edits, complete and final:

- Structural-rebuild bullet: "behaviour pinned with characterization tests first, CONST-T5" becomes "published contract pinned first (CONST-T9)".
- Check clause: "a structural rebuild ships its characterization tests" becomes "a structural rebuild ships a CONST-T9 pin on every published path it deletes".

---

## Sources & Research

- H1–H12 verdict dossier (delivered in the invoking conversation): doctrine authority. Load-bearing verdicts: H1 (same-session contamination), H2 (oracle independence over surface count), H5 (change-relevant mutation; decision-only refuted; empty-set guard load-bearing), H7 (refusal complement), H8 (seam authority), H11 (external-gated gold), H12 (gates bind; accountability reading). Independently spot-confirmed against primary literature (arXiv:2607.05139, arXiv:2410.21136, EMSE'22 commit-relevant mutants).
- Org-mechanism specification (delivered in the invoking conversation): the enforcing tree's mechanisms, the mint set CONST-T8 through CONST-T13, and the measured consumer citation (org tree WATCHDOG.md).
- Python gate `scripts/validate-constitution.py`, read in full: the port source — schema fields, family registry, cross-file citation resolution, title-keyed `--against` reassignment over ids present at both revisions.
- AGENTS.md: id-surgery table (obligation identity), family registry, file-choice rule, the gate-explanation paragraph whose counts R16 recomputes and whose vacated-reporting claim the Deno gate makes true.
- `docs/solutions/architecture-patterns/the-vacuous-pass-gate-input-sets.md`: grounding for CONST-E5 and the `--against` reporting shape — a gate keyed on author-supplied values certifies nothing; what cannot be failed must be reported.
- Tooling: Deno-only ecosystem law (software-wiki harness convention); `@std/yaml` (`jsr:@std/yaml`, single-document `parse`, safe for untrusted input — docs.deno.com/runtime/reference/std/yaml).
- Corpus base: `origin/main` at dd5722a (28 rules; commits ebd9b10/#9 and dd5722a/#10 removed the Application section and the Preamble).
