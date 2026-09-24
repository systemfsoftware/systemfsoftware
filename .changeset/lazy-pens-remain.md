---
"@systemfsoftware/conformance-spec": minor
---

`Conformance.linearizable` searches at the preemption bound of the current conformance profile: under `CONFORMANCE_PROFILE=local` a check's `preemptions` is capped at 1, and shrinking re-searches at that same bound. `per-change` and `nightly` keep the bound the check asks for.
