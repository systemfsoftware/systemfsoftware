# Residual Review Findings — root `AGENTS.md` rewrite (`main..refactor/agents-md-rewrite`)

Source: goal-mode harness audit on branch `refactor/agents-md-rewrite` (pre-PR; 24 rule ids adjudicated — 2 `KEEP-BLOCK`, 12 `ONE-LINE`, 5 `MECHANIZE`, 4 `DELETE`, 1 `ISSUE`; 5 hooks written and proven, 1 finding filed).

Every rule id present in the pre-rewrite root `AGENTS.md` (317 lines, 28,369 bytes, identical on `main` and `feat/interface-doctrine-daemon`) receives exactly one disposition here. Nothing vanishes silently.

No tracker sink was used for the dispositions themselves: this repository has no issue-tracker convention for harness-audit residuals, so this committed file is the durable record — the same role `test-contribution-gate.md` plays for its range. The single disposition whose mechanization home lies outside this change's write scope is filed as an issue instead, and named below.

## Method

Two skills author this pass: `harness-creator` (placement, budgets, audit procedure) and `agent-docs` (`ADOC-A1` gate naming, `ADOC-A12` block-earned test).

The disposition names what happens to the rule's **prose in the root file**:

| Disposition  | Meaning                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| `KEEP-BLOCK` | Survives as a four-field block — earned under `ADOC-A12`                                                        |
| `ONE-LINE`   | Collapses to a single line naming its gate                                                                      |
| `MECHANIZE`  | Prose removed; a `PreToolUse` hook enforces it. A cited id keeps a one-line anchor so the citation resolves     |
| `ISSUE`      | Prose removed; mechanization filed as a GitHub issue because the gate's home is outside this goal's write scope |
| `DELETE`     | Prose removed, nothing replaces it                                                                              |

`ADOC-A12` is the block-earned test: a four-field block is earned only when the harm is **surprising** AND the failure **silent**. A harm a competent reader predicts from the prohibition is padding; a failure that reddens a build is its own check.

### Deletion rationale is not "covered elsewhere"

`harness-creator` audit step 3 rejects any deletion whose only surviving owner is a `~/` path, a system prompt, or a skill. So `REPO-A1`/`A2`/`A3` are **not** deleted against `USER-V1`/`V2`/`V3`, and `REPO-W1` is not deleted against `USER-W1`: those owners live in `~/.claude/CLAUDE.md`, which governs one machine and cannot own a repo rule for every contributor and for CI.

Every deletion below is instead justified by audit step 9, **model-version rot**: a line that states a fact about the _project_ survives; a line that states a fact about a _model_ — don't stop early, actually run the tests, read before you edit — is compensatory prose, presumed dead, and re-earns its place only from a failure observed on the current model. No such failure was observed in this session.

### Context-engineering canon loaded (audit step 0)

Loaded: `context-degradation` (distractor step-function, context clash, U-curve) and `context-optimization` (budget policy, static-prefix economics). Installed but deliberately not loaded: `context-fundamentals`, `context-compression`, `filesystem-context`, `memory-systems` — none bears on a rule-disposition decision, and the degradation canon just loaded is explicit that each irrelevant document in context carries a measurable cost. Recorded as a deviation rather than taken silently.

## Citation constraint

Cited ids are the union across tracked files on `main`, the primary checkout's branch, and untracked files. 17 of 24 ids are cited outside the root file and must still resolve after the rewrite. The 7 uncited ids may retire leaving a gap (`agent-docs` `references/identifiers.md`: identifiers are never renumbered and retired ids are never reused).

`REPO-W4` is cited by `.gitignore`, which this goal may not write. Its id is pinned in the file regardless of disposition.

## The ledger

