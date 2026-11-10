---
title: The lint-hygiene compound pack - Plan
type: docs
date: 2026-11-10
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# The lint-hygiene compound pack - Plan

## Goal Capsule

- **Objective:** a planner, a reviewer and a compound-learning author hold every lint-rule proposal to one test an independent reader can apply from the pack text alone: lint decides only what the code at hand settles, the restraint recurs, the rule keys on what code is or does, stock rules come first, hatches mark judgements while justified code-local exemptions pass, every addition prunes, and the proposal declares its oxc category at its authors' severity. Acceptance is that independent reader's verdicts, compared against the same reader without the pack, on cases including ones this plan never sees.
- **Means:** a new pack `compound-packs/lint-hygiene/` (a README plus two rule files), self-contained for a consumer that holds only the pack directory; the four overlapping `docs/solutions` learnings slimmed under the packs guide's promotion rule; the repository's own lint-rule instructions inventoried with one resolution per contradiction and law-file amendments listed for the owner; enrolment in `.compound-engineering/config.yaml` and the packs table (KTD1, KTD2, KTD5, KTD7).
- **Authority:** the SYS-1264 brief as amended 2026-11-10 (items 1 to 9 including 9a and 9b), the conductor's defect review D1–D7 and its research comment (anti-slop, oxc rule categories and adding-rules guide, ESLint core rule guidelines), `CONSTITUTION.md` (CONST-S2, CONST-S4, CONST-T12), the packs README's rule shape, and the CE packs guide. Brief phrasing grounds nothing by itself (CONST-S2): each rule clause carries its own source sentence or repository record (R18).
- **Stop conditions:** the pack files, the four named `docs/solutions` learnings, the two enrolment lines, and this plan. No new lint rule, test, check, hook or CI job; no edit under `.github/`, `packages/`, `scripts/`; no other `docs/solutions` file; no change to any law file (`AGENTS.md`, `CODING_STANDARDS.md`); no preset severity change; no change in any other repository.
- **Execution profile:** docs-only, one pull request from `origin/main` on branch `docs/sys-1264-lint-hygiene-pack`. Verification is the pack resolver, the self-containment and no-unlinked-duplicate checks, and `pnpm check:local` on the head. Acceptance is the conductor's independent-reader run at the PR head (R15).
- **Finishes and ships:** the ce-work executor authors the pack and the reconciliation, commits this plan with them, pushes with a plain literal command naming the branch, and opens the PR. The conductor runs the acceptance comparison at the exact head; the PR merges through the queue after a clean independent review.
- **Open blockers:** none.

---

## Product Contract

### Summary

