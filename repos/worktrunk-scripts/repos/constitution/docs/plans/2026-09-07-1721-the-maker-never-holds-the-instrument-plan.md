# Plan — The maker never holds the instrument (corrects the 26a527c enforcement reasoning)

```yaml
plan:
  id: unified-ce-unified-plan/v1
  status: implementation-ready
  created: 2026-09-07-1721
  delivery: one branch (doctrine/maker-never-holds-the-instrument), one PR, own commits
```

## Problem

Commit `26a527c` ("restore the single resident document") merged the corpus
correctly but reasoned about enforcement incorrectly, three ways:

1. **It minted enforcement law in the maker's voice.** CONST-E6 ("make any
   principle that can fail a command fail that command") instructs the agent
   doing the work to construct the machinery that judges that work. The
   settled doctrine (wiki canon `reviewer-agent-separation`, ten sources) is
   the opposite: the maker cannot be the sole checker; the check must be
   structurally separated. The reward-tampering literature measures the
   exploit class (arXiv:2406.10162, arXiv:2609.00069).
2. **It deleted the refusal channel on a conflation.** The TTSR plugin was
   retired because "an interrupt can only inject text the agent already
   has." An interrupt that re-injects resident text is redundant; an
   interrupt that *refuses* the violating write re-fires at the decision
   point — after compaction, at turn 40 — which residency cannot do
   (wiki `compelled-retrieval-gate-limits`, `pin-or-gate` measurements).
3. **It flipped the corpus gate inside the same commit as the corpus it
   gates** ("no legal intermediate commit exists") — the expedience plea the
   evaluator-boundary doctrine exists to refuse.

The residency merge itself stands: the maker's law is resident, single, and
always-on. What changes is who enforcement doctrine is for and who may
touch the instruments.

## Doctrine

The constitution is the maker's law — obligations written to the agent doing
the work. Instrument doctrine (how gates are designed, keyed, enrolled, and
changed) is not maker law: it moves to `ENFORCEMENT.md`, read by the channel
that owns the instruments and never loaded into the maker's context. The
maker's side of the boundary is one rule, action-keyed so no role inference
is needed: whatever your change must pass is read-only to you; you cannot
enumerate your graders, so the ban attaches to the judgment surface class,
not to whether you believe it grades this task.

## Requirements

- **R1 — Retire CONST-E6** (Prefer the Gate) and **CONST-E8** (The Evaluator
  Is Not the Agent's to Edit): both permit the maker to author or edit the
  instrument (E6 by instruction, E8 by its own-commit exception). Ids vacate
  forever; citations to them must resolve nowhere in the corpus.
- **R2 — Mint CONST-E9** (Never Edit What Grades Your Work) in the
  Application section, action-keyed: the ban attaches to the surface class
  (lint configs, thresholds, baselines, CI checks, rubrics, validators), and
  a needed gate is a proposal to the owner and a wait, never a build by the
  graded.
- **R3 — Repoint CONST-G5**: the gate stays the final word; disagreements
  escalate to the channel that owns the instrument, never resolved by the
  maker editing the gate.
- **R4 — Vacate CONST-E5** from the maker corpus; its recomputation doctrine
  continues in `ENFORCEMENT.md` for the instrument owner.
- **R5 — Write `ENFORCEMENT.md`**: the ladder (type > command > refusal at
  the decision point > resident prose as the floor), gate-design law,
  instrument-change discipline (land alone, red before green, other hands),
  enrollment law (clean tree, no baselines, warn is dominated, carriage
  proven at the published surface), and the historical correction to the
  2026-09-01 rationale.
- **R6 — Reconcile prose**: `CONCEPTS.md` residency entry, `AGENTS.md` corpus
  section and E-family row, `README.md` counts and quick start,
  `scripts/validate-constitution.ts` docstring, and annotations on the two
  solutions docs that cite the retired ids or the superseded rationale.
- **R7 — No new tests.** The admission gate ran (skill://choose-test-layer
  step 0): this amendment proposes none; verification is the repo's
  pre-existing corpus gate, which has real non-test consumers (CI and the
  pre-commit hook).

## Verification Contract

| # | Check | Command | Expected |
|---|---|---|---|
| 1 | corpus gate | `deno task test` | `valid: 38 rules across 6 yaml blocks in 1 files, 9 families`, exit 0 |
| 2 | reassignment | `deno task test --against 26a527c` | E5/E6/E8 reported vacated, E9 minted, no reassignment errors |
| 3 | citation sweep | `grep -nE 'CONST-E[568]' CONSTITUTION.md` | zero lines |
| 4 | lint | `deno lint` | clean |
| 5 | clean tree | `git status --porcelain` | empty after commits |

## Key technical decisions

```yaml
- id: KTD1
  decision: Split by audience, not by presence.
  why: The pre-26a527c resident/retrieved split failed on presence; that
    failure is dead and stays dead. The instrument doctrine's reader is the
    instrument owner at build time — a moment where retrieval is correct.
    (session-settled: user-directed — "the constitution should be for the
    maker only".)
- id: KTD2
  decision: E9 is action-keyed ("never edit what grades your work"), not
    role-keyed.
  why: The document is always-on for every reader — makers, reviewers,
    advisors — and the reader cannot be relied on to know its role or to
    enumerate its graders. The act is recognizable in the moment; the role
    is not. (session-settled: user-directed.)
- id: KTD3
  decision: The validator's docstring is repointed, its behavior unchanged.
  why: The corpus gate is the instrument that grades this amendment; E9
    forbids editing it in service of this work. The docstring's retired-id
    citation is prose repair, not behavior change.
- id: KTD4
  decision: No gate change accompanies the corpus change.
  why: 26a527c's same-commit gate flip is the violation being corrected;
    this amendment ships with the gate's behavior untouched.
```

## Research record

- Wiki (taste, canon band): `reviewer-agent-separation` (the maker cannot be
  the sole checker; the check must be structurally separated),
  `form-checking-gate-is-a-ritual` (the governed party writing the checked
  field has no independent witness), `compelled-retrieval-gate-limits`
  (presence is not conformance), `restraint-gates-must-be-emission-gated`
  (a reminder is not a refusal).
- Web (substance): arXiv:2406.10162 (reward tampering), arXiv:2609.00069
  (harness tampering in self-improving agents), arXiv:2609.02246
  (deterministic guardrails for self-improving agents).
- Destructive review: three assumptions surfaced (separation doctrine's
  warrant band; residency's narrowed survival; the non-resident doctrine
  file's audience-moment distinction); lens: band vs weakest atom plus claim
  vs bytes; all three survive, the second narrowed.
