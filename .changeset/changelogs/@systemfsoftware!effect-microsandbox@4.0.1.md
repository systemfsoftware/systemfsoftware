## 4.0.1

### Patch Changes

- Starting a microVM on a platform without virtualization support now records the `probe_virtualization` run as `result_class=success`, not `infrastructure`. The start still fails with `VirtualizationUnsupportedError` and acquires no sandbox.

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@11.0.0
  - @systemfsoftware/effect-readiness@0.4.1
