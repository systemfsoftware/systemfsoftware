---
"@systemfsoftware/effect-sim-kernel": minor
---

Kernel runs in one process queue behind each other in arrival order instead of refusing a second run that starts while one is live. New `Kernel.isStepping()` returns true only while the kernel is executing a step of a run.
