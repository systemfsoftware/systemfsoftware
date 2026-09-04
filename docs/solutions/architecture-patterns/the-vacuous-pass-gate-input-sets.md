---
title: A gate can go green because it stopped looking
date: 2026-08-18
last_updated: 2026-09-01
category: architecture-patterns
module: constitution corpus validator
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - A gate's input set is named in the gate rather than derived from the tree
  - A single-artifact check is widened to cover several artifacts
  - A merge-blocking check reports a count it computed itself
  - Restructuring a corpus the repo's own pre-commit gate certifies
  - Authoring cross-revision fixtures after narrowing the gate's input set
tags: [gate-design, vacuous-pass, verification, fail-closed, known-bad-fixture, corpus-surgery, atomic-commit]
---

# A gate can go green because it stopped looking

## Context

The constitution's format gate validated one markdown file whose path was a module-level
constant. The law was then split across two files. The gate's logic was untouched and
entirely correct — it parsed, it compared declared rule ids against parsed rule ids, it
found no discrepancy, it exited 0. It was reporting on a third of the rules.

Nothing in the output distinguished that from a healthy corpus. The same run over the
whole corpus and the run over a third of it print the same shape, differing only in a
number nobody had a baseline for.

Two further shapes of the same defect surfaced during review of the fix, both after the
input set had been widened to a tuple of paths:

- A path present in the tuple but **absent from disk** was caught by a hard failure. A
  path present, parsing cleanly, and declaring **zero rules** was not — emptying the
  resident half to a preamble plus two `placeholder: true` blocks printed a valid line
  with a smaller count and exited 0.
- The cross-revision arm tolerated a path that did not exist at the older revision,
  because a newly created file legitimately has nothing to compare. That tolerance also
  swallowed a path **renamed** in the same commit that re-scoped a rule: the older
  revision had no such path, so the rule's retitle went uncompared and the run reported
- A fourth shape surfaced when the surgery ran in the other direction — merging the two
  files back into one while the gate's input tuple narrowed to a single path. There was
  no legal intermediate commit. Landing the gate first left the live citation from the
  resident file to an articles-resident rule dangling; landing the corpus first deleted a
  path the gate still named, hitting the missing-input hard failure. The pre-commit hook
  runs the gate at commit time, so both orderings are unlandable, not merely ugly. The
  merge, the input-set change, the permission scopes, and the deletion had to arrive as
  one atomic commit for the hook to grade a coherent end state.

## Guidance

**Assert the corpus, not only the contents.** A check over a subset is
indistinguishable from a check over the whole unless the gate says which inputs it
measured. Three rules follow.

1. **A missing input is a hard failure, never a smaller pass.** Absence of an expected
   input is a defect in the gate's own configuration, and it must exit non-zero rather
   than validate what remains.

2. **Presence is not contribution.** An input that resolves, parses, and yields nothing
   scores exactly like one that yields its half. Require every declared input to
   contribute at least one unit of the thing being validated. This is a recomputation
   from the bytes — *did this file produce a rule?* — not a number the author supplies.
   This rule is the prescription, not a description of the gate that prompted it: that
   gate enforced the rule only through its whole-corpus emptiness check, and a single
   path parsing to nothing while another contributed would still have passed. A gate
   with several named inputs needs the per-path check written in, or shape 2 stays open.

3. **What cannot be failed must be reported.** Some gaps are legal and failing them
   would fire on correct work: a deliberate deletion, a genuinely new input with no
   history. Name them on the success line — which inputs were not compared, which
   identifiers vacated — so the reader sees the reduced coverage instead of inferring

**Enumerate the orderings before choosing atomicity.** When the change edits both the
corpus and the gate that certifies it, write out every commit ordering and prove each
non-atomic one fails before accepting that one commit is forced. Then pin the atomic
commit's contents so the hook grades the end state, not a transition: the corpus merge,
the input-set constant, the shebang and task permission scopes, and the file deletion
land together. One site left at the old shape is the failure path.

**Anchor cross-revision fixtures where the input set was complete.** A `--against`
comparison reads only the paths the gate names — at the compared revision, not just at
HEAD. A vacancy fixture anchored on a revision where part of the corpus lived outside
the current input set measures less than it claims and exits 0 saying nothing: the same
vacuous pass, wearing a diff arm. Anchor on the revision where the current input set
held the entire historical corpus, so the fixture's clean exit actually proves the
declared vacancy.

