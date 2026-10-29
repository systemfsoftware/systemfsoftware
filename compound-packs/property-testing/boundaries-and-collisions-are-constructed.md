---
title: A boundary, a collision or a size unit the contract names is built by the generator, so every run reaches both sides
applies_when:
  - a decision compares a value with a cap, a threshold, zero or an empty list
  - a branch runs only when drawn values line up (equal, matching a pattern, a member of a set, ordered)
  - a contract measures the size of drawn text in one unit (bytes, code points)
tags: [property-test, generator, boundary, collision, size-unit]
---

A boundary the contract names (a >= or <=, a cap, zero) is reached by construction: some property in the file draws an offset from a small range around the bound and builds the input from it, so the equal point and its neighbour on each side are drawn on every run. Never leave it to a uniform draw over a wide range, or to ranges built disjoint so the equal point is never drawn.

A branch that runs only when a drawn value has a structure a plain draw of its schema rarely produces (equal to another value or to a literal, matching a pattern, a member of a set, an ordering among elements) has a generator that builds that structure ("collisions … can be important test cases", How to Specify It).

Two values whose equality selects the branch are drawn from a generator that produces both equal and unequal pairs (a small pool), with a cover class for each. A same-value property, if written, is added beside the general property and never replaces it: with one key, "an implementation of insert that discarded the original tree entirely would still pass" (How to Specify It, prop_InsertPost).

When the contract measures size in one unit, the generator draws values whose size differs across units (multi-byte code points for a byte cap), the input is built to its target size with the platform measure the contract names (TextEncoder for UTF-8 bytes), never a helper of the subject's module, and "characters counted for bytes" is a named wrong implementation (properties-are-shown-to-fail.md).

A construction is itself checked: a conjunct asserts the built input has the size it was built to ("Test your tests", How to Specify It).

Replacing a wide draw with a construction that reaches the same boundary on every run, with cover proving it, is not narrowing; a construction never replaces a draw that refuted the property (failing-tests-are-fixed-not-weakened.md).

Whether a boundary, structure or size unit is built is decided by the review judge; an uncertain case escalates.

```typescript
// WRONG: a uniform string draw never crosses the cap, and an ASCII body makes characters equal bytes
it.prop(
  '∀u_AdmitUpload_→OversizedPastCap',
  { of: [AdmitUpload], subject: admitUpload },
  (subject, [command]) =>
    Result.getOrThrow(subject(command))._tag ===
      (command.mode === 'read-write' && command.body.length <= CAP ? 'UploadAdmitted' : 'UploadRefused'),
)
```

```typescript
// RIGHT: offset and filler are drawn inline; the platform's UTF-8 measure, not the subject's module, builds the body to CAP + offset bytes
const bytesOf = (text: string): number => new TextEncoder().encode(text).byteLength
const bodyOf = (filler: string, bytes: number): string =>
  filler.repeat(Math.floor(bytes / bytesOf(filler))) + 'a'.repeat(bytes % bytesOf(filler))
const answerOf = (admission: UploadAdmission): string =>
  Match.valueTags(admission, {
    UploadAdmitted: ({ bytes }) => `Admitted ${new TextDecoder().decode(bytes)}`,
    UploadRefused: ({ reason }) => reason,
  })
it.prop(
  '∀u_AdmitUpload_→OversizedPastCap',
  {
    of: [UploadName, StoreMode, Schema.Literals([-2, -1, 0, 1, 2]), Schema.Literals(['a', 'é', '€', '😀'])],
    subject: admitUpload,
    cover: {
      belowCap: [(_n, mode, offset) => mode === 'read-write' && offset === -1, 0.05],
      atCap: [(_n, mode, offset) => mode === 'read-write' && offset === 0, 0.05],
      pastCap: [(_n, mode, offset) => mode === 'read-write' && offset === 1, 0.05],
      multiByteAtEdge: [
        (_n, mode, offset, filler) => mode === 'read-write' && filler !== 'a' && (offset === 0 || offset === 1),
        0.05,
      ],
      readOnly: [(_n, mode) => mode === 'read-only', 0.3],
    },
  },
  (subject, [name, mode, offset, filler]) => {
    const body = bodyOf(filler, CAP + offset)
    return bytesOf(body) === CAP + offset &&
      answerOf(Result.getOrThrow(subject(new AdmitUpload({ name, mode, body })))) ===
        (mode === 'read-only' ? 'ReadOnly' : offset <= 0 ? `Admitted ${body}` : 'Oversized')
  },
)
```

Gate: judge
