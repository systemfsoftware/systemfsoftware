---
"@systemfsoftware/stryker-js-instrumenter": major
---

Parse, transform and mutant-placement failures now carry a message naming the
file and what went wrong, and their `cause` survives being written to JSON — so
a failure that crossed a process boundary no longer arrives blank.

Every error tag is now qualified, which is what makes two identically named
errors from different packages distinguishable.

`MutantPlacementFailed` is removed; it was a second name for `PlacementFailed`
and had no constructor anywhere. Match `PlacementFailed`.
