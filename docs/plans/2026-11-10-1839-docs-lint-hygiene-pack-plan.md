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

- **Objective:** a planner, a reviewer and a compound-learning author in this repository hold every lint-rule proposal to one test: lint decides only what the code at hand settles — an objective, recurring restraint at its authors' category and severity — and a judgement call stays a pack rule that review applies. The test is applied by reading, not by running anything.
- **Means:** a new pack `compound-packs/lint-hygiene/` (a README plus seven rule files) in the shape the packs README and the CE packs guide set, the four overlapping `docs/solutions` learnings reconciled against it, and enrolment in `.compound-engineering/config.yaml` and the packs table (KTD1, KTD2, KTD5).
- **Authority:** the SYS-1264 brief as amended 2026-11-10 (items 1 to 9 including 9a and 9b; "Done when" and "Does not count" are the contract), the conductor's research comment on that issue (anti-slop, oxc rule categories and adding-rules guide, ESLint core rule guidelines), the owner's 2026-11-10 quote and the saved lesson "Enforce a forbidden import with an oxlint no-restricted-imports rule, not with a prose claim in AGENTS.md", `CONSTITUTION.md` (CONST-S4, CONST-T12), and the packs README's rule shape.
- **Stop conditions:** the pack files, the four named `docs/solutions` learnings, the two enrolment lines, and this plan. No new lint rule, test, check, hook or CI job; no edit under `.github/`, `packages/`, `scripts/`; no other `docs/solutions` file; no change in any other repository.
- **Execution profile:** docs-only, one pull request from `origin/main` on branch `docs/sys-1264-lint-hygiene-pack`. Verification is the pack resolver, the no-unlinked-duplicate check, `pnpm check:local` on the head, and the PR body's per-record verdicts.
- **Finishes and ships:** the ce-work executor authors the pack and the reconciliation, commits this plan with them, pushes with a plain literal command naming the branch, and opens the PR. The conductor arranges the independent review at the exact head; the PR merges through the queue after a clean review.
- **Open blockers:** none.

---

## Product Contract

### Summary

