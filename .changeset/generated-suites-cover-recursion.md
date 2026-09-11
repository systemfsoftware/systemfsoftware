---
"@systemfsoftware/effect-schema-vite": minor
"@systemfsoftware/stryker-js-instrumenter": none
"@systemfsoftware/stryker-js-typescript-checker": none
"@systemfsoftware/stryker-js-vitest-runner": none
"@systemfsoftware/stryker-test-contribution": none
"@systemfsoftware/all": none
"@systemfsoftware/arethetypeswrong": none
"@systemfsoftware/arethetypeswrong-cli": none
"@systemfsoftware/effect-schema-discovery": none
---

Generated law suites now also carry the generation laws of every recursive schema the package exports, beside the existing round-trip pair.

The plugin also materializes the ceilings those schemas declare: a recursion point that states its generation budget gets the derivation that honors it, so registering this plugin alone is enough for the declared laws to hold.