| id      | cited | gate today                                | surprising harm                                    | silent failure                           | disposition |
| ------- | ----- | ----------------------------------------- | -------------------------------------------------- | ---------------------------------------- | ----------- |
| REPO-S1 | 2     | `grep` for `isolatedDeclarations`         | yes                                                | no — 153 compile errors are loud         | MECHANIZE   |
| REPO-S2 | 17    | review only                               | no                                                 | yes — supply-chain policy drift          | MECHANIZE   |
| REPO-S3 | 31    | `git diff` + `grep`                       | no — predictable from the prohibition              | no                                       | MECHANIZE   |
| REPO-S4 | 32    | `pnpm check:exports`                      | no                                                 | no — the gate reddens                    | ONE-LINE    |
| REPO-S5 | 44    | `guard-mutate-scope.mjs`                  | yes — wrong observer, equivalent mutants           | yes — the score certifies nothing        | KEEP-BLOCK  |
| REPO-S6 | 43    | `check:script-provenance` + judgement     | yes — the rule binds one clone                     | yes — looks enforced, is advisory        | KEEP-BLOCK  |
| REPO-W1 | 0     | review                                    | no                                                 | no                                       | DELETE      |
| REPO-W2 | 2     | review                                    | no                                                 | no                                       | ONE-LINE    |
| REPO-W3 | 0     | review                                    | no                                                 | no                                       | DELETE      |
| REPO-W4 | 1     | review                                    | yes — a nil result reads as diligence              | yes                                      | MECHANIZE   |
| REPO-W5 | 0     | partial — unknown collection fails loudly | no                                                 | yes — blended corpora, unfalsifiable nil | MECHANIZE   |
| REPO-D1 | 34    | `pnpm check`                              | no                                                 | no                                       | ONE-LINE    |
| REPO-A1 | 19    | review                                    | no                                                 | yes                                      | ONE-LINE    |
| REPO-A2 | 12    | review                                    | no                                                 | yes — stale evidence hides regressions   | ONE-LINE    |
| REPO-A3 | 9     | `pnpm check`                              | no                                                 | no                                       | ONE-LINE    |
| REPO-H1 | 0     | review                                    | no                                                 | no                                       | DELETE      |
| REPO-R1 | 32    | review + commitlint on the break marker   | yes — the model prior is to preserve compatibility | no                                       | ONE-LINE    |
| REPO-C1 | 8     | commitlint, `commit-msg` hook             | no                                                 | no                                       | ONE-LINE    |
| REPO-C2 | 2     | commitlint, `commit-msg` hook             | no                                                 | no                                       | ONE-LINE    |
| REPO-C3 | 0     | `grep` over `git log`                     | no                                                 | yes — attribution pollution              | ISSUE       |
| REPO-P1 | 20    | review                                    | no                                                 | no                                       | ONE-LINE    |
| REPO-M1 | 1     | review                                    | no                                                 | yes — contradictory concurrent edits     | ONE-LINE    |
| REPO-E1 | 0     | review                                    | no                                                 | no                                       | ONE-LINE    |
| REPO-X1 | 0     | `git status --porcelain`                  | no                                                 | no                                       | DELETE      |

Totals: `KEEP-BLOCK` 2, `ONE-LINE` 12, `MECHANIZE` 5, `ISSUE` 1, `DELETE` 4 — 24 ids, one disposition each.

## Reasons that are not obvious from the table

**REPO-S3 — MECHANIZE, not ONE-LINE.** The user named it as a one-line collapse, and the harm is indeed predictable. But `harness-creator` is explicit that an inverted ownership class is a path-predicate write block _before_ it is a paragraph: a gate enforces it for every agent on every call, a paragraph only asks. Mechanizing is strictly stronger than the collapse that was asked for, so the ask is satisfied by exceeding it, not by declining it.

**REPO-S5 and REPO-S6 — the only earned blocks.** Both clear `ADOC-A12` on both axes. `S5`'s harm is that mutating a shell cell asks the wrong question, so the run is expensive and certifies nothing while showing green. `S6`'s harm is that a gate in this clone makes a published doctrine look enforced while every consumer receives it as prose. Neither harm is predictable from its own prohibition, and neither failure reddens anything.

**REPO-W4 — the anticipated dispute, dissolved rather than resolved by taste.** The goal names `REPO-W4` and `REPO-W5` as the predictable stop-and-ask cases: no deterministic gate, plausibly real weight. The stop condition fires on a _genuine_ dispute between the gate test and stated intent. Building a real gate removes the dispute instead of settling it — the same move that closed the harness-composition question earlier in this session. Both are mechanized below and both hooks are proven to fail closed, so neither disposition rests on preference.

