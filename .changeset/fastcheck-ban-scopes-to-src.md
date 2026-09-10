---
"@systemfsoftware/oxlint-plugin": patch
"@systemfsoftware/oxlint-plugin-property-testing": patch
---

The require-effect-fastcheck rule now scopes its fast-check import ban to files under a src folder. Test bootstrap files and scripts may import fast-check to set the global property run count; sources under src must still pass Effect Schemas directly to property tests.
