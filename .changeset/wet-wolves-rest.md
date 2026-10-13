---
"@systemfsoftware/effect-spec-runtime": patch
---

Seeded schedules place their priority change points among the case's explored decisions instead of across every step including the layer build, so a change point no longer falls where no choice is made. A two-fiber lost update behind a layer build was found by 70 of 1,000 seeds instead of 32. A saved CONFORMANCE_REPLAY value with a decision path still reproduces; a seed-only value replays a different schedule.
