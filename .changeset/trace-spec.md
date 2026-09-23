---
"@systemfsoftware/trace-spec": minor
---

`Contract.of(taxonomy).stimulate(stimulus).holds(relation)` now runs as a cell: `Contract.cell(contract)` composes read, decode, decide, encode, and write; `Contract.check(contract, input)` is the test edge that fails with `Contract.TraceDisparityError` and annotates the dump path. `Graph.decode` is pure, answering `Result<TraceGraph, ContractDecodeError>`, with standalone `byId`, `children`, and `descendants`.

`InMemory.make(options?)` is a cold spec; `InMemory.layer(spec)` provides `Observation | OtelTracer.OtelTracer`, and separate `InMemory.scoped(spec)` acquisitions observe independent traces. `Case.prop` registers through `it.effect.prop` with native shrinking: failing draws overwrite one dump named after the case, and the reported counterexample is the last failing draw.
