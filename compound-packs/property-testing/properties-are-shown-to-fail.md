---
title: A property counts only after a reviewer has reproduced its red run against each named wrong implementation it exists to reject
applies_when:
  - adding a property, or a pull request that claims a decision is proven by properties
  - a property file's subject is cleared by the constant-impostor gate through one property while others stay weak
  - every property of a file is idempotent, deterministic or a round trip
tags: [property-test, mutation, falsifiable, impostor, wrong-implementation]
---

Before a property counts, its author names the wrong implementations it must reject and shows each one turning it red.

The named wrong implementations include, where they apply: a constant decision, an identity or echo of the input, a decide that ignores one field the contract names, a lookup table keyed on the property's fixed values, an off-by-one at each boundary (< for <=), two decision tags swapped, the first or last match taken where the contract says the other, and characters counted where the contract counts bytes.

At least one is wrong only under a rare condition the generator must reach (two fields lining up, a boundary, a collision, a multi-byte character): "The bug should need a specific reachability prerequisite to manifest" (Antithesis mutation-testing skill, mutant design). One that fails on every input proves only that the property runs. On a fully enumerated finite domain a lookup table is a correct implementation, so this clause and the lookup-table item do not apply there.

For each property and each named wrong implementation, the pull request carries the wrong implementation as a diff the reviewer can apply, the run where that diff was applied and the property went red (a CI job URL or a committed log), and the runner's PropertyRefuted counterexample and replay token (CONFORMANCE_REPLAY="property=<hash>;seed=<n>;runs=<n>"). The reviewer applies the diff, runs the replay and sees the red; a listing without these counts as no red run. A property is falsified only when it "failed on that mutant's run … for a reason the log ties to the divergence", and the report names "the run id that proves it" (Antithesis mutation-testing skill).

The red run comes from the package's test command with the diff applied, never from Stryker, which runs only in CI (AGENTS.md REPO-D3). The Mutation workflow runs only on workflow_dispatch on main and its break exit fails no job, so its report is advisory and gates no pull request (mutation.yml, .github/AGENTS.md).

The constant-impostor gate judges a subject across its whole file and refutes only a constant subject (VacuousProperty), and it.law.idempotent and it.law.deterministic are exempt from it; passing that gate is never evidence that any one property can fail.

When a trivial implementation passes every property in a file, the property set or the contract is incomplete: "perhaps there is something you have overlooked" (Property-based testing part 3). The author names the trivial implementation on the tracking issue, and the missing clause comes from the issue's owner or the contract's source; the author never writes it.

A surviving Stryker mutant is resolved by surviving-mutants-are-killed-or-their-code-deleted.md.

Whether the named wrong implementations cover the contract is decided by the review judge; an uncertain case escalates. Whether a red run reproduces is observed by the reviewer, never judged from the description.

```
WRONG (pull request description)
Properties for admitUpload: 3 properties, all green, constant-impostor gate passed.
∀u_AdmitUpload_→OversizedPastCap    red against: always UploadAdmitted; `<` for `<=` at the cap
```

```
RIGHT (pull request description, one entry per property and wrong implementation)
∀u_AdmitUpload_→OversizedPastCap  wrong: characters counted for bytes
  diff:     - if (new TextEncoder().encode(command.body).byteLength > CAP)
            + if (command.body.length > CAP)
  red run:  <CI job URL, or the committed log's path>
  refuted:  ["n", "read-write", 1, "😀"]
  replay:   CONFORMANCE_REPLAY="property=<hash>;seed=<n>;runs=<n>" pnpm test
```

Gate: judge
