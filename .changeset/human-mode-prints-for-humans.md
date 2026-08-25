---
"@systemfsoftware/stryker-js-mutation-run": minor
"@systemfsoftware/stryker-js-cli": minor
---

Asking for human output now produces some.

A run told to address a person wrote nothing at all to standard output: the
progress prose went to standard error, and the machine stream reporter — which
exists to feed the machine-readable channel — stayed selected even though no
such channel was open. Human runs now print the progress prose and the score
table where you would expect to read them, and the machine stream reporter is
selected only for the machine channel; any other reporter you configured, such
as `html` or `json`, still runs in both.

Colour follows the `NO_COLOR` convention: set it to any non-empty value and
neither descriptor receives an escape sequence. The machine channel is never
coloured.

Machine output is unchanged — standard output remains the newline-delimited
stream and nothing else, with the engine's log lines on standard error.
