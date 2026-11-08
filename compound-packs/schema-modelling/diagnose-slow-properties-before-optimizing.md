---
title: Diagnose slow properties before changing schemas or adding caches
applies_when:
  - investigating a slow, flaky or timing-out property test
  - adding defensive validation, normalization or invalid-input skips to a workflow
  - considering a cache to make a property test faster
tags: [schema, property-testing, diagnostics, arbitrary, invariants]
---

A schema is under-constrained when it decodes a value that violates an independently established domain invariant. An invariant is independently established when a source other than the failing test, its arbitrary or the code under test states it, such as a product or domain requirement, an external API or protocol contract, or an existing decoder, validation or documented type at a trust boundary. Cite that source in the change. A filter in the test's arbitrary or a guard in the workflow is not such a source: each shows an assumption, not that the domain requires it. A discard is a generated candidate rejected before a property iteration; it is not a domain-invalid value accepted by the schema. Runner contention is competition for host resources from concurrent work that measurably increases elapsed time under comparable load.

For a slow property or a workflow repeatedly rejecting or normalizing decoded values, investigate the schema before optimizing the workflow. Compare discard counts, the share of accepted inputs that violate independent domain invariants, and time per accepted case under comparable uncontended and contended conditions. Attribute slowness to rejection only with generation evidence: the runner's discard count, discard-budget exhaustion (`SampleError` or `Exhausted`), or generation time measured as dominating the property's elapsed time. Budget exhaustion establishes that the configured discard budget was exceeded, not how much wall time rejection consumed. Attribute slowness to runner contention only with host evidence recorded for the slow run, such as load, PSI or CPU throttling; a fast isolated run alone does not prove contention.

If the schema accepts a domain-forbidden value, encode the invariant as a field refinement, struct check or tagged union (pack: schema-modelling, invariants-live-in-the-schema.md) (pack: schema-modelling, states-are-tagged-unions.md). Then construct valid inputs directly rather than filtering candidates on that invariant (pack: schema-modelling, generation-constraints-the-derivation-reads.md). If the schema is already correct but discards are costly under the evidence above, change its generation constraints or the test's arbitrary, never the schema's validation (pack: schema-modelling, generation-constraints-the-derivation-reads.md). Constructive generation preserves the decoded domain and run count. Delete only internal guards made unreachable by the invariant; retain untrusted-input decoders, external error handling and branches for valid outcomes.

Never increase timeouts, reduce runs, or add caches or module state to make the property pass. A production cache needs the independent ownership and evidence in (pack: cell-architecture, instance-state-lives-in-the-constructor.md). Never add a constraint or narrow the schema's valid domain to make a test pass; an invariant must be independently established. If the schema already carries the invariant, change generation, not validation.

A filter excludes inputs as domain-invalid when it claims the excluded decoded inputs cannot occur. If no independent source establishes that claim, remove the filter: generate the schema's whole domain and assert the workflow's specified outcome for the excluded values, such as its typed failure. A filter selecting a valid branch, such as equal values, an ordering or membership in a set, is a property precondition, not a domain claim; keep it as a branch-focused property beside the general property. If its discards are costly, replace the filter with constructive branch generation (pack: property-testing, boundaries-and-collisions-are-constructed.md).

```typescript
// WRONG: the domain requires start <= end, but the schema accepts an inverted range
const Range = S.Struct({ start: S.BigInt, end: S.BigInt })

// RIGHT: declare the invariant; map two bigint draws into an ordered range
const Range = S.Struct({ start: S.BigInt, end: S.BigInt }).check(
  S.makeFilter(({ start, end }) => start <= end, { message: 'start is not after end' }),
)
const ordered = (a: bigint, b: bigint) => a <= b ? { start: a, end: b } : { start: b, end: a }
```
