---
"@systemfsoftware/stryker-js-cli": patch
---

`--help` reads the four defaults it quotes from the option schema, so a default
that changes can no longer leave the help text describing the old one.
