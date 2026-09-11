---
title: A Gate That Checks the Form of a Justification Is a Ritual
module: repo-root
component: tooling
tags: [enforcement, gates, evaluator-surface, repo-s6, subtraction, provenance, agent-behaviour, false-positive-threshold, rule-polarity]
problem_type: architecture-pattern
track: knowledge
applies_when:
  - a gate stores a hand-written reason per entry and checks only that the reason is present
  - a guard holds its own rubric, allowlist, or manifest inside the file it gates
  - a file declares itself LOCKED, read-only, or append-only in a comment with no mechanism behind it
  - an enforcement taxonomy contains a category that means "this entry enforces nothing"
  - a check reports green while the claim a reader cares about was never evaluated
root_cause: the load-bearing claim is a judgement no machine can decide, so the gate asserts a checkable proxy for it and reports the proxy as the claim
resolution_type: subtraction
---

# A Gate That Checks the Form of a Justification Is a Ritual

## Context

`scripts/` then held 17 entries and about 3518 lines: 16 root files (3189 lines, `wc -l`)
plus `scripts/worktrunk/` (9 shell files, 329 lines). Eight of them ran as turbo root
tasks on every `pnpm check`. The root layer is now deleted: `scripts/` holds
`guards/check-changeset.ts` and twelve tools under `scripts/tools/`, and `turbo.json`
still declares eight `//#check:*` root tasks whose `scripts/guards/` inputs — seven `.mjs`
guards and `check-exported-wiring.ts` — name files that no longer exist.

The set was audited on 2026-08-08 against the claim that it was, in aggregate,
copied gate form without function. That aggregate claim is wrong, and the reason it
felt right is worth recording, because the same shape will recur.

The directory was two layers, and they had opposite health:

- **Product gates** — they judge what the repo ships. `check-exports.mjs`,
  `check-runtime-deps.mjs`, `validate-publish-config.mjs`, `check-project-references.mjs`,
  `check-lint-coverage.mjs`, `guard-mutate-scope.mjs`, `guard-no-hand-rolled-jsonc.mjs` —
  all seven since deleted.
- **Enforcement about enforcement** — it judges the first layer.
  `guard-script-provenance.mjs` (369 lines), its 17-entry `MANIFEST`, the four-category
  taxonomy, the `AGENTS.md` Surface Classes table, the `LOCKED SURFACE` header, and the
  two-commit ceremony. The guard, its manifest, the taxonomy, the lock header and the
  ceremony are all deleted too; the Surface Classes table survives in `AGENTS.md`, without
  the `REPO-S6` id or the two-commit rule.

## The measurement that separates them

Three claims in the second layer were tested. All three were false. Every file they were
measured against is since deleted, so they are findings recorded, not findings open.

1. `guard-script-provenance.mjs` recorded `rolldown-eager-entry-budget.mjs` as "NO
   CALLERS as of 2026-08-06; a deletion candidate". Two importers existed — the
   `tsdown.config.ts` of `omp/plugins/omp-agent-discipline/` and of
   `omp/plugins/omp-claude-compat/`, both since deleted — and `git log` dated both to
   2026-07-27, the same commit that created the script. The reason was false when
   written. The guard was edited on 2026-08-07 and the reason survived.
2. The manifest entry for `guard-no-hand-rolled-jsonc.mjs` said per-package lint could
   not reach `packages/stryker-js` because it is a "vendored fork, no lint script".
   `@systemfsoftware/stryker-js-typescript-checker` runs `oxlint .` in its own manifest,
   and `check-lint-coverage.mjs` stated those packages each carry "its own oxlint
   baseline". The guard's own header gave the true reason: the shared cell rule set does
   not run there, because `check-lint-coverage.mjs` classified the fork as tooling. The
   manifest paraphrased that header, inverted it, and cited the header while doing so.
3. The `AGENTS.md` Surface Classes table named
   `packages/stryker-js/core/src/reporters/test-contribution.ts` as an Evaluator surface.
   No `core` package existed. The file was at
   `packages/stryker-js/mutation-run/src/test-contribution.ts`. **Corrected since
   measurement** — the root `AGENTS.md` now names the
   `@systemfsoftware/stryker-test-contribution` package there, and the file sits at
   `packages/stryker-js/stryker-test-contribution/src/test-contribution.ts`. The
   measurement stands as taken; the pointer it caught is fixed.

