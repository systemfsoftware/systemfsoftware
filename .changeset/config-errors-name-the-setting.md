---
'@systemfsoftware/stryker-js-platform-node': patch
'@systemfsoftware/stryker-js-cli': patch
---

A setting given a value it does not allow now says which setting and what it accepts, and stops the run before anything is instrumented. It used to surface the raw decode failure with an internal stack trace, point the reader at a report the run never wrote, and exit as though the run itself had failed rather than the configuration.

The message names the option and its accepted form, the remediation points at the config file, and the exit code is the one reserved for a configuration mistake.
