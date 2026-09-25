---
"@systemfsoftware/effect-cell-types": minor
---

Cell spans now carry the cell name, the command tag, member tags, declared instrumentation fields, the outcome, and the sites where the cell and its workflow were written, so a failure record can name the decision that caused it. `CommandRejected` now has a message.
