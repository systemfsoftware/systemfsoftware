---
"@systemfsoftware/opt-in": minor
---

Add the `TestProcessSpawn` grant: a package whose test file spawns a process declares the waived `rule`
and the `files` that spawn. The grant projects nothing — it produces no oxlint override and no Effect
plugin block — so declaring it changes only what the package records, never the configuration rendered.
