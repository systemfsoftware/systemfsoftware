---
"@systemfsoftware/opt-in": minor
---

Add the `PresetNarrowing` grant: a published oxlint configuration declares a rule it enables only
inside some overrides, withholds from some globs, or enables with an option that exempts names or
paths. The grant names the `rule` and the `files` globs the narrowing covers, so a configuration's
scope exceptions become declared, owned, reasoned values rather than silent omissions.
