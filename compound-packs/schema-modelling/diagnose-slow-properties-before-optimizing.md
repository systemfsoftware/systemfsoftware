---
title: Diagnose slow properties before changing schemas or adding caches
applies_when:
  - investigating a slow, flaky or timing-out property test
  - adding defensive validation, normalization or invalid-input skips to a workflow
  - considering a cache to make a property test faster
tags: [schema, property-testing, diagnostics, arbitrary, invariants]
---

A schema is under-constrained when it decodes a value that violates an independently established domain invariant. A discard is a generated candidate rejected before a property iteration; it is not a domain-invalid value accepted by the schema. Runner contention is competition for host resources from concurrent work that measurably increases elapsed time under comparable load.

For a slow property or a workflow repeatedly rejecting or normalizing decoded values, investigate the schema before optimizing the workflow. Compare discard counts, the share of accepted inputs that violate independent domain invariants, and time per accepted case under comparable uncontended and contended conditions. `SampleError` or `Exhausted` establishes that a configured discard budget was exceeded, not how much wall time rejection consumed. Attribute slowness to rejection only when measured generation cost supports it; a fast isolated run alone does not prove contention.

If the schema accepts a domain-forbidden value, encode the invariant as a field refinement, struct check or tagged union (pack: schema-modelling, invariants-live-in-the-schema.md) (pack: schema-modelling, states-are-tagged-unions.md). Then construct valid inputs directly rather than filtering candidates on that invariant (pack: schema-modelling, generation-constraints-the-derivation-reads.md). If the schema is already correct but discards are costly, fix generation without changing the domain. Constructive generation preserves the decoded domain and run count. Delete only internal guards made unreachable by the invariant; retain untrusted-input decoders, external error handling and branches for valid outcomes.

Never increase timeouts, reduce runs, or add caches or module state to make the property pass. A production cache needs the independent ownership and evidence in (pack: cell-architecture, instance-state-lives-in-the-constructor.md). Do not invent an invariant from a timeout: weekly sessions may cross a week boundary, and a close zone may differ from the session zone.

```typescript
// WRONG: the domain requires start <= end, but the schema accepts an inverted range
const Range = S.Struct({ start: S.BigInt, end: S.BigInt })

// RIGHT: declare the invariant; map two bigint draws into an ordered range
const Range = S.Struct({ start: S.BigInt, end: S.BigInt }).check(
  S.makeFilter(({ start, end }) => start <= end, { message: 'start is not after end' }),
)
const ordered = (a: bigint, b: bigint) => a <= b ? { start: a, end: b } : { start: b, end: a }
// If Range already carried the check, change the generator, not the schema.
```
