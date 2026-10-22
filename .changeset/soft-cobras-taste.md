---
"@systemfsoftware/effect-e2e": minor
---

New package: an Effect-native end-to-end runner. `effect-e2e init` scaffolds a suite, `effect-e2e run` decodes `e2e.config.ts` at the edge (unknown keys and bad values fail `CONFIG_INVALID` with the key path), runs the selected `.e2e.ts` files in-process, writes a `report-1` document to `.e2e/report.json`, and exits 0/1/2/3/4/130.
