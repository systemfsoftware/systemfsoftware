---
'@systemfsoftware/stryker-js-plugin-api': major
'@systemfsoftware/stryker-js-mutation-run': major
---

Timeout options now take the values they document. `timeoutFactor`, `timeoutMS` and
`dryRunTimeoutMinutes` arrived unset whenever a configuration left them out, so the
initial test run was given a budget of one millisecond and every run ended with "Initial
test run timed out" before testing anything. A run that leaves them out now gets the
documented 1.5, 5000 and 5

Configuration is validated against the same declaration that supplies the defaults, so a
default can no longer go missing while the option that documents it stays listed. Invalid
configurations still report every offending option in one pass, and options contributed
by plugins are still accepted

`dashboard` and `eventReporter` are no longer accepted. The reporters they configured
were already removed, and the two names were already rejected on sight, so a
configuration setting either has been failing; they are now absent from the option set
as well. Remove them from your configuration — to publish a report, write the `json` or
`html` report and publish it yourself

One fewer package is installed alongside these
