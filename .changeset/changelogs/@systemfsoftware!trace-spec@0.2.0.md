## 0.2.0

### Minor Changes

- Judge contracts against traces produced in another process. `RemoteObservation.layer(source, { interval, settle, timeout })` provides `Observation` by reading a trace store until no read has added a span for `settle`. `TempoTraceStore.source({ baseUrl })` reads Grafana Tempo's `/api/v2/traces/<traceId>` through the `HttpClient` you provide; put auth and tenant headers on that client.

  New failures `Observation.IncompleteObservationError` (spans never settled, or the store marked the trace partial) and `Observation.TransportObservationError` (the store could not be read) join `Collector.collect`, `Contract.JudgeFailure`, and `Suite.CaseFailure`. This is a breaking type change: code that matches every case of these unions, or restates them by hand, must handle both.
