---
title: A property's expected value comes from the contract by an independent path, never from the code under test or the helpers it reaches
applies_when:
  - writing the predicate of an it.prop, it.effect.prop or it.law property
  - a property file imports anything from src/ besides the subject, its command and decision schemas, and the schemas it draws from
  - writing an it.law.model oracle
tags: [property-test, oracle, model, metamorphic, postcondition]
---

The expected value never comes from the subject or from a replica. An expected value is a replica when it uses the predicate, formula, guard or constant the subject uses to choose its branch or compute its payload, found by following the subject module's imports transitively (admit-entry-write.workflow.ts reaches entryWireTextOf through entryWireUtf8Of), including a library predicate that is the decision's core (Cause.hasInterruptsOnly).

A combinator that only reads the output (Match.tag, Schema.is on one member, Arr.join) is not a replica, and neither is a platform primitive the contract names as its measure (TextEncoder for UTF-8 bytes); the subject module's own wrapper around it is. A literal table of contract rows, or an expression over constructed parameters (offset, mode) that states the contract's sentences, is a model; an expression copied from decide over the command's fields is a replica.

Where the contract is itself a formula (a backoff delay), the property uses values known by construction or a relation on the subject's outputs (monotone in k, the cap reached at a known k).

An oracle is a postcondition written from the contract that ties the output to the drawn input, a model, a metamorphic relation, a round trip through an independent decoder, or a check that verifies an answer without recomputing it.

An expected value is known by construction where it can be: build the input so the contract fixes its answer (an offset past a cap is refused), rather than computing the answer from the input.

A model is simpler than the implementation and calls nothing from src/; a model that mirrors the implementation shares its bugs. it.law.model fails with SelfModelLaw only when the oracle is the subject itself (Object.is), so a wrapper such as (c) => subject(c) passes the runner and is refused here.

An output recorded from the current code (a snapshot, a value copied from a run) is not an oracle.

A check that only the output is well formed (a member of the decision union, Schema.is, a preserved length, Result.isSuccess on a workflow whose error is Schema.Never) is never a property's whole oracle; an empty, constant or identity implementation passes it.

A conjunct that compares two values the test computed itself, or an order the test's own flattening guarantees, checks nothing about the subject: like prop_InsertComplete over trees the generator built with insert, it "can never fail" (How to Specify It).

Whether an expected value is a model or a replica is decided by the review judge; an uncertain case escalates.

```typescript
// WRONG: the expected bytes come from the size check and encoder decide itself uses (admittedTextOf: below)
import { bodyFitsCap, bodyUtf8Of } from '../admit-upload.workflow.js'
it.prop(
  '→ReadWrite_AdmitUpload_≡AdmittedBytes',
  { of: [AdmitUpload], subject: admitUpload },
  (subject, [command]) =>
    Equal.equals(
      admittedTextOf(
        Result.getOrThrow(subject(new AdmitUpload({ name: command.name, mode: 'read-write', body: command.body }))),
      ),
      bodyFitsCap(command.body)
        ? Option.map(bodyUtf8Of(command.body), (b) => new TextDecoder().decode(b))
        : Option.none(),
    ),
)
```

```typescript
// RIGHT: admitted bytes decode, through the platform's decoder, to the body that was built; past the cap nothing is admitted
// bodyOf: boundaries-and-collisions-are-constructed.md; read-only rows: ∀u_AdmitUpload_≡ContractTable
const admittedTextOf = (admission: UploadAdmission): Option.Option<string> =>
  Match.valueTags(admission, {
    UploadAdmitted: ({ bytes }) => Option.some(new TextDecoder().decode(bytes)),
    UploadRefused: () => Option.none(),
  })
it.prop(
  '→ReadWrite_AdmitUpload_≡AdmittedBytesDecodeToBody',
  {
    of: [UploadName, Schema.Literals([-1, 0, 1]), Schema.Literals(['a', 'é', '€', '😀'])],
    subject: admitUpload,
    cover: {
      fits: [(_n, offset) => offset === -1 || offset === 0, 0.3],
      pastCap: [(_n, offset) => offset === 1, 0.15],
    },
  },
  (subject, [name, offset, filler]) => {
    const body = bodyOf(filler, CAP + offset)
    return Equal.equals(
      admittedTextOf(Result.getOrThrow(subject(new AdmitUpload({ name, mode: 'read-write', body })))),
      offset <= 0 ? Option.some(body) : Option.none(),
    )
  },
)
```

Gate: judge
