---
"@systemfsoftware/effect-e2e": minor
---

A try that does not pass writes `ai-trace.json` into its result directory when ai-trace is on: the config's new `aiTrace` key (default `false`), or `E2E_AI_TRACE=true|false` in the run's environment (`RUN_OVERRIDE_ENV.aiTrace`), which overrides it; any other non-blank value refuses the config at `aiTrace`. The file (`schema: "ai-trace-1"`) lists every model call of the try with its step, the request with screenshots reduced to their byte count, and its outcome (`Answered`, `Failed`, `Interrupted` or `Died`), with every held secret masked as `[secret:<name>]`; it is written whatever the `trace` setting, `trace.md` links it, and a store that refuses it adds `ARTIFACT_WRITE_FAILED` to the attempt. A run with ai-trace off removes the `ai-trace.json` an earlier run left under `results/`.
