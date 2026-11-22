---
title: A failing generated schema law is fixed in the schema's codec, never by removing the schema from the law generator
applies_when:
  - a generated round-trip, encode-stability, encode-determinism, decode-determinism or recursion law fails
  - a diff stops exporting a schema, moves a schema file out of src/, adds a hand-written test beside a schema whose law fails, or replaces an encode with `SchemaGetter.forbidden`
  - writing a transformation or composition that changes a value's representation
tags: [schema, codec, generated-laws, round-trip]
---

Fix a failing round-trip, encode-stability, encode-determinism, decode-determinism or recursion law in the schema's codec: a lossy encode, a transformation whose decode and encode sides are swapped, a decoder that reads mutable state, or a composition whose Type and Encoded do not line up.

Never take the schema out of the law generator's reach to silence the law: do not un-export it, move it out of the scanned src/ directory, or add a hand-written test in its place. Replacing an encode with `SchemaGetter.forbidden` is allowed only when the transformation meets the one-way rule (one-way-codecs-forbid-a-direction-only-when-no-honest-value-exists.md), never to silence a failing law on a lossless or normalising codec. Narrowing the arbitrary or loosening the law is covered by the testing pack's failing-tests-are-fixed-not-weakened.md.

```typescript
// WRONG: encode drops the time zone, so the export is removed to hide the failing law
const Appointment = S.Struct({ at: LocalDateTimeFromIso }) // no longer exported
// RIGHT: the codec keeps the offset
export const Appointment = S.Struct({ at: ZonedDateTimeFromIso })
```
