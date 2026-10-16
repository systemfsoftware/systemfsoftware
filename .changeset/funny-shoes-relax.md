---
"@systemfsoftware/oxlint-config-recommended": patch
---

The recommended config now turns `effecttsgo/unstable-api-usage` off instead of setting it to `warn`. Its warnings no longer print; a warning never failed a lint run, so no run that passed now fails or the other way round.