**Never key a gate on a value its own author supplies.** The tempting fix for shape 1 is
a pinned expected count. That is a field the author writes, so the gate never runs on the
case it exists to catch. Prefer a key the gate recomputes: a digest over current bytes, a
compiler verdict, a re-derivation from the tree.

**Prove the widening with a known-bad fixture.** A gate that has only ever been run
against a healthy input has demonstrated that it can print a success line. Run it against
an input that must fail, and read the failure text. Each defect above was found by a
fixture, not by reasoning about the code.

## Why This Matters

The failure is silent by construction and lands in the one place nobody reads twice:
output that already says everything is fine. Downstream, the green result is then cited as
evidence the invariant holds — so the gate does not merely fail to catch the defect, it
actively certifies its absence.

The documentation compounds the harm. Prose asserting a guarantee the gate does not
implement ("a rule dropped in a move fails the gate") trains a maintainer to skip the
manual review the gate is not doing. Two independent reviewers caught that sentence here;
it had been written in the same change that widened the gate, by the author most convinced
the gate was now sound.

## When to Apply

- Widening any check from one artifact to several — the moment the input set becomes a
  collection, it becomes a thing that can silently shrink.
- Any gate that prints a count it computed itself, with no baseline the reader can check.
- Any check whose failure path is reachable only by a state the repository never normally
  reaches; that path has almost certainly never run.
- Reviewing a claim about what a gate enforces. Run the fixture; do not read the code and
  agree with it.
- Restructuring a corpus that a merge-blocking hook certifies — merging files, moving
  rules, narrowing the input set. Prove the orderings first; atomicity is a conclusion,
  not a style.

## Examples

Before — a single named input. Correct, and silently correct about a third of the corpus
once the corpus grew:

```python
PATH = "ONE_FILE.md"
text = open(PATH, encoding="utf-8").read()
# ... one file's worth of checking, exit 0
```

After — the input set is a collection, absence is fatal, and emptiness is fatal:

```python
PATHS = ("RESIDENT.md", "RETRIEVED.md")

for p in PATHS:
    try:
        texts[p] = open(p, encoding="utf-8").read()
    except FileNotFoundError:
        fail([f"{p}: missing — half a corpus scores exactly like a whole one"])

# ... after parsing, every declared input must have produced something
for p in PATHS:
    if p not in contributors:
        errors.append(f"{p}: parses but declares no rule")
```

And what cannot be failed is stated rather than omitted:

```
valid: 40 rules across 6 yaml blocks in 1 files, 9 families;
  9 id(s) vacated since 9654836~1: CONST-E1,CONST-E2,CONST-E3,CONST-E4,
    CONST-G1,CONST-G2,CONST-T1,CONST-T2,CONST-T5
```

And the fixture-anchoring pair from the reverse surgery — same gate, same narrowing,
different anchor:

| Anchor revision | Corpus shape at that revision | Result |
|---|---|---|
| a split-era revision | vacated ids lived in the file outside the gate's current input set | exit 0, zero vacancies named — silently measures nothing |
| the pre-split revision | the one named file held every historical rule | exit 0, all nine vacancies named |

The fixture battery that found all of it — each must fail, and the failure text is the
artifact worth keeping:

| Fixture | Required result |
|---|---|
| one corpus path absent from disk | fail, naming the path |
| one corpus path present but declaring nothing | fail, naming the path |
| an identifier duplicated across two paths | fail on the duplicate |
| a rule deleted while a citation to it survives | fail on the dangling citation |
| a malformed fence in the second path | fail, naming that path and a path-local block index |
| a rule deleted with nothing citing it | pass, and name the vacated identifier |
| a path renamed alongside a rule retitle | pass, and name the uncompared path |

## Related

- The gate discussed here is the constitution corpus validator invoked by the repository's
  `test` script; its module docstring carries the same argument at the point of use.
- `CONST-E6` (Prefer the Gate) makes a gate the final word; the rule that priced a gate's
  false-positive budget is gone with its vacated number. This learning is the counterweight
  either way — a gate that cannot fail is not enforcement, it is a certificate.
- The transition-state shape and the fixture-anchoring rule were added by the
  single-document restore (branch `restore-single-document`); the gate-fidelity residuals
  from that surgery are tracked in this repo's issues #19 and #20.