The mechanization is partial and the ledger says so: the hook gates the _trigger_ (a plan written without a corpus query), not the _quality_ (entering at the manifest, capping candidate slugs, reporting a nil result verbatim). What survives in prose is only the part no predicate can hold.

**REPO-R1 — ONE-LINE despite having no full gate.** It states a fact about the project (every package is pre-1.0 alpha), not a fact about a model, so audit step 9 does not touch it. Half of it _is_ gated: commitlint already accepts `api!` and `BREAKING CHANGE:`, which is the recording half.

**REPO-P1 — ONE-LINE, unmechanizable by construction.** "Ask the user first" cannot be a predicate; a hook that could decide it would already be the approval. `harness-creator` puts human-approval boundaries in the root-or-hook class with no exceptions, so it stays static.

**REPO-E1 — ONE-LINE.** The `docs/solutions/` pointer is a situational read with a real trigger, which is placement step 4 and legitimate. The rest of the rule routed to documents the Doctrine Index already routes to.

## Exemption: measured weight outranks the gate test

The **Doctrine Index** carries no deterministic gate, so a naive `ADOC-A1` sweep deletes it. It is exempt, and the exemption is evidence, not preference: this session's disclosure ruling measured it at 344 tokens for +19pp against a `bare` baseline — 1.000× per token, the best token buy measured in the file, and the only line in it with a measured floor. `ADOC-A1` outranks taste; it does not outrank measurement.

The same ruling is why no rewrite reorders prose to buy attention: moving the constitution from the context end to 22% depth changed nothing (85% vs 85%, p=1.000, n=58), and the only mechanized position effect in the corpus is the attention sink, which sits at the head of the assembled sequence and is occupied by harness text no instruction file can reach.

## Validator adjudication

### `agent-docs` names three gates and ships none

`ADOC-A1` is the skill's central claim — a rule with no gate is wishful thinking — and every one of its own eleven rules names `./derive-check.mjs`, `./check-rule-block-earned.ts`, or `./audit-ids.mjs` as its enforcement. None of the three exists. Confirmed by two independent passes: a `gitignore=false, hidden=true` walk of the skill tree, which returns `SKILL.md` plus four reference files and no scripts directory, and a machine-wide search for the three filenames, which returns nothing. `harness-creator` names `check-rule-block-earned.ts` too and also does not ship it; it does ship `validate-harness.ts`, `render-judge-input.ts` and four others. So the skill fails its own `ADOC-A1`, which is also the first entry in its own anti-pattern list.

Criterion 10 is therefore unsatisfiable as literally written, and two of this goal's constraints collide on the repair: criterion 10 wants a validator that parses `AGENTS.md`, while `REPO-S6` and `check:script-provenance` forbid any repo script reading a doctrine file. Both hold if the validators are authoring tools rather than repo scripts, which is what `agent-docs` intends anyway — its gates ship with the skill, not with the project. They were written to the contract stated in `SKILL.md` (`ADOC-A12`: V1 uncarried check, V2 missing harm, V3 negated restatement, V4 a path named in `check:` that no command executes; the surprising/silent judgement reserved to the reviewer) and live at `/tmp/agent-docs-gates/`. `~/.claude/skills/` is denylisted by this goal, so they were not installed there.

Both were falsified before being trusted, per that skill's own anti-pattern 1 and `USER-V4`: a known-good fixture exits 0, one fixture per defect class exits 1, and a fixture with no parseable rules exits **3** — a distinct code so that an unparsed document and a clean one cannot report identically, which is the failure `references/identifiers.md` calls out by name.

| gate                         | good | V1     | V2 | V3 | V4 | unparsed |
| ---------------------------- | ---- | ------ | -- | -- | -- | -------- |
| `check-rule-block-earned.ts` | 0    | 1      | 1  | 1  | 1  | 3        |
| `derive-check.mjs`           | 0    | 1 (A1) | —  | —  | —  | 3        |

