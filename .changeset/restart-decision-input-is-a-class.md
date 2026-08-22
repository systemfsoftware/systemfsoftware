---
'@systemfsoftware/effect-daemon-spec': major
---

`DecideInput` is now a schema class rather than a struct schema paired with a derived type. Construct it with `DecideInput.make({ ... })` or decode into it; an object literal is no longer accepted where the restart decision is invoked.

Its fields, bounds and the cross-field rule that a failed child's index must address a child that exists are all unchanged, and so is every decision the restart law makes.

`RestartDecisionOutcome` is a new export naming what the restart decision returns, for callers that previously had to reconstruct that type themselves.