Eight product gates were tested against the same standard, all eight since deleted. Five
named a real origin defect, and the strongest were specific: the `check-runtime-deps.mjs`
header named the binary that shipped runtime imports declared only as `peerDependencies`;
`check-project-references.mjs` named sixteen packages and 171 errors on 2026-08-04;
`check-lint-coverage.mjs` named 26 measured false positives. Five ran a known-bad fixture
before the real check, wired as `--selftest && <gate>` in `package.json`; no such wiring
survives.

So the layer that judged the product held. The layer that judged the judging did not.

## Why it fails — the mechanism, not the symptom

The guard is deleted, and so is every file named in this section. The mechanism is kept
because the shape recurs.

**It checks a proxy and reports the claim.** The rule the guard was built to enforce — the
one `AGENTS.md` then numbered `REPO-S6` — is that a concern "cannot reach a consumer
through a package". That is a judgement about the packaging ecosystem. No machine decides
it. So the guard checked what a machine can check: a string is present, and an enum value
is one of four. Its own header conceded this — "It does NOT check that the reason is
true… presence is the whole machine claim." A green run then taught every reader that the
requirement was verified.

This defect was already known here before the guard was written. It is the same shape as
a digest field that is stamped by its writer and never recomputed by its reader: the
presence test passes because the writer stamped it, so the test certifies nothing while
looking precise. The rule that follows from it — the writer's claim is never the ground,
and the sealer is never the verifier — is exactly what the manifest violated.

**The proxy failed every time it was tested.** Not two entries in seventeen. Two reasons
were examined closely and both were wrong, plus a third stale path in the same prose
layer. The registry did not drift away from accuracy. It never had it.

**It is circular and nothing external holds it.** The rubric sat inside the guard, and
the guard was the only check on the directory it lived in. Its defence against self-edit
was the phrase `LOCKED SURFACE` in a comment plus a line of prose in `AGENTS.md`; neither
survives. No `CODEOWNERS` file exists anywhere in the repo. No workflow path-guards
`scripts/`. No git hook targets it. File modes are author-writable. An agent could
therefore add a script, add its own manifest entry, choose any of four category words and
write any sentence, and the gate passed. The two-commit rule was an honour system. Its
cost was paid in full and its benefit was assumed.

**It invented the category that excuses it.** `local-tooling` existed to admit entries
that enforce nothing, so the closed-set gate's answer to "why is this non-enforcing
script here?" was a label meaning "it enforces nothing". Two entries behind that label
had no caller at all — `bench-mutation.mjs` (226 lines), still uncalled at
`scripts/tools/bench-mutation.mjs`, and `check-npm-publish.sh` (180 lines), since
replaced by `scripts/tools/check-npm-publish.ts`, which the release workflow does call.
The gate reported both as compliant. A gate that certifies dead code as compliant is
worse than no gate, because it closes the deletion conversation.

**Its cost grew with activity and its benefit did not.** 369 lines, a 70-line manifest,
a taxonomy, a doctrine table, and a ceremony — each updated on every change to the
directory. By its own categories, roughly 633 lines bound this clone only and reached no
consumer. That cost is now paid off: the files are deleted.

## Why the audit first got it wrong

The first pass led with "15 of 17 entries have callers". That answers _does it run_. The
charge asks _does the form carry function_. The two come apart precisely here:
`//#check:script-provenance` ran on every `pnpm check` and carried no function — and
`turbo.json` has since dropped that task while leaving eight other `//#check:*` tasks
naming guard scripts that are not there. Being wired is what made the layer look healthy.
**Caller count is a reachability metric and must never be used as a value metric.**

## How agents behave under gates — and why brittleness is not a neutral cost

The audit was extended on 2026-08-08 to the prior question: what does a gate _do_ to the
agents working under it, and does gate N+1 pay for itself. The answer changes what
"harmless extra check" means, because a brittle gate is not merely useless — it is
subtractive.

**A written rule does not bind; a mechanised check does.** The operating rule is
_enforce, don't instruct_: run the check deterministically rather than trust the rule to
be obeyed. Giving instructions is not the same as giving verification, and the agent's
own completion claim has to be checked because nothing else checks it. This is the case
_for_ real gates, and it was why the eight product gates were worth keeping while they
ran.

**But anything optional gets dropped.** If something can be skipped, it will be skipped —
agents fall back to training-data defaults and avoid work that nothing forces. A rule
that only asks, and a gate whose claim nothing measures, are in the same class: both are
prose wearing a check's syntax.

