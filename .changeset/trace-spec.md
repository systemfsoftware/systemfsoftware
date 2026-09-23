---
"@systemfsoftware/trace-spec": minor
---

New package: hold a behaviour to the trace it produced. `Contract.of(taxonomy).stimulate(stimulus).holds(relation)` composes a spec; `Contract.judge(contract, input)` runs the behaviour under a trace id it mints, decodes the finished trace against the taxonomy, and answers the verdict with the dump path of a break; `Contract.check` fails a break with `Contract.TraceDisparityError`. `Graph.decode` is pure, answering `Result<TraceGraph, ContractDecodeError>`.

`ObservationWindow.make(serviceName)` is the in-memory observation resource: `.scoped` acquires a window handle read with `ObservationWindow.collect`, and `.layer` provides `Observation | OtelTracer.OtelTracer`, one window per acquisition. `Suite.make({ it, layer })` registers a `Case` per input or a `Case.prop` per Schema, shrinking through `it.effect.prop` to one dump of the minimal failing input.
