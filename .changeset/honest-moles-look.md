---
"@systemfsoftware/effect-contract": minor
---

Add the CLI surface at `@systemfsoftware/effect-contract/cli`: `commandOf(registry)` derives one subcommand per capability and a flag for each input field, and renders the answer census as human text or `--json`. The process exit code is 0 for a completed or accepted answer, 2 for a rejected input, 3 for a refusal, and 5 for an unavailable capability, and a durable write prints the command that reads the operation it started.
