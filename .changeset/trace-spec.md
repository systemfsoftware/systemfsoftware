---
"@systemfsoftware/trace-spec": minor
---

New package: hold a behaviour to the trace it produced.

`Contract.of(taxonomy).stimulate(stimulus).holds(relation)` composes a spec and `Contract.check` runs it under a trace id it owns, reads the finished trace back through an OpenTelemetry in-memory exporter (`Observe.inMemory`), decodes it against the taxonomy, and evaluates the relation. `Suite.make({ it, layer })` registers one `Case` per spec.

`Rel` relations answer a verdict naming the broken conjunct and the spans inspected, never a bare boolean. `Rel.fromTaxonomy` holds a trace to its taxonomy's edges and forbidden spans.

A break fails with `TraceDisparityError` and records where the decoded trace was written; a missing required attribute fails with `ContractDecodeError`; an empty trace fails with `EmptyObservationError`.
