---
'@systemfsoftware/stryker-js-cli': patch
---

Asking the tool for help, or invoking it with no arguments at all, now prints something. Both were silent: no usage text on a terminal, and no closing line for a consumer parsing the output. The usage text now goes to a terminal as prose, and to a parsed stream as the run's final `help` line carrying exit code 0.
