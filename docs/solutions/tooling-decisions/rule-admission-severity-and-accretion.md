---
title: Rule Admission — Why Warn Is Dominated, Why Rule Count Is the Wrong Axis, and What Stops Accretion
module: repo-root
component: packages/oxlint-config, scripts/
tags: [enforcement, lint, oxlint, severity, false-positive-budget, accretion, subtraction, harness]
problem_type: architecture-pattern
track: knowledge
applies_when:
  symptoms:
    - A new lint rule is about to land at `warn` severity because its fallout is too large to fix now
    - Someone asks whether the repo has "too many" lint rules
    - An agent proposes adding another validation script to `scripts/`
    - A harness audit's only output is additions
  root_cause: severity, rule count, and gate count are each treated as one axis when each is two; and the instrument that scores a harness rewards addition while the doctrine it implements demands subtraction
  resolution_type: admission-policy
---

# Rule Admission — Severity, Count, and Accretion

Follow-on from `provenance-ritual-gates.md`, which established that a gate checking the
_form_ of a justification is a ritual. This doc answers the three questions that follow:
what severity a rule should land at, whether a rule population can be too large, and what
actually stops an agent from adding another worthless script.

## Measured baseline for this repo

Taken this session, not from memory:

| Fact                          | Value                                                     | How                                               |
| ----------------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| Rules in the effective config | 128                                                       | `oxlint --print-config`, `packages/oxlint-config` |
| At `deny` (error)             | 125                                                       | same                                              |
| At `allow` (off)              | 3                                                         | same                                              |
| At `warn`                     | **0**                                                     | same                                              |
| Category enabled              | `correctness: deny`                                       | same                                              |
| Agent-mode lint flags         | `--format=unix --quiet` when `AGENT` is set               | every package's `lint` script                     |
| `--quiet` semantics           | "Disable reporting on warnings, only errors are reported" | `oxlint --help`                                   |
| Product gates in `scripts/`   | 8                                                         | prior audit                                       |

Two of these decide most of what follows. The repo already runs **128 rules with zero
warn** — 2.5× the rule count often quoted as a ceiling — and it works. And under `AGENT`,
oxlint is invoked with `--quiet`, so a warn-severity rule in this repo is not weak
enforcement. **It produces no output at all when an agent runs lint.**

## Question 1 — Is `warn` useless? Never add warn?

**Substantially yes, but for a stronger reason than "agents skim warnings."** Warn is not
merely weak. It is _dominated_ — for every goal someone reaches for warn to achieve,
another mechanism achieves it strictly better.

### Warn is invisible here, not just weak

The general claim is that warnings get ignored. The local claim is sharper and
machine-checked: `--quiet` is passed whenever `AGENT` is set, and `--quiet` disables
warning reporting entirely. So a rule at warn is not a soft signal to an agent in this
repo. It is silence. Anyone landing a warn rule here has written a config entry with no
runtime effect on the primary author of this codebase.

### The three goals people want from warn, and what beats each

**Goal: "I want to know how big the problem is before I commit to the rule."**
This is legitimate — you should not set a severity before measuring the population. But it
does not require committing a severity. `oxlint -D <rule>` (or `-W`) takes the rule on the
command line and gives the census in one throwaway invocation. Measurement is a run, not
a config entry. Committing `warn` to measure is how a census becomes permanent.

**Goal: "The fallout is 400 files. I cannot fix that in one change, so I need it
non-blocking for now."**
Here warn is not just dominated, it is the worst of the three options:

| Option                                                 | Blocks new violations | Catalogues old ones | Shrinks monotonically |
| ------------------------------------------------------ | --------------------- | ------------------- | --------------------- |
| `error` + fix all now                                  | yes                   | n/a                 | n/a                   |
| `error` + explicit dated baseline of current violators | **yes**               | **yes**             | **yes**               |
| `warn`                                                 | **no**                | no                  | no                    |