Run against the rewritten file, `check-rule-block-earned.ts` exited 0 on the first pass and `derive-check.mjs` exited **1 with nine findings** — nine one-liners naming no gate and declaring no reviewer decision (`S2`, `S3`, `W2`, `A2`, `R1`, `C1`, `C2`, `M1`, `E1`). The file was repaired; the gate was not relaxed. `S2` and `S3` said "Gate: same hook" rather than naming the hook, which reads fine to a human and gives an agent grepping for `REPO-S2`'s gate nothing; `R1`, `C1` and `C2` left `commitlint` outside backticks; the remaining four now declare `review — <what the reviewer decides>`, the form `ADOC-A12` V1 explicitly admits. Both gates exit 0 after the repair.

`derive-check.mjs` also under-reported on its first run — 17 rules where 18 are declared, because a second `- id:` inside one YAML fence overwrote the first without recording it. A validator that silently drops a rule is the defect class it exists to catch, so it was fixed and given a two-block regression fixture before its verdict was accepted.

### `validate-harness.ts`

**80/100, bottleneck `hierarchy`.** Recorded in full; findings adjudicated, not obeyed.

Relevant passes: static instruction surface **119 lines against the 500-line budget**; zero duplicated rule lines across instruction files; every `check:` field names a command or declares itself review-gated; every leaf delta confirmed delivered via `.claude/hooks/deliver-leaf-agents-md.sh`; leaf coverage evidence-gated with 4 candidates showing a distinct boundary and 57 governed by the root by design; `CLAUDE.md` is a pointer, not a second manual.

One FAIL: **stale path references** — `packages/effect-daemon-spec/AGENTS.md` names `dist/index.d.ts` and `dist/effect-daemon-spec.d.ts`, neither of which exists in a clean tree. **Not adopted, and not caused by this change.** The file is a leaf this goal never wrote, under `packages/`, which is denylisted here because a concurrent agent is live in it (`REPO-M1`). The finding is real and should be repaired by whoever owns that leaf; repairing it from this worktree would violate the boundary that keeps the two agents disjoint. Recorded rather than silently carried.

No disagreement with `ADOC-A1`/`ADOC-A12` arose: the validator's scoring and the two gate tests agreed everywhere they overlapped.

## Issues filed

| id      | disposition | issue                                                                                                              |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| REPO-C3 | ISSUE       | [#91](https://github.com/systemfsoftware/systemfsoftware/issues/91) — reject AI co-author trailers in `commit-msg` |

`REPO-C3`'s gate has a real home this repo already owns — `commitlint.config.cjs`, reached by the existing `commit-msg` hook — but that home is outside this goal's write scope, so it is filed rather than fixed. The issue carries two boolean acceptance criteria observed by running commitlint, not by review.

## Hook evidence

Every guard produced a real exit code against the real environment in this session (`USER-V4`), via `bash .claude/hooks/hooks.test.sh` — 27 cells, all green, each guard firing on known-bad and staying silent on known-good, plus a control per guard proving it is not a blanket blocker.

Four of those cells are commands this repository has actually run, taken verbatim from the session transcript rather than composed by the guard's own author — the `AB8` correction. That is not decoration: it caught a live false positive. `qmd query --help` carries no `-c`, was run earlier in this session, and the first version of `guard-qmd-scope.sh` refused it. Fixtures written in the author's own words had all passed.

A second defect was caught before shipping: `set -o pipefail` with a non-matching `grep` made the qmd guard return 1 on **every** Bash call containing no `qmd`, which would have surfaced as constant spurious hook errors. Restructured to a herestring so the loop runs in the current shell.

**Dispatch limitation, recorded rather than glossed.** The fixtures prove each guard's logic against real payload shapes. They do not prove the harness invokes them, because this session's project directory is the primary checkout, not the worktree. Dispatch for the `Write|Edit|MultiEdit` matcher is evidenced by its sibling `deliver-leaf-agents-md.sh` firing live in this session from the identical `type: command` entry. Dispatch for the new `Bash` matcher has no such precedent in this `settings.json` and stays unproven until a session runs rooted at the worktree.