Add a compound pack of seven review rules for lint-rule proposals. The tests a proposal must pass: lint decides only what the code at hand settles (a verdict needing consumers, intent or product context is review's), the restraint is recurring (a record, not one occurrence), the rule keys on what code is or does and stays describable in two "and"s, stock rules come first, a rule that needs a path or file allowlist, carve-outs or blanket inline disables is a judgement while an exemption written in the code with a justification in a form the rule itself names is allowed, and every addition prunes. Each proposed rule declares its oxc category; only correctness-grade rules run by default and at error, never above their authors' shipped severity; a taste rule is the owner's adoption, never an agent's recommendation. The test applies wherever a rule is proposed. Learnings the pack fully covers slim to their incident story plus a citation.

### Problem Frame

Agents propose brittle, overfit linter rules for domains where reviewers decide case by case. The owner, 2026-11-10: "often times the agent will recommend a ridiculous brittle and overfit linter rule that doesn't even make sense since the domain is entirely subjective. For example you cannot have a linter rule that bans all subpath exports. Whether or not a subpath export should be added is a judgement layer." The closed records show the shape: #670 (rules refused for a test-discipline plugin), the seven-PR stack #751–#757 (a lint rule for every same-file function a decide body reaches, state-machine imports in decide bodies and schema files, `Match.exhaustive` on every helper dispatch), and a deleted approval script that refused every PR adding a `package.json` subpath. The counter-ruling must survive: objective restraints do belong in lint — this repository's preset already enforces forbidden imports as `no-restricted-imports`.

The amended brief and the research comment sharpen what professional lint authors do. They do lint taste, but they label it as taste (oxc's style, pedantic and restriction categories), the team adopts it on purpose, and it stays decidable from the code in front of the rule; oxc guards `correctness` as "run by default, so be careful when choosing this category", and oxc lints its own repository with stock correctness and perf rules and zero custom rules, against this repository's eighty-seven custom rules in five plugins. What can never be linted is a verdict that needs who consumes a subpath, why a module is split or what the product needs. No doctrine owns the proposal test today; the nearest owners hold neighbouring domains and are reconciled, not duplicated (R14).

### Key Decisions

- KD1. **One new pack, not disjoint rules in an existing pack.** No enrolled pack owns lint-rule proposals; the brief's item 9 says the packs table lists "the pack". Governs R1, R2, R9.
- KD2. **The restraint tests govern; the record verdicts stay in the PR body.** Governs R3–R8, R10, R13.

### Requirements

**Pack shape**

- R1. `compound-packs/lint-hygiene/` sits beside the enrolled packs in the packs README's shape and follows the CE packs guide (https://every.to/compound-engineering/guides/packs): one rule per top-level `.md` file; frontmatter keys exactly `title`, `applies_when`, `tags`; each rule a prescriptive always/never statement with a situational `applies_when`, one situation per line, in the words a task would use; short prescriptive prose; at most one short WRONG/RIGHT example per rule; rules disjoint, with a narrower carve-out also sitting in the broader rule's text; examples generic (no repository, product, person, path or link a signed-out reader cannot open); no `Gate:` line; no incident narrative, history or evidence in any body; pack text is evidence that planning and review quote, never an enforcement contract (KTD2, KTD3).
- R2. The pack README describes the pack and cites the neighbouring owners instead of restating them: `ci-workflows/ci-never-grades-the-repository-itself.md` (what a check may grade), `testing/configuration-gets-no-test-and-no-gate.md` (configuration gets no gate), `package-surface/subpaths-serve-consumers.md` (where the subpath judgement lives). No rule shares a fix with a neighbour's rule (CONST-S4).

**The restraint tests**

- R3. `lint-carries-only-objective-restraints.md`: lint decides only what the code at hand settles. Lint (oxlint or gritlint, stock config or custom plugin) is proposed only for a restraint every reviewer would decide the same way on every instance, from syntax, types or imports alone; a verdict that needs consumers, intent or product context belongs to review. Whether a subpath export, an abstraction, a module split, a dependency or a name is right is a judgement, and a judgement is a pack rule that review applies, never lint. The detection clauses for a judgement: a rule that needs a path or file allowlist, carve-outs, or blanket inline disables to pass the current tree; while an exemption written in the code with a stated justification, in a form the rule itself names (like a `SAFETY:` comment), is allowed. The counter-case stands in the same rule: an objective restraint — a forbidden import — becomes lint, as stock `no-restricted-imports` (the preset's `serverStateImports` is the shipped example).
- R4. `a-rule-needs-a-recurring-record.md`: one occurrence earns a fix, not a rule. A proposal needs recurring product-code cases, cited; a violation that would otherwise stay silent; and nothing that already catches it — a type, a stock rule, a test. Adding a rule is the owner's call.
- R5. `rules-key-on-what-code-is-or-does.md`: no rule keys on a file name, suffix, path or the words of the last incident (CONST-T12). A key is sound when the author cannot silently opt out of it: a type, an import edge or a whole-graph fact, package membership. ESLint's specificity test applies: a rule whose description needs more than two "and"s is too specific.
- R6. `stock-rules-before-custom.md`: stock rules and configuration (`no-restricted-imports`, `no-restricted-syntax`, or the gritlint equivalent) come before a custom plugin rule.
- R7. `every-addition-prunes.md`: an added rule names what comes out — the prose, the check or the rule it replaces. No two rules produce the same warning; a rule that restates configuration, or never fires, is deleted (CONST-S4).
- R8. `a-lint-proposal-is-tested-wherever-it-is-written.md`: `applies_when` covers writing a review finding, a plan, a PR body, a `docs/solutions` Prevention section, or a compound learning that proposes a lint rule. "Add a lint rule to prevent this" is a finding only when R3–R7 and R13 hold; otherwise the text cites the pack rule that carries the judgement.

**The category and severity test**

- R13. `rules-declare-category-and-severity.md`: every proposed rule declares its category in oxc's terms — correctness, suspicious, pedantic, perf, style, restriction. Only correctness-grade rules run by default and at error. Severity never rises above what the rule's own authors ship it at. A taste rule (style, pedantic, restriction) is the owner's adoption, never an agent's recommendation.

**Enrolment, reconciliation, and delivery**

- R9. `compound-packs/README.md`'s table lists the pack; `.compound-engineering/config.yaml` enrolls `compound-packs/lint-hygiene` (KTD4).
- R10. The PR body carries item 8's verdict per record — not lint: #670, #751–#757, the subpath-export ban; lint is right: a forbidden import as `no-restricted-imports` — each verdict naming the pack rule that grounds it, and one line per source quote (the brief's five, plus the research comment's four) saying which rule it grounds. The record map is Appendix A; the quote map is Appendix B.
- R11. The diff adds no lint rule, test, check, hook or CI job, carries nothing from `.review-input/`, and needs no changeset (no publishable package changes).
- R12. Publication: a plain literal push command naming `docs/sys-1264-lint-hygiene-pack`; the executor opens the PR; `pnpm check:local` exits 0 on the head; review and merge through the queue are post-PR stages the conductor owns.
- R14. The four `docs/solutions` learnings the pack overlaps are reconciled so no unlinked duplicate stays, per the guide's harvest procedure: a learning a rule fully covers slims to its incident story plus a citation of the rule (or is deleted when fully subsumed); a partially covered learning keeps its own claims and gains the citation at the point of contact. The dispositions are KTD5's table; U4 executes them.

### Acceptance Examples

- AE1. **Covers R3, R8.** A review finding proposes banning all subpath exports. Refused: whether a subpath should exist is a judgement; the finding cites `(pack: package-surface, subpaths-serve-consumers.md)` instead.
- AE2. **Covers R3, R6.** A proposal forbids importing a module a file may not reach: recurring, silent otherwise, caught by nothing. Accepted as a `no-restricted-imports` value — the counter-case holds; the pack does not forbid lint outright.
- AE3. **Covers R4.** One occurrence of a violation reaches review. It earns a fix; no rule is proposed.
- AE4. **Covers R5.** A proposed rule keys on a filename suffix or quotes last week's incident. Refused, or reshaped to key on an import edge or a type.
- AE5. **Covers R3.** A proposed rule passes the current tree only with a path allowlist or blanket inline disables. It is a judgement; review owns it. The same rule with a code-local exemption in the form it names — a `SAFETY:` comment carrying a justification — passes.
- AE6. **Covers R7.** A proposal adds a rule and names no removal, or the rule restates configuration. Refused; a rule that never fires, or that duplicates another rule's warning, is deleted.
- AE7. **Covers R8.** A Prevention section wants a lint rule for a style preference. The section cites the judgement's pack rule instead.
- AE8. **Covers R5.** A rule's description needs four "and"s to say what it refuses. Too specific; refused or narrowed.
- AE9. **Covers R13.** An agent recommends a style-category rule as a default-on error. Refused: a taste rule is the owner's adoption; only correctness-grade rules run by default, and never above their authors' severity.
- AE10. **Covers R14.** A learning restates a pack rule's claim verbatim. It slims to its incident story plus the citation; nothing says the same thing twice unlinked.

### Scope Boundaries

- No enforcement of this pack: no lint rule, test, check, hook or CI job enforces it — judgement belongs in review (the brief's "Does not count").
- Reconciliation touches only the four learnings named in KTD5; no other `docs/solutions` file moves or shrinks. A learning is deleted outright only when a rule fully subsumes it and nothing unique remains; the plan expects none (KTD5 slims one, keeps three).
- No consumer-repo work: repositories that enroll this repo's packs move their `ref` and enroll the new pack themselves (the brief's follow-up).
- No lint escalation loop: the loop that returns a refused rule change is researched separately; this pack cites its entry requirements (R4) without implementing it.
- No incident narrative anywhere in `compound-packs/lint-hygiene/`; records and sources live in the PR body only.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **A new pack `lint-hygiene`, not disjoint rules in `ci-workflows` or `testing`.** Those packs own what a CI check is for and what gets a test or gate; none owns when a lint rule may be proposed. Governs R1, R2, R9.
- KTD2. **Seven rules, not one per brief item.** Item 5's two allowlist clauses fold into R3's rule — they fix the same failure (refuse the rule, keep the judgement in review) and the packs guide puts a narrower carve-out in the broader rule's text. Item 9a earns its own rule: its fix (declare category, ship at the authors' severity, taste is adoption) is disjoint from stock-before-custom's. Item 9b is shape conformance plus reconciliation, not a rule file. Governs R1, R3, R13, R14.
- KTD3. **Records and sources appear only in the PR body.** The packs README and the guide put incident narratives, history and evidence outside rule bodies; the brief repeats it, and the conductor's research comment names the four professional-practice sources that Appendix B maps to rules. Governs R1, R10.
- KTD4. **Enrolment order: after `ci-workflows`, before `public-repository`** in both `.compound-engineering/config.yaml` and the table — harness-conduct doctrine groups together. Governs R9.
- KTD5. **The pack owns claims it fully covers; the rest it cites.** Per the guide's harvest procedure, discovery searches packs and learnings together, so an unlinked duplicate surfaces twice and drifts. Dispositions:

  | Learning                                                                               | Coverage by the pack                                                                                                | Disposition                                                                                                                                                                                                                                                                                                                                                                                                              |
  | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`         | Full: the sound-key claim is R5's rule, stated over the same cases                                                  | Slim: keep the decision line, the supersession notes, the stories (the demonstration, the mutation-glob instance, the falsification and recurrence probes, what would still defeat it) and the decision rationale; delete the sections that restate the rule's normative claim (the argument, the sound-key table, the resulting shape prescriptions); cite `(pack: lint-hygiene, rules-key-on-what-code-is-or-does.md)` |
  | `docs/solutions/architecture-patterns/an-escape-hatch-is-an-unfalsified-hypothesis.md` | Partial: the probe method and hygiene are its own; no contradiction with the named-form allowance                   | Keep; cite `(pack: lint-hygiene, lint-carries-only-objective-restraints.md)` at the exemption point                                                                                                                                                                                                                                                                                                                      |
  | `docs/solutions/architecture-patterns/what-a-filename-suffix-can-enforce.md`           | Partial: the frame and decidability analysis are its own                                                            | Keep; cite `(pack: lint-hygiene, rules-key-on-what-code-is-or-does.md)`                                                                                                                                                                                                                                                                                                                                                  |
  | `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md`            | Partial: the false-positive budget, the warn analysis, the accretion mechanisms and the scripts hygiene are its own | Keep; cite `(pack: lint-hygiene, rules-declare-category-and-severity.md)` at the severity point and `(pack: lint-hygiene, lint-carries-only-objective-restraints.md)` at the advisory point                                                                                                                                                                                                                              |

  Governs R14, R5, R3, R13.
- KTD6. **Citation practice follows the repo's committed plans:** the brief is cited as SYS-1264 the way `docs/plans` cites its briefs; records on the public forge are cited by number; rule bodies and examples name nothing at all. Governs R1, R10.

### High-Level Technical Design

The proposal test the seven rules carry, as a reviewer walks it:

```mermaid
flowchart TB
  P[Proposal: add a lint rule] --> O{Does the code at hand
  settle it — same verdict from
  syntax, types, imports alone?}
  O -- no, needs consumers,
  intent or product --> J[Judgement: cite the pack rule
  that carries it — never lint]
  O -- yes --> X{Describable in two
  "and"s, keyed on what
  code is or does?}
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

The test sequence the seven rules carry; the rule files' prose is authoritative.

### Output Structure

```text
compound-packs/lint-hygiene/
  README.md
  lint-carries-only-objective-restraints.md
  a-rule-needs-a-recurring-record.md
  rules-key-on-what-code-is-or-does.md
  stock-rules-before-custom.md
  every-addition-prunes.md
  a-lint-proposal-is-tested-wherever-it-is-written.md
  rules-declare-category-and-severity.md
```

---

## Implementation Units

### U1. Write the lint-hygiene pack

**Goal:** the seven rules and the pack README exist in the packs README's and the guide's shape.
**Requirements:** R1–R8, R13, AE1–AE9; KTD1–KTD3, KTD6.
**Dependencies:** none.
**Files:** `compound-packs/lint-hygiene/README.md` and the seven rule files named in Output Structure.

**Approach:**

- README: what the pack holds (the proposal test), the citation form `(pack: lint-hygiene, <file>.md)`, and R2's three neighbour citations with the boundary sentence for each — the neighbours keep their rules.
- R3's rule carries the code-at-hand test, the judgement list, the two detection clauses (config-level escape hatches are judgements; a code-local exemption in a form the rule names, like a `SAFETY:` comment with a justification, is allowed), and the counter-case with a generic RIGHT (`no-restricted-imports` refusing a named module) and WRONG (a ban on every subpath export).
- R4's rule states the three-part record test and that adding a rule is the owner's call.
- R5's rule states CONST-T12, the three sound keys (type, import edge or whole-graph fact, package membership) and the two-"and"s test.
- R6's rule states stock-before-custom; cites the preset's composed import bans as the shipped form.
- R7's rule states prune-on-add, no duplicate warnings, and delete-when-restating-or-silent.
- R8's rule lists the five places and the cite-instead-of-lint outcome.
- R13's rule states the six oxc categories, the default-on guard (only correctness runs by default and at error), the no-rising-severity floor, and that a taste rule is the owner's adoption.
- Every rule cites its `docs/solutions` owners where a claim is only partially the pack's (KTD5's keep rows) and names nothing private (R1).

**Test expectation:** none -- docs-only doctrine; no behavioural surface exists to test, and the brief forbids adding checks for the pack.
**Verification:** the pack resolver lists `lint-hygiene` with zero warnings and errors; `./bin/dprint check` passes; a read-through confirms each rule holds its brief item, stays disjoint from the neighbours and from the other six rules, and carries its carve-outs in the broader rule's text.

### U2. Enroll the pack

**Goal:** the resolver and the table see the pack.
**Requirements:** R9; KTD4.
**Dependencies:** U1.
**Files:** `.compound-engineering/config.yaml`, `compound-packs/README.md`.

**Approach:** append `- source: compound-packs/lint-hygiene` after the `ci-workflows` line; add one table row after `ci-workflows` with a one-line "Holds" entry.

**Test expectation:** none -- config and table edit.
**Verification:** the resolver reports 14 roots, zero warnings and errors.

### U3. PR body, gate, and ship

**Goal:** the PR carries the verdict work and passes the gate.
**Requirements:** R10–R12; KTD3, KTD6.
**Dependencies:** U1, U2, U4.
**Files:** the PR body (no repository file; this plan commits with the pack and the reconciliation).

**Approach:**

- Compose the PR body from Appendix A (one verdict per record, each naming its grounding rule) and Appendix B (one line per source quote naming the rule it grounds — the brief's five sources and the research comment's four).
- Delete `.review-input/` before any gate and keep it out of every commit.
- Run `pnpm check:local` on the head; commit this plan with the pack and the reconciliation in the same PR (the repository refuses a plan-only PR).
- Push with a plain literal command naming the branch; open the PR; watch CI by REST; report `ARTIFACTS` and `NEXT`.

**Test expectation:** none -- delivery unit; the gate is the proof.
**Verification:** `pnpm check:local` exits 0 on the head; the PR is open with the verdict table and quote lines present; CI green.

### U4. Reconcile the four learnings

**Goal:** no unlinked duplicate stays between the pack and `docs/solutions`.
**Requirements:** R14; KTD5.
**Dependencies:** U1.
**Files:** `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`, `docs/solutions/architecture-patterns/an-escape-hatch-is-an-unfalsified-hypothesis.md`, `docs/solutions/architecture-patterns/what-a-filename-suffix-can-enforce.md`, `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md`.

**Approach:** execute KTD5's dispositions row by row — slim `label-routed-rules-are-unfalsifiable.md` (delete the sections that restate R5's rule's normative claim; keep the decision line, supersession notes, stories and decision rationale; add the citation); add the point-of-contact citations to the other three; rewrite nothing else in them.

**Test expectation:** none -- doctrine reconciliation; the duplicate check below is the proof.
**Verification:** each learning names its pack rule where the pack owns a claim; the pack's rules restate no learning's unique content; both corpora still resolve.

---

## Verification Contract

| Check                 | Command                                               | Passes when                                                                 |
| --------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| Pack resolves         | `python3 <ce-plan skill>/scripts/packs-resolve.py`    | 14 roots, zero warnings, zero errors                                        |
| No unlinked duplicate | grep the four learnings for their pack-rule citations | every KTD5 row holds; no learning restates a rule's claim without citing it |
| Gate                  | `pnpm check:local` (after deleting `.review-input/`)  | exit 0 on the head                                                          |
| Formatting            | `./bin/dprint check` (inside the gate)                | exit 0                                                                      |
| Changeset             | none needed                                           | changeset gate exits 0: no publishable package changed                      |

`pnpm check:local` runs the whole local chain; on a host without `/dev/kvm` a microVM test task can fail its KVM preflight — a known environmental failure this repository's CI covers. A docs-only diff is judged by its own tasks: format, `lint:conventions`, `gate:layers`. Report whatever the run prints, verbatim.

---

## Definition of Done

- Item map: 1→R3, 2→R4, 3→R5, 4→R6, 5→R3, 6→R7, 7→R8, 8→R10, 9a→R13, 9b→R1 and R14, 9→R9 + R12 and the review/merge stages.
- U1's files exist, in the guide's shape, disjoint from the neighbours and from each other, examples generic.
- U2's two lines land; the resolver sees the pack.
- U4's dispositions hold: one learning slimmed, three cited, no unlinked duplicate.
- U3: PR open from `docs/sys-1264-lint-hygiene-pack`, body carrying Appendix A and B's content, gate output recorded, `ARTIFACTS` and `NEXT` reported; no push force, no `--no-verify`, no merge.
- No scratch files, no `.review-input/` content anywhere in the diff.

---

## Appendix A: record verdicts (item 8)

| Record                 | What it proposed                                                                                   | Verdict       | Grounding rule                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| #670                   | rules for `@systemfsoftware/oxlint-plugin-test-discipline`; closed "not approved"                  | Not lint      | `a-rule-needs-a-recurring-record.md` — no record of recurring product-code cases or an objective restraint                 |
| #751                   | pack doctrine for decision-machine placement, wired to a lint stack                                | Not lint      | `lint-carries-only-objective-restraints.md` — the placements are architecture judgements                                   |
| #752                   | `make-body-purity` follows every module binding; refuses the state-machine family in decide bodies | Not lint      | `lint-carries-only-objective-restraints.md` — which helper a decide body may reach is decided per case                     |
| #753                   | `Match.exhaustive` required on every helper dispatch                                               | Not lint      | `lint-carries-only-objective-restraints.md` — dispatch idiom is a judgement; the fix landed as code, no rule               |
| #755                   | judge every same-file function a decide body reaches                                               | Not lint      | `lint-carries-only-objective-restraints.md` — the brief refuses this design choice by name                                 |
| #756                   | refuse state-machine imports in schema files                                                       | Not lint      | `rules-key-on-what-code-is-or-does.md` — extends a design ruling by file kind, not from a recurring record                 |
| #757                   | keep shell machines closed (cell-architecture plugin gates)                                        | Not lint      | `lint-carries-only-objective-restraints.md` — shell-machine closure is a design judgement                                  |
| the subpath-export ban | a deleted script refusing every PR that added a `package.json` subpath                             | Not lint      | `lint-carries-only-objective-restraints.md`; the judgement lives in `(pack: package-surface, subpaths-serve-consumers.md)` |
| forbidden import       | banning a module a file may not reach                                                              | Lint is right | `lint-carries-only-objective-restraints.md` + `stock-rules-before-custom.md` — objective, recurring, stock rule            |

## Appendix B: source quotes and the rules they ground

| Source (quoted from the page)                                                    | Quote                                                                                                                                                                                                                                                                       | Grounds                                                                           |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Agent-Skills, `evaluation`                                                       | "Run deterministic validation before LLM judgment whenever the artifact has machine-checkable structure." / "Separate deterministic validation failures from quality judgments."                                                                                            | `lint-carries-only-objective-restraints.md`                                       |
| Agent-Skills, `advanced-evaluation`                                              | "Is there an objective ground truth? ... Is it a preference or quality judgment?"                                                                                                                                                                                           | `lint-carries-only-objective-restraints.md`                                       |
| Agent-Skills, `self-improvement-loops`                                           | "Fix a recurring failure at the lowest rung that can express the fix."                                                                                                                                                                                                      | `a-rule-needs-a-recurring-record.md`, `stock-rules-before-custom.md`              |
| Agent-Skills, `harness-engineering`                                              | "Agents stack changes and rarely remove them. Require pruning rounds."                                                                                                                                                                                                      | `every-addition-prunes.md`                                                        |
| Osmani, brownfield agentic engineering                                           | "When the same review comment appears again, move it into a lint rule ... Keep prose for constraints that cannot be enforced mechanically."                                                                                                                                 | `lint-carries-only-objective-restraints.md`, `a-rule-needs-a-recurring-record.md` |
| Dillon Mulroy, `dmmulroy/anti-slop` README                                       | "It reflects my preferences and taste rather than attempting to be a universal coding standard." / "This project is meant to be vendored, not treated as a fixed npm dependency."                                                                                           | `rules-declare-category-and-severity.md` (taste is adoption, named and owned)     |
| Dillon Mulroy, `dmmulroy/anti-slop` AGENTS.md                                    | "Keep rules generic and suitable for reuse across repositories. Do not add application-specific names, paths, or exceptions."                                                                                                                                               | `rules-key-on-what-code-is-or-does.md`                                            |
| Dillon Mulroy, `dmmulroy/anti-slop`, `require-safety-comment-for-type-assertion` | requires "a nearby, non-empty invariant justification", using a `SAFETY:` marker                                                                                                                                                                                            | the named-form exemption clause of `lint-carries-only-objective-restraints.md`    |
| oxc, `oxc_linter/src/rule.rs`                                                    | correctness: "Code that is outright wrong or useless"; suspicious: "most likely wrong"; pedantic: "rather strict or have occasional false positives"; restriction: "should, emphatically, not be enabled as a whole ... considered on a case-by-case basis before enabling" | `rules-declare-category-and-severity.md`                                          |
| oxc, "Adding new rules"                                                          | "Remember that `correctness` rules will be run by default, so be careful when choosing this category."                                                                                                                                                                      | `rules-declare-category-and-severity.md`                                          |
| oxc's own `oxlintrc.json`                                                        | enables only the `correctness` and `perf` categories plus stock rules, and no custom rules                                                                                                                                                                                  | contrast line of `rules-declare-category-and-severity.md`                         |
| ESLint, "Proposing a new rule"                                                   | "A rule is typically too specific if describing what it does requires more than two 'and's (if a and b and c and d, then this rule warns)."                                                                                                                                 | `rules-key-on-what-code-is-or-does.md`                                            |
| ESLint, "Proposing a new rule"                                                   | "Individual preferences for uncommon patterns are not supported." / "No two rules can produce the same warning."                                                                                                                                                            | `lint-carries-only-objective-restraints.md`, `every-addition-prunes.md`           |
