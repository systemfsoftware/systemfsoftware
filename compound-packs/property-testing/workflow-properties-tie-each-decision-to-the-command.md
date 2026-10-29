---
title: A workflow's properties tie every decision tag to the command fields that select it, in both directions, with an exact postcondition or model per tag
applies_when:
  - writing the <stem>.workflow.property.test.ts for a Workflow.make decision
  - adding a decision tag, an error tag or a command field to a workflow
  - a workflow's property file holds only validity, idempotent, deterministic, round-trip or invariance properties
tags: [property-test, workflow, decider, postcondition, metamorphic, model]
---

Properties target decide through the Workflow.make value; decide reads only its command, so a property needs no service or fake. The shell that acts on a decision is proven by behaviour tests, not by these properties.

The value the claim is about is produced by the `subject` parameter, because the constant-impostor gate and a wrong implementation replace only the subject (runner README); a decision computed in holds by calling the workflow or its helpers directly is refused, and a property over several functions declares the function under claim as its subject.

Each decision tag and each error tag has a property that states when it must be chosen and a property, or the same one, that states when it must not.

Where two refusals can both apply, a property states which one wins, as ∀e_AdmitEntryWrite_→ReadOnlyRefusedBeforeSize does.

Each tag that carries a payload has a property that compares the exact payload value by equality. A bound (≤, ≥), a prefix or substring, a length or count, one sampled field or "not tag X" is a counter-check: a postcondition on one sampled key "may exercise the bug many times without detecting it" (How to Specify It, prop_UnionPost).

A payload that names a position or a member (the first offender, any divergence) is drawn with several candidates at varying positions, never one planted case always in the same place, and a string predicate is drawn with near misses (for a loopback check: '127.evil.example', 'localhost', '::1'); a fixed position is a path a wrong implementation can identify (Property-based testing part 3, "we always prepend or append it").

A context the body fixes lets the claimed distinction show: under it, the wrong implementation that swaps the claimed tag with its neighbour (Normal for Abnormal) changes the asserted output (properties-are-shown-to-fail.md).

A field the contract says the decision ignores has an invariance metamorphic property: changing only that field leaves the decision equal, with a cover class for each decision region it compares across. A field the decision reads has a property that moves it across its boundary and states the new tag.

When the safe answer is trivial (always refuse, always defer, always the fallback), a property requires the non-trivial tag whenever its preconditions hold.

A state carried as a field of the command is drawn across its whole union.

Validity checks, it.law.invariant, bound checks, it.law.idempotent, it.law.deterministic and round trips are counter-checks; none is the only property for a tag. Repetition proves nothing when it passes (repetition-cannot-observe-constant-io.md), and idempotent and deterministic laws skip the constant-impostor gate (runner README, Law kinds). An invariance metamorphic property is passed by a constant decide, as the identity and the empty list pass "different paths, same destination" (Property-based testing part 3), so each is paired with a postcondition or model property on the same tags.

Whether each tag has both directions and an exact payload check is decided by the review judge; an uncertain case escalates.

```typescript
// WRONG: a constant or identity decide passes every property
it.prop('∀u_AdmitUpload_∈UploadAdmission', { of: [AdmitUpload], subject: admitUpload }, (subject, [command]) =>
  Schema.is(UploadAdmission)(Result.getOrThrow(subject(command))))
it.law.deterministic('∀u_AdmitUpload_=Deterministic', { of: [AdmitUpload], subject: admitUpload })
```

```typescript
// RIGHT: table, boundary and payload properties (see the drawn-values, boundaries and oracles rules), and an ignored field
// ∀u_AdmitUpload_≡ContractTable                          model: mode × size, read-only wins over oversized
// ∀u_AdmitUpload_→OversizedPastCap                       postcondition: the cap's equal point and both neighbours
// →ReadWrite_AdmitUpload_≡AdmittedBytesDecodeToBody      payload: exact bytes through the platform's decoder
// bodyOf and answerOf: boundaries-and-collisions-are-constructed.md
it.prop(
  '∀u_AdmitUpload_=IgnoresName',
  {
    of: [UploadName, UploadName, StoreMode, Schema.Literals([-1, 0, 1]), Schema.Literals(['a', 'é', '€', '😀'])],
    subject: admitUpload,
    cover: {
      admitted: [(_a, _b, mode, offset) => mode === 'read-write' && offset !== 1, 0.2],
      pastCap: [(_a, _b, mode, offset) => mode === 'read-write' && offset === 1, 0.1],
      readOnly: [(_a, _b, mode) => mode === 'read-only', 0.3],
    },
  },
  (subject, [name, other, mode, offset, filler]) => {
    const body = bodyOf(filler, CAP + offset)
    return answerOf(Result.getOrThrow(subject(new AdmitUpload({ name, mode, body })))) ===
      answerOf(Result.getOrThrow(subject(new AdmitUpload({ name: other, mode, body }))))
  },
)
```

Gate: judge