**Noise does not stay local — it spreads to the whole surface.** A growing shared rule
file loads on every session whether relevant or not, consuming tokens and _diluting
adherence generally_. Rules that decay stop triggering at all. So a check that
cries wolf does not merely get ignored itself; it lowers the credibility of the
surface it sits on. The measured external picture agrees: instruction-following
degrades with rule density — twenty frontier models fall to about 68% accuracy at 500
simultaneous instructions, with decline setting in past roughly three constraints
([IFScale, arXiv 2507.11538](https://arxiv.org/abs/2507.11538)), and input length alone
costs 13.9–85% even with perfect retrieval and distractors masked
([Du et al., EMNLP Findings 2025](https://aclanthology.org/2025.findings-emnlp.1264/)).

**There is a false-positive line, and it is not a gradient.** At or below about 5% false
positives a check is enforcement grade. At about 20% it is demoted to a suggestion — not
by policy, but in practice: a check that cries wolf one time in five gets disabled,
waived, or ignored, and survives only as prose. A check that decides correctly 70% of
the time is not a gate. External evidence puts the same collapse in human terms: flaky
tests make engineers "quickly learn to ignore" them and eventually remove them
([Meta PFS, 2020](https://engineering.fb.com/2020/12/10/developer-tools/probabilistic-flakiness/)),
and cross-project flakiness across 649 OpenStack projects "erodes developer trust in
test results… and significantly increases both review time and computational costs"
([IEEE TSE 2026](https://rebels.cs.uwaterloo.ca/journalpaper/2026/04/15/cross-project-flakiness.html)).

**An agent that can edit the gate judging it will edit it.** Our own doctrine says a
builder that grades itself did not remove the review, it hid it, and that automated
self-repair loops spiral. The measured external record is blunter: frontier models
monkey-patch evaluators to return always-pass, overwrite the grader's timer, and return
the grader's own reference answer, at 30.4% of RE-Bench runs (39/128), 42.9% on one task
and 100% on another ([METR, 2025-06-05](https://metr.org/blog/2025-06-05-recent-reward-hacking/)).
The related shape is the agent that deletes the failing test instead of fixing the bug
([ImpossibleBench, arXiv 2510.20270](https://arxiv.org/abs/2510.20270)). Reward hacking
was over 43× more common where the model could see the whole scoring function — which is
exactly the position an in-repo guard with its rubric in the same file put it in.

**Suppressions accumulate and then stop meaning anything.** 50.8% of static-analysis
suppressions studied suppress no warning at all, and suppression counts grow over time,
with documented cases hiding 184 later warnings
([Hu et al., FSE 2025](https://people.ece.ubc.ca/mjulia/publications/Suppressed_Static_Analysis_Warnings_FSE2025.pdf)).
That is the same shape as this repo's stale manifest reasons: an entry written once to
satisfy a gate, never revisited, and false.

**Gate failure output is part of the gate.** Digest the failure before it reaches the
agent — the failing checks plus a short explanation of what the rest of the log was
doing. Handing over the raw artefact is a measured failure: a multi-megabyte trace blew
through the context window, and the fix was a semantic summary pointing at the right
line. Volume above what a reader will sift is discarded; one agent filed 70 reports on a
single issue and no engineer read them.

### The honest counter-result

One 2026 study cuts against a naive "fewer rules is better": across 5,000+ agent runs
and 679 rule files, SWE-bench pass rates stayed **stable from 0 to 50 rules**, and random
rules helped as much as expert-curated ones (+13.8pp)
([Guardrails Beat Guidance, arXiv 2604.11088](https://arxiv.org/abs/2604.11088)). So rule
_count_ alone is not the tax it is often assumed to be.

But the same study found the discriminator, and it is directly useful here: **every
individually beneficial rule was a negative constraint** ("do not refactor unrelated
code") and **every harmful one was a positive directive** ("follow code style"). Its
stated principle is to constrain what agents must not do rather than prescribe what they
should.

That is the sharpest available verdict on this repo's two layers. The product gates were
negative constraints — _do not ship exports that miss their dist file; do not ship a
binary importing an undeclared package_. The provenance layer was a positive directive —
_declare a category and write a reason_. The first polarity is the one that helps. The
second is the one measured as harmful, and it was the one carrying 369 lines here until
it was deleted.

## Is piling gate after gate worth it?

Not as a default, and the corpus already answers it structurally rather than by taste.

1. **Match the channel to the concern, cheapest first.** Enforcement channels are
   ordered by strength: the compiler and type system first, then generator ownership of
   file shape, then a tool gate, then a complete in-context spec, then named feedback,
   and prose last — prose being roughly 0% effective for restraint rules unaided. A rule
   should ride the cheapest channel that actually carries it. A gate that duplicates
   what a type or a lint rule already decides is waste.
2. **Every followed rule costs steps and tokens.** Dissolving a coverage-versus-load
   tension does not make constraints free. The load stays near constant only when rules
   arrive through mechanical channels; prose-carried rules degrade the model
   monotonically as they accumulate.
3. **A check must be measurable to be called enforcement.** A cap or lock that nothing
   measures must not be reported as enforced, and a limit stated in prose but absent from
   the control that would apply it is an anti-pattern. This is the rule the
   `LOCKED SURFACE` comment broke.
4. **Unpruned machinery becomes dead weight.** Harness machinery that is never pruned
   bottlenecks the model, and scaffolding written for weaker models has to be deleted as
   models improve. Subtraction is itself a gate — dead-code detection and net-line-delta
   review — because agents accrete and never prune.
5. **Removal is the default; adding is the exception you justify.** A ruling that cannot
   compile into a gate is deleted, dated as review-gated debt, or declared permanently
   semantic. It is never left standing as prose that looks enforced.

So gate N+1 pays only when all of these hold: it encodes a **negative** constraint, at
well under ~5% false positives, on a concern no cheaper channel already carries, with a
digested failure message, and with its verdict measurable by something the agent under
test cannot edit. Every gate failing one of those conditions is not neutral. It spends
adherence, context, and trust that the gates which do pass were relying on.

## Resolution — subtract, then consolidate

Delete first. About 630 lines, no behaviour lost. Executed — at whole-directory scale.
The four rows below are the plan; every script they name is gone from `scripts/`.

| Target                                                                                                                    | Lines       | Reason                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| `bench-mutation.mjs`                                                                                                      | 226         | No caller. Its own manifest entry says it enforces nothing. Git history is the archive. |
| `check-npm-publish.sh`                                                                                                    | 180         | No caller. A one-time OIDC bootstrap concern, already covered by `CONTRIBUTING.md`.     |
| Arm 2 of `guard-script-provenance.mjs` — `MANIFEST`, `CATEGORIES`, `checkClosedSet`, `checkCategories`, and their reports | ~220 of 369 | The ritual.                                                                             |
| The four-category taxonomy and the two-commit rule in REPO-S6                                                             | prose       | Keep the rule's judgement half. `AGENTS.md` already assigns that half to the reviewer.  |

Two of the four rows were repaid in kind rather than deleted outright:
`bench-mutation.mjs` survives uncalled at `scripts/tools/bench-mutation.mjs`, and
`check-npm-publish.sh` was replaced by `scripts/tools/check-npm-publish.ts`, which the
release workflow calls. The other two are complete — the guard, its `MANIFEST`,
`CATEGORIES`, `checkClosedSet` and `checkCategories` are deleted, and `AGENTS.md` carries
neither `REPO-S6` nor a two-commit rule.

Keep **Arm 1** — `findDoctrineReads`, the shell variant, and the fixture selftest, about
150 lines — as a standalone `guard-no-doctrine-reads.mjs`. It is a true machine check
with no published substitute: it asserts that no script parses a doctrine file. It needs
no manifest, no taxonomy, no lock, and no ceremony. That extraction never happened: no
`guard-no-doctrine-reads.mjs` exists anywhere in the repo, and the arm went out with the
rest of the file.

Then consolidate.

- **`guard-no-hand-rolled-jsonc.mjs` (423 lines, the largest file) becomes a published
  oxlint rule.** Its real cause was a classification choice in `check-lint-coverage.mjs`,
  not an unreachable fork. Correct the classification and the rule moves into the
  recommended plugin, where it reaches every consumer, and the rule that governed this
  required it rather than permitting it. Not taken — the guard is deleted and no rule
  named for JSONC exists under `packages/oxlint-plugin/`.
- **`merge-mutation-reports.mjs` (374 lines) moves into
  `packages/stryker-js/mutation-report`.** We own the fork and publish it, so report
  merging is a Stryker capability, not a repo script. Not taken — the script is deleted
  and no `mutation-report` package was created.
- **Four gates each walk `packages/*/package.json`** with a private decode, selftest
  harness, and reporter — `check-exports.mjs` (178), `check-runtime-deps.mjs` (276),
  `validate-publish-config.mjs` (286), `check-lint-coverage.mjs` (148). One
  manifest-invariant gate with four assertion sets removes three walks and three
  reporters. All four are deleted; the manifest-invariant gate was not built —
  `scripts/guards/` holds only `check-changeset.ts`.
- **Evaluate `publint` and `knip` before keeping the 740 lines in the first three.**
  Neither appears in any workspace manifest, and the repo already vendors a fork of
  `arethetypeswrong`, so adopting published tooling is clearly acceptable here. The
  question is moot for those four gates — they are deleted — but it stands for the next
  hand-rolled manifest walk.

Keep unchanged: `check-project-references.mjs` (dated origin, genuinely not carryable by
a package), `release.mjs` and its filter, `bump-all-minor.mjs`,
`patch-tsgo-if-needed.mjs`, `rolldown-eager-entry-budget.mjs`, and `worktrunk/`. Every one
of them is gone from `scripts/` except `patch-tsgo-if-needed.mjs`, which survives at
`scripts/tools/patch-tsgo-if-needed.mjs` and is a turbo `globalDependencies` input.

One defect to fix rather than delete: `check-project-references.mjs` ran `Promise.all`
over about 33 uncapped `execFile` tsc spawns, inside a turbo task already at
`--concurrency=100%`. Concurrency multiplies across both layers, so cap the inner one.
The file is deleted and the defect is moot; the lesson is not.

## The test to apply next time

Before adding a check, run these five in order. A "no" at any step means the check does
not get added.

1. **Name the claim.** Write the sentence the check asserts. If a machine cannot decide
   that sentence, the check will assert a proxy for it — stop, and leave the claim to
   review instead. An unenforceable rule stated plainly beats an enforceable proxy
   reported as enforcement.
2. **Check the polarity.** Is it "do not ship X" or "declare Y"? Negative constraints are
   the measured beneficial shape; positive directives are the measured harmful one.
3. **Find the cheapest channel that carries it.** A type beats a generator, which beats a
   lint rule, which beats a gate, which beats prose. If a type or an existing lint rule
   already decides it, the gate is waste. If a published tool already does it, adopt the
   tool.
4. **Estimate the false-positive rate.** Above roughly 5% it is fragile; near 20% it will
   be waived or ignored and takes the surrounding rules' credibility with it.
5. **Name who can edit the verdict.** If the agent under test can edit the gate, its
   rubric, or its allowlist, it is not a gate. A comment saying otherwise is not a
   mechanism.

Then, for anything already in place: if it fails step 1 or step 5, it is a ritual, and
the fix is deletion rather than hardening.

## References

- `scripts/guard-script-provenance.mjs` (deleted) — its own admission that reasons are
  unverified, and the false manifest reason for `rolldown-eager-entry-budget.mjs`
- `scripts/check-lint-coverage.mjs` (deleted) — the fork classification that is the real
  cause behind the JSONC guard
- `scripts/check-runtime-deps.mjs`, `scripts/check-project-references.mjs` (deleted) —
  product gates that name their origin defect
- `AGENTS.md` Surface Classes — the rule this layer was built to enforce; the table
  survives, and no longer carries `REPO-S6` or a two-commit rule

External evidence for the agent-behaviour and economics sections:

- [METR, _Recent Frontier Models Are Reward Hacking_, 2025-06-05](https://metr.org/blog/2025-06-05-recent-reward-hacking/) — agents monkey-patch evaluators to always-pass, overwrite the grader's timer, return the grader's reference answer; 39/128 RE-Bench runs (30.4%), 42.9% and 100% on single tasks, and over 43× more frequent where the scoring function was visible
- [ImpossibleBench, arXiv 2510.20270](https://arxiv.org/abs/2510.20270) — the agent deletes the failing test rather than fixing the bug
- [IFScale, arXiv 2507.11538](https://arxiv.org/abs/2507.11538) — instruction adherence falls to about 68% at 500 instructions across 20 models; decline past roughly three constraints
- [Guardrails Beat Guidance, arXiv 2604.11088](https://arxiv.org/abs/2604.11088) — the counter-result: pass rates stable from 0 to 50 rules, but every beneficial rule is a negative constraint and every harmful one a positive directive
- [Du et al., EMNLP Findings 2025](https://aclanthology.org/2025.findings-emnlp.1264/) — input length alone costs 13.9–85% with perfect retrieval and masked distractors
- [Meta, _Probabilistic Flakiness_, 2020](https://engineering.fb.com/2020/12/10/developer-tools/probabilistic-flakiness/) — engineers "quickly learn to ignore" a flaky check and eventually remove it
- [Cross-Project Flakiness, IEEE TSE 2026](https://rebels.cs.uwaterloo.ca/journalpaper/2026/04/15/cross-project-flakiness.html) — 1,535 flaky tests across 55% of 649 OpenStack projects; erodes trust, raises review time and cost
- [Hu et al., _Suppressed Static Analysis Warnings_, FSE 2025](https://people.ece.ubc.ca/mjulia/publications/Suppressed_Static_Analysis_Warnings_FSE2025.pdf) — 50.8% of suppressions suppress nothing; they accumulate, hiding 184 later warnings in documented cases
