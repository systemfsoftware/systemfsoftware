# AGENTS.md — `@systemfsoftware/effect-schema-refutation`

Refusal property tests plus an adequacy check for any Effect `Schema`. Usage is in `README.md`. The vocabulary — refutation adequacy, schema weakening, witness, refutation obligation, obligation node — is defined once in the root `CONCEPTS.md`; use those terms and do not redefine them here.

This package owns the half of a schema's contract the generated laws cannot reach. `@systemfsoftware/effect-schema-law` owns the other half and this package does not depend on it.

```yaml
rules:
  - id: REF-R1
    title: A refusal generator is derived from the domain contract, never from the refinement literal
    do: build the generator from what the type promises about its values — "a non-hex
      character is not a hex string" — so the test asserts something the schema's own
      predicate did not tell it
    dont: construct the generator by negating, mirroring or importing the regex,
      bound or predicate the schema checks with
    harm: a generator read off the literal reproduces the exact circularity that makes
      a generated law blind. It refuses precisely what the predicate refuses, so it
      passes for every schema the predicate accepts — including the schema after
      someone widens that predicate wrongly. The refusal property, the discrimination
      property and the adequacy verdict all go green on a schema whose constraint no
      longer holds, and the suite reports coverage of the one thing it cannot see
    check: review — for each generator, whether its construction reads any value from
      the schema it tests; the mechanical half is unbuildable because both spellings
      produce the same type
```

An obligation is keyed by the AST node a weakening removes, not by the path that reaches it — so one `refutes` call discharges that node everywhere it appears, and three schemas built on one refinement owe one refusal between them.

`scanObligations` reports `blind` arms separately from `obligations`: an arm nothing could draw for is not an arm with no witness. Read the two lists apart before concluding a schema is adequate.
