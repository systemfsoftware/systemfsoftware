## 10.3.0

### Minor Changes

- Cell spans now carry the cell name, the command tag, member tags, declared instrumentation fields, the outcome, and the call stacks where the cell and its workflow were written (`cell.stacktrace`, `cell.decide_stacktrace`), so a failure record can name the decision that caused it. A workflow's schemas expose `decideStacktrace`. `CommandRejected` now has a message.
