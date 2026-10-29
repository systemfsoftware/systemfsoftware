---
"@systemfsoftware/effect-atom": patch
---

An accumulating `Atom.pull` keeps the longest batch it has delivered, so concurrent pulls that finish out of order no longer leave the atom on an older, shorter batch.
