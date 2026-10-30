---
title: A workflow's properties tie every decision tag to the command fields that select it, in both directions, with an exact postcondition or model per tag
applies_when:
  - writing the <stem>.workflow.property.test.ts for a Workflow.make decision
  - adding a decision tag, an error tag or a command field to a workflow
  - a workflow's property file holds only validity, idempotent, deterministic, round-trip or invariance properties
tags: [property-test, workflow, decider, postcondition, metamorphic, model]
---

Target `decide` through the `Workflow.make` value; it reads only its command, so a property needs no service or fake. The shell that acts on a decision is proven by behaviour tests. Produce the value the claim is about with the `subject` parameter; never compute a decision in the predicate by calling the workflow or its helpers directly.

Give each decision tag and each error tag a property that states when it must be chosen and one (or the same) that states when it must not. Where two refusals can both apply, state which wins.

Compare a payload tag's exact payload by equality. A bound, prefix, substring, length, count, one sampled field or "not tag X" is only a counter-check. Draw a payload that names a position or member (the first offender, any divergence) with several candidates at varying positions, and a string predicate with near misses (for a loopback check: `127.evil.example`, `localhost`, `::1`). Draw a state carried as a command field across its whole union.

Fix a context so the claimed distinction shows: the wrong implementation that swaps the tag with its neighbour changes the asserted output. For a field the contract says the decision ignores, add an invariance property (change only that field, the decision stays equal) with a cover class per region; for a field it reads, a property that moves it across its boundary and states the new tag. When the safe answer is trivial (always refuse, always defer), require the non-trivial tag whenever its preconditions hold.

Validity, `it.law.invariant`, bound checks, `it.law.idempotent`, `it.law.deterministic` and round trips are counter-checks; none is the only property for a tag. Pair an invariance property with a postcondition or model property on the same tags, since a constant `decide` passes invariance.

```typescript
// WRONG: a constant or identity decide passes every property
it.prop('∀u_AdmitUpload_∈UploadAdmission', { of: [AdmitUpload], subject: admitUpload },
  (subject, [command]) => Schema.is(UploadAdmission)(Result.getOrThrow(subject(command))))
// RIGHT: table, boundary, exact-payload and ignored-field properties
// ∀u_AdmitUpload_≡ContractTable · ∀u_AdmitUpload_→OversizedPastCap · →ReadWrite_AdmitUpload_≡AdmittedBytesDecodeToBody · ∀u_AdmitUpload_=IgnoresName
```
