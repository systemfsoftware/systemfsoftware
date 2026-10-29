---
title: A failing generated schema law is fixed in the schema's codec, never by removing the schema from the law generator
applies_when:
  - a generated round-trip, encode-stability or recursion law fails
  - a diff stops exporting a schema, moves a schema file out of src/, or adds a hand-written test beside a schema whose law fails
  - writing a transformation or composition that changes a value's representation
tags: [schema, codec, generated-laws, round-trip]
---

A failing round-trip, encode-stability or recursion law is fixed in the schema's codec: a lossy encode, a transformation whose decode and encode sides are swapped, or a composition whose Type and Encoded do not line up.

The schema is never taken out of the law generator's reach to silence the law: it is not un-exported, not moved out of the scanned src/ directory, and not given a hand-written test in place of its law. Narrowing the arbitrary or loosening the law is covered by the testing pack's rule on fixing failing tests; this rule adds where the fix goes and the escapes that rule does not name.

Decision test: in the change that turns a failing generated law green, is the change inside the schema's encode, decode or composition? If the change instead edits the arbitrary, removes the export, moves the file, or adds a replacement test, the rule fails.

Defect prevented: a generated law fails when the codec loses or reshapes information, so a value written and read back is not the value written. Removing the schema from the generator leaves that loss in place and deletes the only check that saw it.

```typescript
// WRONG: the law fails because encode drops the time zone; the export is removed so no law is generated
const Appointment = S.Struct({ at: LocalDateTimeFromIso }) // no longer exported
```

```typescript
// RIGHT: the codec keeps the offset, so decode(encode(value)) returns value
export const Appointment = S.Struct({ at: ZonedDateTimeFromIso })
```

Source: systemfsoftware CONCEPTS.md, "Generated Schema Law" (decode(encode(valid)) === valid and encode(decode(wire)) === wire, derived for exported schemas); docs/solutions/design-patterns/generated-schema-laws-are-tautological.md in the same repository ("they catch a codec that loses or reshapes information").

Gate: judge
