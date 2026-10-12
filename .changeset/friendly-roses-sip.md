---
"@systemfsoftware/effect-daemon-spec": patch
---

A supervisor timer elapse is told apart from a child timer by its target variant instead of by an empty child id, so a child whose id is the empty string is no longer handled as the supervisor's own timer.