Add a compound pack of two review rules. The proposal rule carries the whole test a lint-rule proposal must pass, as one sequential procedure a reader applies to a case nobody listed: the code-at-hand test, the record test, the key test (with ESLint's two-"and"s specificity check), the stock test, the hatch test, the category-and-severity test, and the prune clause — with the counter-case that keeps objective restraints in lint. Its `applies_when` names each surface where a rule gets proposed, in the vocabulary the authoring stage's own task uses. The prune rule owns the second moment: auditing, consolidating or removing lint rules. Both rules are complete for a reader who holds only the pack directory. The four overlapping `docs/solutions` learnings slim whatever the rules now state. The repository's own lint-rule instructions are inventoried, each contradiction resolved once, and law-file amendments are listed for the owner, never made.

### Problem Frame

Agents propose brittle, overfit linter rules for domains where reviewers decide case by case. The owner, 2026-11-10: "often times the agent will recommend a ridiculous brittle and overfit linter rule that doesn't even make sense since the domain is entirely subjective. For example you cannot have a linter rule that bans all subpath exports. Whether or not a subpath export should be added is a judgement layer." The closed records show the shape: #670, the seven-PR stack #751–#757, and a deleted approval script that refused every PR adding a `package.json` subpath. The counter-ruling must survive: objective restraints do belong in lint — this repository's preset already ships forbidden-import bans as `no-restricted-imports` values.

The amended brief and the research comment sharpen what professional lint authors do: they label taste as taste (oxc's style, pedantic and restriction categories), the team adopts it on purpose, and it stays decidable from the code in front of the rule; oxc guards `correctness` as "run by default, so be careful when choosing this category", and oxc lints its own repository with stock rules and zero custom rules, against this repository's eighty-seven custom rules in five plugins. The repository's own loaded text also speaks to lint rules with a different accent: `packages/oxlint-plugin/AGENTS.md` mandates file-placement and suffix rules, forty-eight of the seventy-seven existing custom rules read the filename, and the preset promotes upstream warnings to error. The pack takes one position on file-name keys and lists every contradiction for the owner (R16, Appendix C); it is doctrine for proposals, not a verdict on the existing estate (CONST-S2).

### Key Decisions

- KD1. **One new pack, not disjoint rules in an existing pack.** No enrolled pack owns lint-rule proposals; the brief's item 9 says the packs table lists "the pack". Governs R1, R2, R9.
- KD2. **The restraint tests govern; the record verdicts, the sources and the acceptance run live outside the rule bodies.** Governs R3–R8, R10, R13, R15, R18.

### Requirements

**Pack shape**

- R1. `compound-packs/lint-hygiene/` sits beside the enrolled packs in the packs README's shape and follows the CE packs guide (https://every.to/compound-engineering/guides/packs): one rule per top-level `.md` file; frontmatter keys exactly `title`, `applies_when`, `tags`; each rule a prescriptive always/never statement with a situational `applies_when`, one situation per line; at most one short WRONG/RIGHT example per rule, illustrating the test and never defining it; examples generic (no repository, product, person, path or link a signed-out reader cannot open); no `Gate:` line; no incident narrative, history or evidence in any body; pack text is evidence that planning and review quote, never an enforcement contract (KTD2, KTD3).
- R2. Each rule is complete for a reader who holds only the pack directory: every discriminating test, carve-out and neighbour boundary is stated in rule text — the subpath judgement, the CI-check boundary and the configuration-gate boundary each as one sentence of this pack's own position, never a pointer. The README describes the pack; resolving stages never read it as a rule, so it carries no load-bearing text (KTD5).

**The proposal rule** — one rule file, `a-lint-rule-is-proposed-only-when-the-code-settles-it.md`, carries the following clauses as one sequential test:

- R3. The code-at-hand test: lint is proposed only when the file's own syntax, its types or its imports settle the verdict the same way on every instance; a verdict that needs consumers, intent or product context belongs to review, carried as a pack rule review applies, never lint (amended item 1). The judgement list — subpath export, abstraction, module split, dependency, name — appears only as illustrations of the test, never as its definition (CONST-S2, D6).
- R4. The record test: one occurrence earns a fix, not a rule. A proposal needs recurring product-code cases, cited; a violation that would otherwise stay silent; and nothing that already catches it — a type, a stock rule, a test. Adding a rule is the owner's call.
- R5. The key test: the rule keys on what code is or does — a type, an import edge or a whole-graph fact, package membership — never on a file's name, suffix or path or the words of a past incident; a rename silences a name-keyed rule (CONST-T12). ESLint's specificity test applies: a description needing more than two "and"s is too specific.
- R6. The stock test: a stock rule or configuration (`no-restricted-imports`, `no-restricted-syntax`, or the gritlint equivalent) comes before a custom plugin rule.
- R7. The prune clause: the addition names what comes out — the prose, the check or the rule it replaces (item 6's addition side).
- R13. The category test: the proposal declares its category in oxc's terms — correctness, suspicious, pedantic, perf, style, restriction. Only correctness-grade rules run by default and at error. Severity never rises above what the rule's own authors ship it at. A taste rule (style, pedantic, restriction) is the owner's adoption, never an agent's recommendation.
- The same rule states the counter-case and the hatch test: a forbidden import is a stock `no-restricted-imports` value and is right (the counter-case must hold — the pack never forbids lint); a rule that needs a path or file allowlist, carve-outs, or blanket inline disables to pass the current tree is a judgement, while an exemption written in the code with a stated justification, in a form the rule itself names (like a `SAFETY:` comment), is allowed (amended item 5).

**The prune rule** — one rule file, `lint-rules-are-pruned-not-accreted.md`, owns the estate moment:

- R7 continues: agents stack changes and rarely remove them; a rule that restates configuration, or never fires, is deleted; no two rules produce the same warning. This rule's `applies_when` covers auditing, consolidating or removing lint rules, and reviewing whether an existing rule still earns its place — distinct from the proposal moment, so the two rules stay disjoint in what they prescribe.

**Reach**

- R8. The proposal rule's `applies_when` names each surface of item 7 in the vocabulary its authoring stage's task uses: proposing a lint rule in a review finding; reviewing a change that adds or shapes a lint rule; planning a change and deciding whether it needs one; grounding requirements in lint rules during a brainstorm; writing a pull request body that proposes one; documenting a solved problem and weighing lint as its prevention; writing or refreshing a compound learning that proposes one. Appendix C's reach table names, per surface, the installed stage that loads packs there; the PR-body surface is reported as not covered — no installed stage loads packs while a pull request body is written.

**Acceptance**

- R15. Acceptance is an independent reader applying the pack text alone — as a consumer repository receives it, only the pack directory at the PR's ref — to lint-rule proposals, including cases this plan never sees. The conductor holds the unseen cases and runs the comparison at the PR head: the same reader with the pack and the same reader without it. The run fails when the packed reader endorses lint for a proposal whose verdict needs consumers, intent or product context; rejects the forbidden-import counter-case or any correctness-grade objective restraint; cannot reach a verdict from the pack text alone; or matches the no-pack reader's verdicts on judgement cases, so the pack moved nothing.

**Contradictions and grounding**

- R16. The pack takes one position on file-name keys: a proposed rule keys on what code is or does, never on a name, suffix or path; what a suffix could carry is read from the file's own text instead. Every instruction this repository loads that speaks to adding or shaping a lint rule is inventoried (Appendix C), each contradiction carries one resolution, and the resolutions that amend a law file or a preset severity are listed for the owner, never made. The existing rule estate is not precedent (CONST-S2); the pack orders no existing rule deleted, changed or re-graded, and orders no preset severity change.
- R18. Each clause of each rule names its grounding — a source sentence opened this run or a repository record (the clause-grounding map is a Planning Contract table). A clause with neither is cut before the pack ships. Sources stay out of rule bodies; the PR body carries them.

**Enrolment and delivery**

- R9. `compound-packs/README.md`'s table lists the pack; `.compound-engineering/config.yaml` enrolls `compound-packs/lint-hygiene` (KTD4).
- R10. The PR body carries item 8's verdict per record with only record-stated reasons — unknown where the record states none — each verdict naming the pack rule that grounds it; one line per source quote (the brief's five, plus the research comment's four) saying which rule it grounds; the contradiction inventory with its resolutions and the owner-decision list; and the acceptance-run description. Appendix A, Appendix B and Appendix C are the maps.
- R11. The diff adds no lint rule, test, check, hook or CI job, carries nothing from `.review-input/`, and needs no changeset (no publishable package changes).
- R12. Publication: a plain literal push command naming `docs/sys-1264-lint-hygiene-pack`; the executor opens the PR; `pnpm check:local` exits 0 on the head; review and merge through the queue are post-PR stages the conductor owns.
- R14. No rule depends on text outside the pack (R2). The four `docs/solutions` learnings follow the guide's promotion rule: what a rule now states is slimmed out of the learning — or the learning is deleted when fully subsumed — so no unlinked duplicate stays; a learning's unique analysis stays. The dispositions are KTD5's table; U4 executes them.

### Acceptance Examples

- AE1. **Covers R3.** A review finding proposes banning all subpath exports. The reader applies the code-at-hand test: deciding needs to know who consumes the subpath — the verdict is review's; the finding carries the judgement instead of lint.
- AE2. **Covers R3, R6.** A proposal forbids importing a module a file may not reach: recurring, silent otherwise, caught by nothing. Accepted as a `no-restricted-imports` value — the counter-case holds.
- AE3. **Covers R4.** One occurrence of a violation reaches review. It earns a fix; no rule is proposed.
- AE4. **Covers R5.** A proposed rule keys on a filename suffix or quotes last week's incident. Refused, or reshaped to key on an import edge or a type.
- AE5. **Covers R3.** A proposed rule passes the current tree only with a path allowlist or blanket inline disables. It is a judgement. The same rule with a code-local exemption in the form it names — a `SAFETY:` comment carrying a justification — passes.
- AE6. **Covers R7.** An audit finds a rule that restates configuration, and a second rule producing the same warning as a first. Both are deleted; the addition that introduced them had named no pruning.
- AE7. **Covers R8.** A Prevention section documents a solved problem and proposes a lint rule. The authoring moment matches the proposal rule's applies_when; the section applies the test instead.
- AE8. **Covers R5.** A rule's description needs four "and"s to say what it refuses. Too specific; refused or narrowed.
- AE9. **Covers R13.** An agent recommends a style-category rule as a default-on error. Refused: a taste rule is the owner's adoption; only correctness-grade rules run by default, and never above their authors' severity.
- AE10. **Covers R14.** A learning states the key test's claim. The claim is slimmed out of the learning; the learning keeps its incident story and cites the rule.
- AE11. **Covers R15.** The conductor's unseen case: a proposal whose verdict needs knowing the product's consumers. The packed reader refuses it; the no-pack reader may endorse it. The difference is the pack working; agreement on judgement cases is the run failing.

### Scope Boundaries

- No enforcement of this pack: no lint rule, test, check, hook or CI job enforces it (the brief's "Does not count").
- No existing lint rule is deleted, changed or re-graded; no preset severity changes; the existing estate is not precedent (CONST-S2).
- Law files (`AGENTS.md`, `CODING_STANDARDS.md`) are never edited; their amendments are listed for the owner (R16).
- Reconciliation touches only the four learnings named in KTD5; no other `docs/solutions` file moves or shrinks.
- No consumer-repo work: repositories that enroll this repo's packs move their `ref` and enroll the new pack themselves (the brief's follow-up).
- No lint escalation loop: the pack cites its entry requirements (R4) without implementing the loop.
- No incident narrative anywhere in `compound-packs/lint-hygiene/`; records, sources, the inventory and the acceptance description live in the PR body and this plan only.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **A new pack `lint-hygiene`, not disjoint rules in `ci-workflows` or `testing`.** Those packs own what a CI check is for and what gets a test or gate; none owns when a lint rule may be proposed. Governs R1, R2, R9.
- KTD2. **Two rules, justified by two distinct moments.** Item 7's surfaces are one moment — a lint rule being proposed — so one rule file carries the whole sequential test (items 1–6 and 9a as R3–R7 and R13's clauses); the guide's disjointness holds because nothing else in the pack prescribes at that moment. The estate moment — auditing, consolidating or removing rules — is a distinct situation with a distinct fix (subtraction), so it gets its own file. Loaded-text cost: a proposal decision loads one body of roughly forty lines; an audit loads one body of roughly fifteen. The old router rule is deleted: no rule exists only to route. Governs R1, R7, R8.
- KTD3. **Records, sources, the inventory and the acceptance description appear only in the PR body and this plan** — never in rule bodies. Governs R1, R10, R16.
- KTD4. **Enrolment order: after `ci-workflows`, before `public-repository`** in both `.compound-engineering/config.yaml` and the table. Governs R9.
- KTD5. **Rules are self-contained; learnings slim under the promotion rule.** A consumer resolves only the pack directory, so no rule cites `docs/solutions` or any text outside the pack; boundaries and carve-outs are stated in rule text. The four learnings each slim whatever a rule now states — or are deleted when fully subsumed — keeping their unique analysis and incident stories, citing the owning rule for what moved:

  | Learning                                                                               | What the rules now state                                                                                          | Disposition                                                                                                                                                                                                                                                                           |
  | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`         | The key test's claim, over the same cases (R5)                                                                    | Slim: delete the normative argument, the sound-key table and the resulting-shape prescriptions; keep the decision line, supersession notes, stories and decision rationale; cite `(pack: lint-hygiene, a-lint-rule-is-proposed-only-when-the-code-settles-it.md)`                     |
  | `docs/solutions/architecture-patterns/an-escape-hatch-is-an-unfalsified-hypothesis.md` | The hatch test's position — config-level hatches are judgement markers; justified code-local exemptions pass (R3) | Slim the opening decision's normative claim and the overlapping prescriptions; keep the probe method, probe hygiene and the no-manual-tag-member incident; cite the proposal rule                                                                                                     |
  | `docs/solutions/architecture-patterns/what-a-filename-suffix-can-enforce.md`           | The ban on name/suffix/path keys (R5, R16)                                                                        | Slim the permissive guidance for suffix-keyed conventions; keep the frame and decidability analysis; add a supersession note: the pack governs proposals with the blanket ban, and whether a suffix may carry edge or depth-0 facts is an open owner decision; cite the proposal rule |
  | `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md`            | The severity floor, the category declaration, and advisory-checks-are-review (R13, R3)                            | Slim the overlapping normative bullets; keep the measurements, the false-positive arithmetic, the warn analysis and the accretion mechanisms; cite the proposal rule at the moved claims                                                                                              |

  Governs R14, R2.
- KTD6. **Citation practice follows the repo's committed plans:** the brief is cited as SYS-1264; records on the public forge are cited by number; rule bodies and examples name nothing at all. Governs R1, R10.
- KTD7. **One position on file-name keys, with the tensions owned.** The position is the amended item 3's: never a name, suffix or path key for a proposed rule. The repository's contrary loaded text — `packages/oxlint-plugin/AGENTS.md` TP3 (file placement lives in test-discipline), TP6's recorded lack of an import key for runner tests, the forty-eight-of-seventy-seven filename-reading estate (conductor-measured; spot-checked at `cell-file-exports-cell-only.ts`, `kind-file-construction.ts`, `ban-classes.ts`), the suffix learning's permissive guidance, and the preset's tsgo warn-to-error promotion — is inventoried with resolutions in Appendix C; the narrow question of whether a suffix key may carry edge or depth-0 facts is an open owner decision. Nothing is edited to resolve them (CONST-S2). Governs R16, R5.

### Clause grounding (R18)

| Clause                      | Grounding — source sentence opened this run, or repository record                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Code-at-hand test           | Agent-Skills `evaluation`: "Run deterministic validation before LLM judgment whenever the artifact has machine-checkable structure." / `advanced-evaluation`: "Is there an objective ground truth? ... Is it a preference or quality judgment?"; ESLint: "Individual preferences for uncommon patterns are not supported."; anti-slop's local-and-syntactic practice (ESTree and lexical scope, not a type checker) — all via the conductor's research comment, read this run                                                                                                              |
| Record test                 | Agent-Skills `self-improvement-loops`: "Fix a recurring failure at the lowest rung that can express the fix."; Osmani: "When the same review comment appears again, move it into a lint rule ..."; ESLint's importance note ("we have over 200 rules, and that is daunting")                                                                                                                                                                                                                                                                                                               |
| Key test                    | `CONSTITUTION.md` CONST-T12 (repository law); `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md` (a rule keyed on an author's assertion never runs on the violation); ESLint: "A rule is typically too specific if describing what it does requires more than two 'and's"; anti-slop AGENTS.md: "Keep rules generic ... Do not add application-specific names, paths, or exceptions."                                                                                                                                                                          |
| Stock test                  | Agent-Skills `self-improvement-loops` (lowest rung); oxc's adding-rules note that new rule families need discussion first                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Hatch test                  | anti-slop's `require-safety-comment-for-type-assertion` ("a nearby, non-empty invariant justification" via a `SAFETY:` marker); `docs/solutions/architecture-patterns/an-escape-hatch-is-an-unfalsified-hypothesis.md` (a hatch is an unfalsified population claim)                                                                                                                                                                                                                                                                                                                        |
| Prune clause and prune rule | Agent-Skills `harness-engineering`: "Agents stack changes and rarely remove them. Require pruning rounds."; ESLint: "No two rules can produce the same warning."; `CONSTITUTION.md` CONST-S4                                                                                                                                                                                                                                                                                                                                                                                               |
| Category test               | oxc `rule.rs` category definitions (correctness "outright wrong or useless"; suspicious "most likely wrong"; pedantic "rather strict or have occasional false positives"; restriction "should, emphatically, not be enabled as a whole ... case-by-case"); oxc adding-rules: "Remember that `correctness` rules will be run by default, so be careful when choosing this category."; anti-slop README: "It reflects my preferences and taste rather than attempting to be a universal coding standard."; oxc's own `oxlintrc.json` enabling only correctness and perf with no custom rules |
| Counter-case                | Repository records: `packages/oxlint-presets/oxlint-config-recommended/src/index.ts` ships the `serverStateImports` `no-restricted-imports` value, and `docs/solutions/build-errors/tests-outside-tsconfig-hide-workspace-source-errors.md` records a real case it caught (`node:buffer` in a Node-free package); the owner's saved lesson frames it in the brief                                                                                                                                                                                                                          |

### High-Level Technical Design

The proposal rule's sequential test, as a reader walks it:

```mermaid
flowchart TB
  P[Proposal: add a lint rule] --> O{Does the code at hand
  settle it — same verdict from
  syntax, types, imports alone?}
  O -- no, needs consumers,
  intent or product --> J[Judgement: carry it as a
  review rule — never lint]
  O -- yes --> X{Keys on what code is or
  does, describable in two
  "and"s?}
  X -- no --> R[Refuse, or reshape to a sound
  key: type, import edge or
  whole-graph fact, membership]
  X -- yes --> A{Passes the tree with no path or
  file allowlist, carve-out or
  blanket inline disable?}
  A -- no, code-local exemption
  in a form the rule names --> C2[Allowed: justified exemption
  in the code, like SAFETY:]
  A -- no --> J
  A -- yes --> S{Stock rule or config
  expresses it?}
  S -- yes --> C[Use the stock rule]
  S -- no --> CAT{Declares its oxc category;
  correctness-grade only runs
  by default and at error}
  CAT -- taste category --> OW[Owner's adoption;
  never the agent's
  recommendation]
  CAT -- correctness --> Rec{Recurring record:
  cited cases, silent otherwise,
  nothing catches it?}
  Rec -- no --> F[Fix this occurrence;
  no rule]
  Rec -- yes --> OW2[Owner decides;
  addition names its pruning]
```

The sequential test the proposal rule carries; the rule file's prose is authoritative. The prune rule owns the separate audit moment and has no flowchart: its body is the prune law (R7's estate side).

### Output Structure

```text
compound-packs/lint-hygiene/
  README.md
  a-lint-rule-is-proposed-only-when-the-code-settles-it.md
  lint-rules-are-pruned-not-accreted.md
```

---

## Implementation Units

### U1. Write the lint-hygiene pack

**Goal:** the README and the two rule files exist in the packs README's and the guide's shape, self-contained and grounding-mapped.
**Requirements:** R1–R8, R13, R16, R18, AE1–AE10; KTD1, KTD2, KTD5–KTD7.
**Dependencies:** none.
**Files:** `compound-packs/lint-hygiene/README.md`, `compound-packs/lint-hygiene/a-lint-rule-is-proposed-only-when-the-code-settles-it.md`, `compound-packs/lint-hygiene/lint-rules-are-pruned-not-accreted.md`.

**Approach:**

- README: what the pack holds (the proposal test and the prune law), the citation form `(pack: lint-hygiene, <file>.md)`. No load-bearing text — resolving stages never read it as a rule (R2).
- Proposal rule: the seven clauses in the Clause grounding table as one sequential body; the counter-case; the hatch test with the `SAFETY:` form; the judgement list framed as illustrations; the boundary sentences for subpaths (a subpath earns its place with a consumer and a reason — never a ban), CI checks (that is ci-workflows' law) and configuration gates (that is the testing pack's law); the WRONG/RIGHT pair generic ("ban all subpath exports" / a `no-restricted-imports` value refusing the one module the file must not import); applies_when per R8, one situation per line in each stage's vocabulary.
- Prune rule: the estate prune law (restates-configuration and never-fires rules are deleted; no two rules produce the same warning; pruning rounds); applies_when covering audits, consolidation and removals.
- Every clause carries its grounding per the Clause grounding table; a clause with neither grounding is cut (R18); examples stay generic and illustrative (R1, R3).

**Test expectation:** none -- docs-only doctrine; no behavioural surface exists to test, and the brief forbids adding checks for the pack.
**Verification:** the pack resolver lists `lint-hygiene` with zero warnings and errors; `./bin/dprint check` passes; a read-through with only the pack directory open confirms each rule decides every AE case without following a pointer, and that no clause lacks its grounding.

### U2. Enroll the pack

**Goal:** the resolver and the table see the pack.
**Requirements:** R9; KTD4.
**Dependencies:** U1.
**Files:** `.compound-engineering/config.yaml`, `compound-packs/README.md`.

**Approach:** append `- source: compound-packs/lint-hygiene` after the `ci-workflows` line; add one table row after `ci-workflows` with a one-line "Holds" entry.

**Test expectation:** none -- config and table edit.
**Verification:** the resolver reports 14 roots, zero warnings and errors.

### U3. PR body, gate, and ship

**Goal:** the PR carries the verdict work, the inventory and the acceptance description, and passes the gate.
**Requirements:** R10–R12; KTD3, KTD6.
**Dependencies:** U1, U2, U4.
**Files:** the PR body (no repository file; this plan commits with the pack and the reconciliation).

**Approach:**

- Compose the PR body from Appendix A (per-record verdicts, record-stated reasons, unknown where the record is silent), Appendix B (source-quote lines naming the grounded rule) and Appendix C (the contradiction inventory with its resolutions, the owner-decision list, and the acceptance-run description with its failure conditions).
- Delete `.review-input/` before any gate and keep it out of every commit.
- Run `pnpm check:local` on the head; commit this plan with the pack and the reconciliation in the same PR (the repository refuses a plan-only PR).
- Push with a plain literal command naming the branch; open the PR; watch CI by REST; report `ARTIFACTS` and `NEXT`.

**Test expectation:** none -- delivery unit; the gate is the proof.
**Verification:** `pnpm check:local` exits 0 on the head; the PR is open with the three appendix sections present; CI green.

### U4. Reconcile the four learnings

**Goal:** no learning states what a pack rule now states.
**Requirements:** R14; KTD5.
**Dependencies:** U1.
**Files:** `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`, `docs/solutions/architecture-patterns/an-escape-hatch-is-an-unfalsified-hypothesis.md`, `docs/solutions/architecture-patterns/what-a-filename-suffix-can-enforce.md`, `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md`.

**Approach:** execute KTD5's dispositions row by row — slim each learning of the claims the rules now state, keep each learning's unique analysis, arithmetic, methods and incident stories, cite the owning rule where text moved, and add the suffix learning's supersession note with the open owner question. Delete nothing outright; no learning is fully subsumed on the current rule set.

**Test expectation:** none -- doctrine reconciliation; the duplicate check below is the proof.
**Verification:** for each learning, the text a rule states is gone and the citation stands; the unique content survives; both corpora still resolve.

---

## Verification Contract

| Check                 | Command / runner                                                                       | Passes when                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pack resolves         | `python3 <ce-plan skill>/scripts/packs-resolve.py`                                     | 14 roots, zero warnings, zero errors                                                                                                               |
| Self-containment      | grep the two rule bodies for `docs/solutions`, `AGENTS.md`, `compound-packs/` pointers | zero hits — every rule decides from the pack directory alone (R2)                                                                                  |
| No unlinked duplicate | grep the four learnings for their pack-rule citations                                  | every KTD5 row holds; no learning states what a rule states                                                                                        |
| Acceptance run        | the conductor, at the PR head, against unseen cases                                    | the packed reader's verdicts diverge from the no-pack reader's on judgement cases and hold the counter-case (R15's failure conditions all avoided) |
| Gate                  | `pnpm check:local` (after deleting `.review-input/`)                                   | exit 0 on the head                                                                                                                                 |
| Formatting            | `./bin/dprint check` (inside the gate)                                                 | exit 0                                                                                                                                             |
| Changeset             | none needed                                                                            | changeset gate exits 0: no publishable package changed                                                                                             |

`pnpm check:local` runs the whole local chain; on a host without `/dev/kvm` a microVM test task can fail its KVM preflight — a known environmental failure this repository's CI covers. A docs-only diff is judged by its own tasks: format, `lint:conventions`, `gate:layers`. Report whatever the run prints, verbatim.

---

## Definition of Done

- Item map: 1→R3, 2→R4, 3→R5, 4→R6, 5→R3, 6→R7, 7→R8 with Appendix C's reach table, 8→R10 with Appendix A, 9a→R13, 9b→R1 and R14, 9→R9 + R12 and the review/merge stages.
- Defect map: D1→R15 and Appendix A, D2→R16 with Appendix C and KTD7, D3→R2 and R14 with KTD5, D4→KTD2, D5→R8 with Appendix C's reach table, D6→R3 and R5 (tests, not lists), D7→R18 with the Clause grounding table.
- U1's files exist, self-contained, grounding-mapped, examples generic and illustrative.
- U2's two lines land; the resolver sees the pack.
- U4's dispositions hold: each learning slimmed of what the rules state, unique content kept, citations in place.
- U3: PR open from `docs/sys-1264-lint-hygiene-pack`, body carrying Appendices A, B and C's content, gate output recorded, `ARTIFACTS` and `NEXT` reported; no push force, no `--no-verify`, no merge.
- No scratch files, no `.review-input/` content anywhere in the diff.

---

## Appendix A: record verdicts (item 8)

Reasons are only what the record states; the record is the PR's close comment and its own title and body, or a repository record. Where a record states no reason, the reason is "unknown".

| Record                 | What the record states                                                                                                                                                                                                                                                                     | Verdict (item 8) | Grounding rule                                                                       | Reason per record                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #670                   | Close comment: "Closed: not approved. These rules are not going into `@systemfsoftware/oxlint-plugin-test-discipline`." Nothing else.                                                                                                                                                      | Not lint         | `a-lint-rule-is-proposed-only-when-the-code-settles-it.md`                           | unknown — the record states no reason                                                                                                                                                                                                         |
| #751                   | Doctrine for decision-machine placement wired to a lint stack; identical close comment (below).                                                                                                                                                                                            | Not lint         | proposal rule                                                                        | close comment: "There is no record of how this rule change was decided, or what product code it was measured against. A rule change comes back only through the lint escalation loop, with a real case from product code and a reproduction." |
| #752                   | `make-body-purity` follows module bindings and refuses the state-machine family in decide bodies; same close comment.                                                                                                                                                                      | Not lint         | proposal rule                                                                        | same close-comment record                                                                                                                                                                                                                     |
| #753                   | `Match.exhaustive` on every helper dispatch; same close comment.                                                                                                                                                                                                                           | Not lint         | proposal rule                                                                        | same close-comment record                                                                                                                                                                                                                     |
| #754                   | Refuse silent stays and tag-keyed dispatch in decide bodies; same close comment.                                                                                                                                                                                                           | Not lint         | proposal rule                                                                        | same close-comment record                                                                                                                                                                                                                     |
| #755                   | Title: "judge every same-file function a decide body reaches"; same close comment.                                                                                                                                                                                                         | Not lint         | proposal rule                                                                        | same close-comment record                                                                                                                                                                                                                     |
| #756                   | Refuse state-machine imports in schema files; same close comment.                                                                                                                                                                                                                          | Not lint         | proposal rule                                                                        | same close-comment record                                                                                                                                                                                                                     |
| #757                   | Keep shell machines closed; same close comment.                                                                                                                                                                                                                                            | Not lint         | proposal rule                                                                        | same close-comment record                                                                                                                                                                                                                     |
| the subpath-export ban | The issue names a deleted script that refused every PR adding a `package.json` subpath; `compound-packs/package-surface/subpaths-serve-consumers.md` states the judgement: a subpath earns its place with a consumer and a reason.                                                         | Not lint         | proposal rule                                                                        | the pack rule states the judgement the ban mechanised; the script's text is deleted, so no in-tree record of it remains                                                                                                                       |
| forbidden import       | `packages/oxlint-presets/oxlint-config-recommended/src/index.ts` ships `serverStateImports` as a `no-restricted-imports` value; `docs/solutions/build-errors/tests-outside-tsconfig-hide-workspace-source-errors.md` records a real case it caught (`node:buffer` in a Node-free package). | Lint is right    | proposal rule (counter-case) + `lint-rules-are-pruned-not-accreted.md` (stock first) | the shipped stock value and the recorded catch are the record                                                                                                                                                                                 |

## Appendix B: source quotes and the rules they ground

| Source (quoted from the page)                                                    | Quote                                                                                                                                                                                                                                                                       | Grounds                                                |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Agent-Skills, `evaluation`                                                       | "Run deterministic validation before LLM judgment whenever the artifact has machine-checkable structure." / "Separate deterministic validation failures from quality judgments."                                                                                            | the code-at-hand test                                  |
| Agent-Skills, `advanced-evaluation`                                              | "Is there an objective ground truth? ... Is it a preference or quality judgment?"                                                                                                                                                                                           | the code-at-hand test                                  |
| Agent-Skills, `self-improvement-loops`                                           | "Fix a recurring failure at the lowest rung that can express the fix."                                                                                                                                                                                                      | the record test, the stock test                        |
| Agent-Skills, `harness-engineering`                                              | "Agents stack changes and rarely remove them. Require pruning rounds."                                                                                                                                                                                                      | the prune clause and the prune rule                    |
| Osmani, brownfield agentic engineering                                           | "When the same review comment appears again, move it into a lint rule ... Keep prose for constraints that cannot be enforced mechanically."                                                                                                                                 | the record test, the code-at-hand test                 |
| Dillon Mulroy, `dmmulroy/anti-slop` README                                       | "It reflects my preferences and taste rather than attempting to be a universal coding standard." / "This project is meant to be vendored, not treated as a fixed npm dependency."                                                                                           | the category test (taste is adoption, named and owned) |
| Dillon Mulroy, `dmmulroy/anti-slop` AGENTS.md                                    | "Keep rules generic and suitable for reuse across repositories. Do not add application-specific names, paths, or exceptions."                                                                                                                                               | the key test                                           |
| Dillon Mulroy, `dmmulroy/anti-slop`, `require-safety-comment-for-type-assertion` | requires "a nearby, non-empty invariant justification", using a `SAFETY:` marker                                                                                                                                                                                            | the hatch test's named-form exemption                  |
| oxc, `oxc_linter/src/rule.rs`                                                    | correctness: "Code that is outright wrong or useless"; suspicious: "most likely wrong"; pedantic: "rather strict or have occasional false positives"; restriction: "should, emphatically, not be enabled as a whole ... considered on a case-by-case basis before enabling" | the category test                                      |
| oxc, "Adding new rules"                                                          | "Remember that `correctness` rules will be run by default, so be careful when choosing this category."                                                                                                                                                                      | the category test                                      |
| oxc's own `oxlintrc.json`                                                        | enables only the `correctness` and `perf` categories plus stock rules, and no custom rules                                                                                                                                                                                  | the category test (contrast line)                      |
| ESLint, "Proposing a new rule"                                                   | "A rule is typically too specific if describing what it does requires more than two 'and's (if a and b and c and d, then this rule warns)."                                                                                                                                 | the key test                                           |
| ESLint, "Proposing a new rule"                                                   | "Individual preferences for uncommon patterns are not supported." / "No two rules can produce the same warning."                                                                                                                                                            | the code-at-hand test, the prune rule                  |

## Appendix C: instruction inventory, resolutions, owner decisions, and reach

**Inventory of loaded instructions that speak to adding or shaping a lint rule (R16):**

| Instruction (as loaded here)                                                                                                                                                   | What it says                                                                                | Relation to the pack                                                                   | Resolution                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/oxlint-plugin/AGENTS.md` TP3                                                                                                                                         | File placement — which filenames may exist where — lives only in the test-discipline plugin | Contradicts R5's ban for proposals                                                     | TP3 governs the existing plugins' territory; the pack governs proposals. TP3's amendment is listed for the owner; the pack takes the ban       |
| `packages/oxlint-plugin/AGENTS.md` TP5                                                                                                                                         | A third test suffix lands only together with the rule that enforces it                      | Compatible — rule and key ship together                                                | none needed                                                                                                                                    |
| `packages/oxlint-plugin/AGENTS.md` TP6                                                                                                                                         | The `vitest-runner` role exists because no import key separated the runner packages' tests  | A recorded case where no sound key existed and a package-declared exemption was chosen | Listed for the owner as the known tension; the pack orders nothing changed                                                                     |
| The rule estate: 48 of 77 custom rules read the filename (conductor-measured; spot-checked at `cell-file-exports-cell-only.ts`, `kind-file-construction.ts`, `ban-classes.ts`) | Existing rules key on names                                                                 | Not precedent (CONST-S2)                                                               | The pack orders no deletion, change or re-grade; it governs proposals prospectively                                                            |
| `docs/solutions/architecture-patterns/what-a-filename-suffix-can-enforce.md`                                                                                                   | A suffix can carry edge and depth-0 syntactic properties                                    | Contradicts the blanket ban for proposals                                              | One position in the rule (the ban); the narrow carve-out question is an open owner decision; the learning slims its permissive guidance (KTD5) |
| `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`                                                                                                 | A label-routed rule cannot fail on the case it targets                                      | Grounds R5                                                                             | The learning slims the claim to story + citation (KTD5)                                                                                        |
| `docs/solutions/architecture-patterns/an-escape-hatch-is-an-unfalsified-hypothesis.md`                                                                                         | Config-level hatches need a falsifying probe                                                | Consistent with R3's hatch test; overlaps the claim                                    | The learning slims the duplicated decision text (KTD5); keeps the probe method                                                                 |
| `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md`                                                                                                    | Warn is dominated; false-positive budget arithmetic; advisory checks are not gates          | Overlaps R13 and R3                                                                    | The learning slims the overlapping normative bullets (KTD5); keeps the arithmetic and mechanisms                                               |
| `packages/oxlint-presets/oxlint-config-recommended` promotes every tsgo warning to error (conductor-stated; not verified in-tree this run)                                     | Severity above the rule's own authors' ship level, against R13's floor                      | Preset is existing configuration                                                       | Listed for the owner; no preset severity change (out of scope)                                                                                 |
| Root `AGENTS.md`                                                                                                                                                               | Lint runs per package via `oxlint.config.ts` with the `all` preset                          | Config mechanics, not proposal doctrine                                                | none needed                                                                                                                                    |
| `CODING_STANDARDS.md`                                                                                                                                                          | None exists in this repository                                                              | —                                                                                      | none needed                                                                                                                                    |
| `compound-packs/ci-workflows`, `compound-packs/testing`                                                                                                                        | What a CI check is for; configuration gets no test or gate                                  | Different domains                                                                      | Boundary sentences in the proposal rule's text (R2)                                                                                            |

**Owner decisions (listed, never made by this PR):**

1. Whether a suffix key may carry edge or depth-0 facts for a proposed rule, given item 3's ban against the suffix learning's taxonomy.
2. Whether `packages/oxlint-plugin/AGENTS.md` TP3's file-placement doctrine is amended to the pack's proposal-time position.
3. Whether the preset's tsgo warn-to-error promotion is re-graded against the category test's severity floor.

**Reach table (R8, D5):** the stage that loads packs per surface, read from the installed sources.

| Surface (item 7)                     | Stage that loads packs there (installed source)                                                                                                                                                                                                                                                      | Matching applies_when line                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Review findings                      | `ce-code-review`: declared packs select the learnings researcher (`references/persona-catalog.md`, `references/select-and-route.md`); pack roots are search roots and a contradicted rule becomes a finding with the `(pack: <id>, <path>)` citation (`references/personas/learnings-researcher.md`) | "reviewing a change that adds or shapes a lint rule"; "proposing a lint rule in a review finding"          |
| Plans                                | `ce-plan`: matching resolved pack files are read inline on the Lightweight path and feed the learnings researcher's search roots (SKILL.md Phase 1.1)                                                                                                                                                | "planning a change and deciding whether it needs a lint rule"                                              |
| PR bodies                            | none — `ce-work`'s SKILL.md and references load no packs; the guide's ce-work row matches packs against the files the work changes, and no stage reads packs while a PR body is written                                                                                                              | "proposing a lint rule in a pull request body" — carried for manual authoring; **reported as not covered** |
| `docs/solutions` Prevention sections | `ce-compound` at capture: the Related Docs Finder reads every pack rule's frontmatter and records `pack_overlap` (`references/research.md`); a pack-covered capture refines the rule instead of restating it (`references/assembly.md`)                                                              | "documenting a solved problem and weighing lint as its prevention"                                         |
| Compound learnings                   | `ce-compound` at capture (same sources)                                                                                                                                                                                                                                                              | "writing or refreshing a compound learning that proposes a lint rule"                                      |
| Brainstorm grounding                 | `ce-brainstorm`: pack discovery runs on every path and the scout quotes matching rules (`references/dialogue.md`, `references/phase-0.md`)                                                                                                                                                           | "grounding requirements in lint rules during a brainstorm"                                                 |
