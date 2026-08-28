---
"@systemfsoftware/stryker-js-platform-node": patch
---

@systemfsoftware/stryker-js-platform-node now declares `mutation-testing-metrics` as a runtime dependency instead of inlining its code into the published bundle. Installers of the package pull in `mutation-testing-metrics` explicitly. No exported API changes.
