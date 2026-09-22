---
"@systemfsoftware/trace-spec": minor
---

`Graph.decode` turns a finished trace's span records into a graph indexed by a declared taxonomy: spans whose name matches a declaration carry that declaration's decoded attributes, spans missing or mistyping a required attribute fail with `ContractDecodeError` naming the declaration and the attribute, and un-declared spans stay in the graph untouched. `Rel` holds relations over that graph — `exists`, `absent`, `unique`, `child`, `descendant`, `status`, `errorType`, `attrs`, `durationLessThan`, `soft`, and `all` — and every relation answers with a hold or a break naming its conjunct, the span ids it inspected, and a detail, never a bare boolean; `Rel.all` stops at the first hard break and reports every soft break it evaluated, and the existence of a contracted span is never soft. `FailureDump.disparity` renders the decoded graph and records where it was written on a `TraceDisparityError`.
