---
'@systemfsoftware/effect-daemon-spec': none
'@systemfsoftware/stryker-js-cli': none
'@systemfsoftware/omp-claude-compat': none
---

Lint-config only: each package now delivers `@systemfsoftware/oxlint-plugin-cell-vocabulary` through its own `jsPlugins`, because the aggregate config cannot declare a plugin that depends on the description package without closing a build cycle.

No published behaviour changes — the rule judges these packages' phase bodies at lint time and ships in no artifact.
