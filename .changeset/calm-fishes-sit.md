---
"@systemfsoftware/conformance-spec": minor
---

New package: concurrency conformance checks for Effect v4, run on `@systemfsoftware/effect-sim-kernel`. `Conformance.linearizable(implementation, spec)` forks workers that issue generated commands through the real implementation and judges every history the kernel's preemption-bounded search produces against a pure model. `Conformance.sequential(implementation, spec)` compares generated command sequences with the model on one fiber and names the first step the model stops explaining. `Conformance.released(program, { probe })` interrupts the program at every step and fails at the first step whose interruption leaves the resource held. Commands are generated from an Effect Schema; a failure shrinks to a minimal schedule and command sequence; every report states the bound it explored; and `Conformance.render` prints a report as text. All three checks are dual.
