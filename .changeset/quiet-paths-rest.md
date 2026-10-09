---
"@systemfsoftware/oxlint-config-recommended": patch
---

`effecttsgo/unstable-api-usage` is now off for every file the config lints. Before, scripts, dev tools and other files outside the library, test and example patterns still reported a use of an unstable Effect module as an error.
