---
"@systemfsoftware/stryker-js-engine": major
---

The pooled test-runner no longer declares `init`. Worker-startup failures
report the phase `connect`. Plugin layers that fail to build now surface
their typed plugin-build error when reporters are resolved instead of
being swallowed.
