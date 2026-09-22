---
"@systemfsoftware/trace-spec": minor
---

Exports `Contract`, `Graph`, `Observation`, `Rel`, `Stimulus`, `Suite`, and the `InMemory` driver layer. `Contract.of(taxonomy).stimulate(stimulus).holds(relation)` composes a spec through dual stages around a callable stimulus and relation; `Contract.trace` observes a run, answering the graph and verdict; `Contract.check` adds the judgement and writes exactly one dump per failing run.

`Suite.make({ it, layer })` registers a `Case` per input or a `Case.prop` per fast-check arbitrary, shrinking failures to a minimal input; the scenario layer must provide `Observation.Observation` and a `FileSystem`, enforced at the type level. A break fails with `Contract.TraceDisparityError` and annotates the test with its dump path; a missing attribute with `Contract.ContractDecodeError`, an empty trace with `Observation.EmptyObservationError`, a failing behaviour with `Suite.StimulusFailure`.
