---
title: A property counts only when it is shown to fail against each named wrong implementation it exists to reject, and a property that cannot fail is smoke
applies_when:
  - adding a property, or a pull request that claims a decision is proven by properties
  - reviewing a pull request that adds or changes an it.prop, it.effect.prop or it.law property
  - every property of a file is idempotent, deterministic or a round trip
tags: [property-test, mutation, falsifiable, wrong-implementation, review, smoke]
---

Before a property counts, its author names the wrong implementations it must reject and shows each one turning it red: a constant decision, an identity or echo of the input, a decide that ignores a field the contract names, a lookup table keyed on the property's fixed values, an off-by-one at each boundary (`<` for `<=`), two decision tags swapped, first-versus-last match, characters counted where the contract counts bytes.

Include at least one that is wrong only under a rare condition the generator must reach (two fields lining up, a boundary, a collision, a multi-byte character); one that fails on every input proves only that the property runs. On a fully enumerated finite domain a lookup table is a correct implementation, so that clause does not apply.

The pull request carries, per property and wrong implementation, the diff, and the reviewer applies it, runs the package's test command with the replay token and sees `PropertyRefuted`. Never count a property on green runs, a pass count, a passed constant-impostor check or an advisory mutation report.

Delete or rewrite a smoke property: one that cannot fail on a named wrong implementation, explores one fixed input sequence (committed seed, literal for a read field, a name that claims a range the body fixes), uses a replica or shape-only oracle, or leaves a named boundary, structure or size unit unbuilt. When a trivial implementation passes every property in a file, the property set or the contract is incomplete; name the trivial implementation on the tracking issue and take the missing clause from the contract's owner. A surviving mutant is resolved by the testing pack's surviving-mutants-are-killed-or-their-code-deleted.md.

```
WRONG (review verdict): Properties look comprehensive: 3 it.prop calls, all green in CI. Approved.
RIGHT (pull request description), per property and wrong implementation:
∀u_AdmitUpload_→OversizedPastCap  wrong: characters counted for bytes
  diff:    - if (new TextEncoder().encode(command.body).byteLength > CAP)
           + if (command.body.length > CAP)
  refuted: ["n", "read-write", 1, "😀"]   replay: CONFORMANCE_REPLAY="property=<hash>;seed=<n>;runs=<n>" pnpm test
```
