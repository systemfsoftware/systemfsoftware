---
"@systemfsoftware/stryker-js-typescript-checker": major
---

The checker service no longer declares `init`. The initial dry-run
compilation now runs while the plugin layer is constructed; a failing
compilation surfaces as a typed plugin-build error at startup instead of
an error on the first check.
