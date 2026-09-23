---
"@systemfsoftware/effect-microsandbox": major
---

Spans now carry their command fields under OpenTelemetry keys: the virtualization assessment reports `microsandbox.virtualization.platform` instead of `platform`, the sandbox plan reports `microsandbox.sandbox.name` instead of `name`, and job exit classification reports `microsandbox.job.exit.code` instead of `code`. Update anything that reads the old keys; no exported signature changes.
