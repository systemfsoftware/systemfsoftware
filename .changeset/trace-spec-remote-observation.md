---
"@systemfsoftware/trace-spec": minor
---

Judge contracts against traces produced in another process. `RemoteObservation.layer(source, { interval, settle, timeout })` provides `Observation` by reading a trace store until no read has added a span for `settle`, and `TempoTraceStore.source({ baseUrl })` reads Grafana Tempo's `/api/v2/traces/<traceId>` through the `HttpClient` you provide, so auth and tenant headers go on that client. Any store can be supported by writing a `RemoteObservation.TraceSource`.

Two failures join `Observation.EmptyObservationError`: `Observation.IncompleteObservationError` when spans were read but never settled or the store marked the trace partial, and `Observation.TransportObservationError` when the store could not be read. `Collector.collect`, `Contract.JudgeFailure`, and `Suite.CaseFailure` include both.