`error` plus a baseline is what you actually wanted: new code is blocked today, the 400
existing sites are enumerated as debt with a date, and the list can only get shorter
because nothing new can enter it. Warn blocks nothing, so the population grows while you
are "migrating." This repo already runs the dominant pattern — `check-lint-coverage.mjs`
carries an exemption map where every entry must state why, and an entry without a reason
is treated as a bug. (Caveat, in fairness: the _reason text_ in that map is unverified
prose, the same weakness as the provenance manifest. Its saving grace is that the entry's
_effect_ is checkable — the package either extends the config or it does not.)

**Goal: "This check is a heuristic. It is genuinely advisory."**
Then it should not ship as a lint rule. Above roughly 20% false positives a check is
demoted to a suggestion in practice, and a rule that is right 70% of the time is not a
gate. An honest advisory belongs in review, or in the editor layer where a human author
sees it with the cursor on the line — and the editor is the one surviving legitimate home
for warn, because there the warning is seen at the highest-signal moment. But that is a
_human_ channel. An agent has no editor. So configure it in the editor layer, not in the
committed config CI reads.

### The rule

- **Never commit `warn` as a resting state.** It has no effect on an agent here.
- **To measure:** run the rule at deny on the CLI. Do not commit the severity.
- **To migrate:** `error` plus an explicit, dated baseline. It dominates warn on all three axes.
- **Genuinely advisory:** not a lint rule. Review, or editor-only.
- **Declined on purpose:** use `off` with the rule named. That records the decision, which is worth something. `warn` records nothing and implies a promotion that never comes.

One nuance worth keeping: oxlint offers `--deny-warnings` and `--max-warnings=N`. Their
existence is the argument's own conclusion — if you need a warning to block, you have
just said it is an error, so write `error`.

## Question 2 — Can a rule population be "too many"? Does the 50-rule finding apply?

**The 50-rule finding does not transfer to lint rules at all, and this repo is the
counter-example.** But rule populations absolutely can be too large, on two axes that
nobody states, and both are arithmetic rather than taste.

### Why the instruction-count studies do not apply

The stable-to-50 result concerns **natural-language rules in a rule file the model must
read, hold in context, and choose to obey**. Likewise the decay to about 68% adherence at
500 simultaneous instructions. These measure _instructions competing for attention inside
the context window_.

A lint rule is not an instruction to the model. **It costs zero context tokens.** It is a
function applied to the model's output after the fact. This repo carries 128 of them and
the agent's window contains none. So the instruction-count ceiling is the wrong
instrument, and the empirical proof is local: 128 rules, 125 at deny, no degradation.

### Axis 1 — aggregate false-positive probability (the real ceiling)

The published per-rule threshold is that ≤5% false positives is enforcement grade. That
threshold is per rule, and **it does not compose.** For N rules each falsely firing with
probability p, the chance a clean run is falsely blocked is `1 - (1-p)^N`:

|   N |     p = 5% | p = 1% | p = 0.1% |
| --: | ---------: | -----: | -------: |
|   1 |      5.00% |  1.00% |    0.10% |
|   8 |     33.66% |  7.73% |    0.80% |
|  14 | **51.23%** | 13.13% |    1.39% |
|  20 |     64.15% | 18.21% |    1.98% |
|  50 |     92.31% | 39.50% |    4.88% |
| 128 |     99.86% | 72.37% |   12.02% |

Read the consequences:

- **Fourteen rules at the "acceptable" 5% each falsely block more than half of all clean runs.** Each rule passes the published bar; the suite is unusable.
- Inverting it, to hold a **5% suite-level** false-positive budget the per-rule budget must be `1-(0.95)^(1/N)`: 0.64% at N=8, 0.26% at N=20, 0.10% at N=50, and **0.04% — one bad fire in 2,496 runs — at N=128.**
- So **the Nth rule tightens the requirement on every existing rule.** This is why 128 preset `correctness` rules are safe and twenty bespoke heuristics are not: preset correctness rules are near-deterministic, with p far below 0.1%. Affordability is governed by `N × p`, never by `N`.
- Applied locally: the **8 product gates**, if each sat at the nominally acceptable 5%, would together cry wolf on **one clean run in three**. That is the budget those eight gates are spending, and it is the reason a ninth gate is not free.

