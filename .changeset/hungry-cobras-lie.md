---
"@systemfsoftware/effect-spec-runtime": minor
---

An explored case runs its seeded schedules only when its baseline had a choice point, so a choice-free case runs once. Its leak-check second run, on a fresh build, now runs the case once more with no seeded schedules (KernelCase.exploreOnce: the decision path CONFORMANCE_REPLAY names, else the baseline) instead of repeating every seed. A passing case costs 2 kernel runs without a choice point and 252 with one at per-change, where both cost 502 before. State the first run leaves behind still fails the second run as LeakedState; a choice-free case that leaks now reports LeakedState rather than a seed.
