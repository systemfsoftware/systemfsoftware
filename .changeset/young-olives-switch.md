---
"@systemfsoftware/stryker-config": patch
---

The `@systemfsoftware/stryker-js` peer range now accepts 18 and 19 as well as 17. A consumer on either installs without a peer-dependency warning, and without a failed install under `strictPeerDependencies`. The shared config is unchanged: every option it sets has the same schema in stryker-js 17, 18 and 19.
