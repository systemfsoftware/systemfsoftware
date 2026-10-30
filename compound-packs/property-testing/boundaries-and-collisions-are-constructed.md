---
title: A boundary, a collision or a size unit the contract names is built by the generator, and the property declares a coverage class for each region it is about
applies_when:
  - a decision compares a value with a cap, a threshold, zero or an empty list
  - a branch runs only when drawn values line up (equal, matching a pattern, a member of a set, ordered)
  - a contract measures the size of drawn text in one unit (bytes, code points)
  - writing or changing a property in a *.workflow.property.test.ts
  - a property's predicate holds trivially on some inputs, or its draws pass a precondition that discards some
tags: [property-test, generator, boundary, collision, size-unit, coverage, cover]
---

Reach a boundary the contract names (a `>=` or `<=`, a cap, zero) by construction: some property draws an offset from a small range around the bound and builds the input from it, so the equal point and a neighbour on each side are drawn on every run. Never leave it to a uniform draw over a wide range or to ranges built disjoint.

Give a branch that runs only when drawn values have a structure a plain draw rarely produces (equal to another value or a literal, matching a pattern, a member of a set, an ordering) a generator that builds that structure. Draw two values whose equality selects the branch from a small pool that yields both equal and unequal pairs; a same-value property goes beside the general one, never in place of it.

When the contract measures size in one unit, draw values whose size differs across units (multi-byte code points for a byte cap) and build the input to its target size with the platform measure the contract names (`TextEncoder` for UTF-8 bytes), never a helper of the subject's module. Assert the built input has the size it was built to.

Declare `cover` on every workflow property: one class for each input region that selects a tag the claim is about and one for each side of each boundary. A class predicate reads only the drawn inputs, classifies from the contract (`offset === 0`), never a constant, never by decision tag, and never recomputes `decide`. Its minimum is at least 0.05; a rarer region gets a generator that builds it. A region reached on every draw by construction declares no class and names the construction in a one-line comment. A guard branch that returns true without checking the output, and a precondition that discards draws (`fc.pre`, `.filter`), each get a class for the region they keep. Line coverage, a run count or a pass count never shows a region was reached.

```typescript
// WRONG: a uniform draw never crosses the cap, and ASCII makes characters equal bytes
(subject, [command]) => Result.getOrThrow(subject(command))._tag === (command.body.length <= CAP ? 'UploadAdmitted' : 'UploadRefused')
// RIGHT: offset and filler are drawn; the body is built to CAP + offset bytes
of: [UploadName, StoreMode, Schema.Literals([-2, -1, 0, 1, 2]), Schema.Literals(['a', 'é', '€', '😀'])],
cover: { atCap: [(_n, mode, offset) => mode === 'read-write' && offset === 0, 0.05], pastCap: [(_n, mode, offset) => mode === 'read-write' && offset === 1, 0.05] },
```
