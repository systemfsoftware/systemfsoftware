---
title: A property's expected value comes from the contract by an independent path, never from the code under test or the helpers it reaches
applies_when:
  - writing the predicate of an it.prop, it.effect.prop or it.law property
  - a property file imports anything from src/ besides the subject, its command and decision schemas, and the schemas it draws from
  - writing an it.law.model oracle
tags: [property-test, oracle, model, metamorphic, postcondition]
---

Never take the expected value from the subject or a replica. A replica uses the predicate, formula, guard or constant the subject uses to choose its branch or compute its payload, found by following the subject module's imports transitively, including a library predicate that is the decision's core (`Cause.hasInterruptsOnly`). A combinator that only reads the output (`Match.tag`, `Schema.is` on one member) is not a replica, nor is a platform primitive the contract names as its measure (`TextEncoder`); the subject module's own wrapper around it is.

Write the oracle from the contract: a literal table of contract rows, an expression over constructed parameters that states the contract's sentences, a model simpler than the implementation that calls nothing from src/, a metamorphic relation, a round trip through an independent decoder, or a check that verifies an answer without recomputing it. Build the input so the contract fixes its answer (an offset past a cap is refused) rather than computing the answer from the input. Where the contract is a formula (a backoff delay), use values known by construction or a relation on the outputs (monotone in k, the cap reached at a known k).

Never use an output recorded from the current code (a snapshot), a shape-only check as the whole oracle (a member of the decision union, `Schema.is`, a preserved length, `Result.isSuccess`: an empty, constant or identity implementation passes it), a conjunct comparing two values the test computed itself, or a wrapper `(c) => subject(c)` as an `it.law.model` oracle.

```typescript
// WRONG: expected bytes come from the size check and encoder decide itself uses
import { bodyFitsCap, bodyUtf8Of } from '../admit-upload.workflow.js'
// RIGHT: admitted bytes decode, through the platform's decoder, to the body that was built
UploadAdmitted: ;
;(({ bytes }) => Option.some(new TextDecoder().decode(bytes)))
```
