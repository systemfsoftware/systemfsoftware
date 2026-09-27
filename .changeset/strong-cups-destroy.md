---
"@systemfsoftware/effect-sim-kernel": minor
---

A completed run reports `leftRunning`: every fiber still unfinished when the root exited, innermost frame first. An `Interruption` accepts `holds`, which interrupts the target only when it accepts the scope the target runs in. Fixed: a resume the kernel queued after another call had already consumed the fiber's suspension no longer delivers `undefined` to a later suspension, so a finalizer racing a stop resolves as it does on Effect's own runtime.