Honest caveat: independence is an upper bound on the damage. Correlated false positives —
one rule misfiring repeatedly on one pattern — are cheaper, because a single diagnosis
clears them all. Independent misfires across unrelated rules are the expensive shape.

### Axis 2 — expected diagnostic tokens per run

The second cost is what reaches the window _when rules fire_. A rule that never fires is
nearly free regardless of how many siblings it has. A rule that fires on every file is
expensive whatever its severity. So the metric to watch is **expected diagnostic volume
per run**, not rule count. This is also why volume above what a reader will sift is
discarded outright — one agent filing 70 reports on a single issue was read by nobody.

A third factor multiplies both: **autofixability.** A rule with a reliable autofix costs
close to nothing when it fires, because no iteration and no judgement are needed. A
non-autofixable rule costs an agent turn per firing. Prefer autofixable rules; they are
the reason a large `correctness` set is cheap.

### The answer

You cannot have too many lint rules in the sense the instruction studies measure. You can
have too many in exactly two senses: when `N × p` pushes suite-level false positives past
about 5%, and when expected diagnostic volume per run exceeds what will be read. Judge a
proposed rule on its own false-positive rate and firing frequency. Never on the count.

## Question 3 — Why do agents keep adding scripts, and what changes?

### The cause is not that the doctrine advises accretion

Worth stating plainly, because it changes the fix: the harness-authoring doctrine is
already emphatically subtraction-first. It says the standing instruction surface is a
liability, that the default move is removal, that an audit whose only output is additions
has skipped its first step, and that coverage theater is the common failure. An agent that
followed it literally would not accrete.

Accretion happens anyway, through three mechanisms that are structural rather than textual.

**Mechanism 1 — the escalation order is right and the reward gradient is backwards.**
The prescribed order is: delete it, else mechanise it, else trigger-load it, else make the
read situational, else write prose. But _delete_ requires proving a rule unnecessary — it
is judgement-heavy, feels risky, and **produces no artifact**. _Mechanise_ produces a
visible file that can be pointed at. An agent optimising for demonstrable output will pick
mechanise every time. Doctrine loses to gradient. Note the polarity too: "delete it" is a
negative constraint on the agent's own output, and "build a gate" is a positive directive —
the measured-harmful shape doing the measured-easier thing.

**Mechanism 2 — the earn test is scoped to instruction files and not to gates.**
The doctrine requires a _leaf_ to be earned: a coverage gap with no named agent mistake is
not a defect. That test is exactly right, and it is applied only to instruction files.
Nothing anywhere requires a **gate** to name the mistake it prevents. Meanwhile the same
doctrine states unconditionally that a rule a command can fail on _must_ be that command.
An agent reading both concludes, correctly, that leaves need justification and gates are
simply good. That asymmetry is the cargo-cult vector. It is one missing sentence.

**Mechanism 3 — the scoring instrument rewards addition.**
An audit that reports a subsystem or composite score hands the agent a number that
improves when files are added. The doctrine says subtract; the instrument says add. Where a
stated rule and a measured incentive disagree, the incentive wins. This is the same defect
as the provenance guard, one level up: the thing being measured is not the thing being
claimed.

### What I would change in the harness doctrine

Five changes, each a mechanism rather than more prose:

