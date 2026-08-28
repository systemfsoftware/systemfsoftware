---
"@systemfsoftware/stryker-js-platform-node": patch
---

The package now declares a runtime dependency on `mutation-testing-metrics` instead of shipping the code inline. Installing the package pulls that dependency in explicitly; nothing in the public API changes.
