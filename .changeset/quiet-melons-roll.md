---
"@systemfsoftware/effect-sim-kernel": minor
---

New `local` conformance profile (`CONFORMANCE_PROFILE=local`): seeded runs use `Kernel.localSeeds` (25) instead of 250, and `Kernel.preemptionsFor` / `Kernel.currentPreemptionsFor` cap a search's preemption bound at `Kernel.localPreemptions` (1). An unset profile is still `per-change`, and `Kernel.search` itself is never capped.
