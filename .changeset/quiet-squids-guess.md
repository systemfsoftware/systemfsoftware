---
"@systemfsoftware/effect-readiness": patch
---

Traces now show a separate `probe_condition_resolve` span, with its own duration metric, around each readiness check's dial, HTTP exchange or log read. The `probe_condition` span and its duration metric now cover only judging the result, so they no longer include that network or log latency.
