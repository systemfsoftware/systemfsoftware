---
'@systemfsoftware/effect-daemon-spec': none
---

The restart decision's input became a schema class internally. Nothing an adopter can import changed, and every restart verdict is unchanged: the package's declared surface is byte-identical and the input type was never part of it.
