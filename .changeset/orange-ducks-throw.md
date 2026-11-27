---
"@systemfsoftware/effect-spec-runtime": minor
---

Adds `sharedLayer(layer)`, exported from the package entry and from `Suite`. Called at module top level, it returns a layer the whole test file shares: built once before the file's first case and released once when the file ends, both with no time limit. A suite's shared layer (`Suite.openShared`, `Suite.openSharedCase`) now runs on the same mechanism: it is built in the suite's setup before its first case starts, with no time limit, rather than by the first case inside that case's timeout, and released with no time limit. A failed shared build fails the setup hook with the build's error, so the cases that use it fail without running, and a shared layer read before its build ran dies with `SharedLayerNotBuilt`, exported from the package entry and from `Suite`. Adds the `TestFile` reference, which holds the running test file's path while a shared layer builds and `''` otherwise.
