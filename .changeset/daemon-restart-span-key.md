---
"@systemfsoftware/effect-daemon-spec": major
---

The restart decision span now carries its strategy under the OpenTelemetry key `daemon.restart.strategy` instead of the bare field name `strategy`. Update anything that reads the old key; no exported signature changes.
