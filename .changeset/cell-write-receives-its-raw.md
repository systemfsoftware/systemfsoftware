---
'@systemfsoftware/effect-cell-types': minor
---

A write phase now receives what its own layer's read gathered, as a second
argument after the encoded output.

This is for the common shape where a write persists or reports on what the read
found while the decision in between narrowed to what it needed. Until now such a
write had no channel for that value, so the layer had to keep it in a mutable
binding beside the description — assigned during the read, read back during the
write — and then guard at runtime against a value that was in fact always there.
The argument replaces that binding and the guard with it.

Writes that do not want the value are unchanged: a write declaring a single
parameter still satisfies the phase type, so nothing you have already written
needs to move.
