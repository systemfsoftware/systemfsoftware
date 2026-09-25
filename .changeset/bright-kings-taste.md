---
"@systemfsoftware/effect-sim-kernel": minor
---

The `nightly` profile is removed. `ProfileName` is now `'local' | 'per-change'`, and `CONFORMANCE_PROFILE=nightly` falls back to `per-change` (250 seeds) instead of deriving a seed count from a 1% miss rate. Callers passing `'nightly'` to `Kernel.seedsFor` no longer type-check.
