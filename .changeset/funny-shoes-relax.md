---
"@systemfsoftware/oxlint-config-recommended": patch
---

The recommended config now turns effecttsgo/unstable-api-usage off instead of setting it to warn. A warning failed no lint run, so the only observable change is that those warnings no longer print.
