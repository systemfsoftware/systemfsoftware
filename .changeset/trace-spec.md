---
"@systemfsoftware/trace-spec": minor
---

New package: hold a behaviour to the trace it produced.

`Contract.of(taxonomy).stimulate(stimulus).holds(relation)` composes a spec; `Contract.check` runs it under a trace id it owns, reads the trace back through `Observe.inMemory`, decodes it against the taxonomy, and evaluates the relation. `Suite.make({ it, layer })` registers a `Case` per example input or a `Case.prop` per fast-check arbitrary, shrinking a failure to a minimal input; `withLayer` shares a layer across the suite.

`Rel` relations answer a verdict naming the broken conjunct and the spans inspected, never a bare boolean; the set covers existence, attributes, status, events, placement, ordering, duration, and `all`/`any`/`not`.

A break fails with `TraceDisparityError` and annotates the test with the dump path; a missing required attribute fails with `ContractDecodeError`; an empty trace with `EmptyObservationError`.
