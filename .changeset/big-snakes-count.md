---
"@systemfsoftware/trace-spec": minor
---

Add `OtlpExportSource.source`: a trace source over the JSON bodies an OTLP/HTTP exporter pushed to a collector the caller runs, so a trace contract can judge spans as they left the process. It reads hex ids, integer span kinds and status codes, and integer attribute values sent as numbers or strings.
