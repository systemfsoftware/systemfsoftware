---
'@systemfsoftware/all': none
'@systemfsoftware/effect-schema-bounded-union': none
'@systemfsoftware/effect-schema-discovery': none
'@systemfsoftware/effect-schema-refutation-vite': none
'@systemfsoftware/npm-package': none
'@systemfsoftware/omp-typescript-discipline': none
---

Nothing changes for a consumer. Adding `@noble/hashes` as a direct dependency
elsewhere in the workspace changed the peer-resolution key recorded for
`jsdom`, which rewrites every `vitest` version string that mentions it. These
packages resolve that key through their test tooling only; no file any of them
ships was touched, and no exported name, type or behaviour moved.
