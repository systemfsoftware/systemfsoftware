---
"@systemfsoftware/effect-e2e": minor
---

Add tracing and metrics. `./run` exports `Telemetry`, a silent-by-default sink every `act`, `assert`, `waitFor` and `extract` step reads, and `OtlpTelemetry.layerFromEnv`, which exports OTLP/JSON spans and counters over the `HttpClient` you provide only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; with no endpoint nothing is sent. Steps emit `e2e.act`, `e2e.assert`, `e2e.waitFor`, `e2e.extract`, `e2e.replay`, `e2e.engine.action` and `e2e.model.call` spans (the last with `gen_ai.*` attributes), and the `e2e.replay.outcomes`, `e2e.model.calls` and `e2e.model.tokens` counters, counted from the same step records the report folds. The report summary gains `hitRate` (replayed over replayed, handed off and missed; 0 when no step was cache-eligible), and the `list` reporter prints the cache split with it.
