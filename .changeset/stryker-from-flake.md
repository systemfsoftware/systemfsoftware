---
"@systemfsoftware/stryker-config": patch
"@systemfsoftware/trace-spec": none
"@systemfsoftware/differential-spec": none
---

stryker-config's optional `@systemfsoftware/stryker-js` peer now accepts any version from 17.0.0 on, including the 22.x tree Stryker's flake package links. trace-spec and differential-spec run Stryker from that flake package and name its plugins by bare name; nothing they publish changes.
