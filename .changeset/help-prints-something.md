---
'@systemfsoftware/stryker-js-cli': patch
---

Asking the tool for help, asking which version it is, or invoking it with no arguments at all, now prints something. All three were silent: no text on a terminal, and no closing line for a consumer parsing the output. Asking for the version was additionally reported as a usage mistake and exited non-zero.

Each now renders its text to a terminal as prose, and to a parsed stream as the run's final `help` line carrying exit code 0 and the rendered text. An undeclared option is still refused.
