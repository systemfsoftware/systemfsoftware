---
"@systemfsoftware/stryker-js-cli": major
---

RunOutcome now places the genuine verdicts (RunParseFailed, RunSurvivorsRejected, RunConfigFailed, RunFailed) on the decision channel as a branded tagged union; RunInterrupted remains a failure. Output.workflow resolves a branded HumanOutput|MachineOutput union instead of a plain record
