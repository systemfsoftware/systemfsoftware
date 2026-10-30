---
title: A failing generated schema law is fixed in the schema's codec, never by removing the schema from the law generator
applies_when:
  - a generated round-trip, encode-stability or recursion law fails
  - a diff stops exporting a schema, moves a schema file out of src/, or adds a hand-written test beside a schema whose law fails
  - writing a transformation or composition that changes a value's representation
tags: [schema, codec, generated-laws, round-trip]
---

Fix a failing round-trip, encode-stability or recursion law in the schema's codec: a lossy encode, a transformation whose decode and encode sides are swapped, or a composition whose Type and Encoded do not line up.

Never take the schema out of the law generator's reach to silence the law: do not un-export it, move it out of the scanned src/ directory, or add a hand-written test in its place. Narrowing the arbitrary or loosening the law is covered by the testing pack's failing-tests-are-fixed-not-weakened.md.

```typescript
// WRONG: encode drops the time zone, so the export is removed to hide the failing law
const Appointment = S.Struct({ at: LocalDateTimeFromIso }) // no longer exported
// RIGHT: the codec keeps the offset
export const Appointment = S.Struct({ at: ZonedDateTimeFromIso })
```