1. **Extend the earn test from leaves to gates — one sentence.** A gate is earned, never assigned: it must name the defect it caught, dated, or the near-miss it would have caught. Highest value of the five, and it costs a line.
2. **Make the primary audit output a net line delta, not a score.** A refactor or audit that adds net lines must state why and name what it deleted. This gives subtraction the artifact it currently lacks, which is the only way it competes with mechanising.
3. **Add the polarity rule.** A gate must express a negative constraint ("do not ship X"). A gate demanding a declaration ("write a reason", "add a manifest entry") is a positive directive — the measured-harmful shape, and the exact form the provenance ritual took.
4. **Generalise evaluator isolation beyond autonomous loops.** Any gate the authoring agent can edit is advisory, not enforcement. Reward hacking was over 43× more frequent where the model could see the scoring function; an in-repo guard holding its own rubric is that configuration.
5. **State the aggregate false-positive budget.** Per-rule tolerance must be `1-(1-P)^(1/N)` for suite budget `P`. This makes "too many gates" arithmetic and forces the Nth gate to justify tightening all the others.

### What I would change in this repo

Replace one unverifiable property with three checkable ones. The goal — directory hygiene
in `scripts/` — is legitimate; the manifest was the wrong instrument because it checks a
writer's claim.

1. **Reachability replaces the manifest.** Require every script to be reachable from a named entry point (`package.json`, `turbo.json`, a workflow, a hook config). This is a fact about the repo, not a claim by an author, so a machine genuinely decides it. It is negative in polarity — _do not add an unreachable script_. It would have caught both dead scripts, and it would have correctly passed `rolldown-eager-entry-budget.mjs`, which the manifest got wrong.
2. **Mandatory known-bad fixture.** Every gate must exit non-zero on a fixture that violates it. The repo already invented this — 5 of 8 gates carry `--selftest` — so the change is to make it universal, not to design anything. A gate that cannot fail on purpose is not known to work.
3. **Report the enforcement-surface line delta per change.** A number, reported, not a block. It makes accretion visible at review time, which is where the judgement belongs.

The remaining half — "does this concern belong in a published package" — stays with review,
stated plainly and unenforced, because no machine decides it. `AGENTS.md` already assigns
that half to the reviewer. The error was building a gate over the half that was already
correctly assigned to a human.

## Where the original framing needed correcting

- **"Warn is useless"** — right, and for a stronger reason than stated: it is dominated by `error`-plus-baseline on every axis, and in this repo `--quiet` makes it literally invisible. The absolute "never add warn" overshoots only on the editor-layer case, which is a human channel and should not live in the committed config anyway.
- **"Too many rules if the instruction count is 50"** — the inference does not hold. Lint rules cost no context tokens; 128 run here at deny. The real ceilings are `N × p` and diagnostic volume.
- **"Cargo-culted advice in the harness doctrine"** — right about the effect, wrong about the cause. The doctrine argues _against_ accretion. What drives accretion is that its earn test excludes gates, its escalation order's first step produces no artifact, and its scoring instrument improves when you add. Fix the instrument, not the prose.

## References

- `docs/solutions/architecture-patterns/provenance-ritual-gates.md` — the audit this follows from
- `packages/oxlint-config/src/oxlint-config.base.ts` — 125 deny, 3 allow, zero warn
- `packages/oxlint-config/package.json:19` — `--quiet` under `AGENT`
- `scripts/check-lint-coverage.mjs` — the error-plus-baseline pattern already in use
- [Guardrails Beat Guidance, arXiv 2604.11088](https://arxiv.org/abs/2604.11088) — rule polarity: negative constraints help, positive directives harm; pass rates flat 0–50 rules
- [IFScale, arXiv 2507.11538](https://arxiv.org/abs/2507.11538) — instruction adherence versus instruction count, the result that does _not_ transfer to lint
- [METR, Recent Frontier Models Are Reward Hacking](https://metr.org/blog/2025-06-05-recent-reward-hacking/) — evaluator editing; 43× more frequent with a visible scoring function
- [Meta, Probabilistic Flakiness](https://engineering.fb.com/2020/12/10/developer-tools/probabilistic-flakiness/) — engineers learn to ignore, then remove, a flaky check
