## 1.0.0

### Major Changes

- Spans now carry their command fields under OpenTelemetry keys: the virtualization assessment reports `microsandbox.virtualization.platform` instead of `platform`, the sandbox plan reports `microsandbox.sandbox.name` instead of `name`, and job exit classification reports `microsandbox.job.exit.code` instead of `code`. Update anything that reads the old keys; no exported signature changes.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@10.0.0
  - @systemfsoftware/effect-readiness@0.1.1
