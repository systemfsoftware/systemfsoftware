---
title: A gate can go green because it stopped looking
date: 2026-08-18
category: architecture-patterns
module: constitution corpus validator
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - A gate's input set is named in the gate rather than derived from the tree
  - A single-artifact check is widened to cover several artifacts
  - A merge-blocking check reports a count it computed itself
tags: [gate-design, vacuous-pass, verification, fail-closed, known-bad-fixture]
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
  no reassignment.

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

3. **What cannot be failed must be reported.** Some gaps are legal and failing them
   would fire on correct work: a deliberate deletion, a genuinely new input with no
   history. Name them on the success line — which inputs were not compared, which
   identifiers vacated — so the reader sees the reduced coverage instead of inferring
   full coverage from a green exit.

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
valid: 34 rules across 6 yaml blocks in 2 files, 9 families;
  no id reassigned since <rev>;
  not compared, absent at <rev>: RETRIEVED.md;
  1 id(s) vacated since <rev>: CONST-N3
```

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
- `CONST-E1` (Prefer the Gate) and `CONST-E3` (A Gate Earns Its Place) are the rules that
  make a gate the final word and price its false-positive budget; this learning is the
  counterweight — a gate that cannot fail is not enforcement, it is a certificate.
