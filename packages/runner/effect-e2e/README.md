# @systemfsoftware/effect-e2e

Effect-native end-to-end testing. This package is the runtime-neutral core: a suite's `e2e.config.ts` builds its config with `defineConfig` and the `web()` engine spec, and the runner decodes that plain data once at the edge with `decodeConfig`, failing `ConfigInvalid` with the key path of any unknown or invalid value. Importing the package runs nothing.

## Model calls in `ai-trace.json`

With `aiTrace: true` in the config, `E2E_AI_TRACE=true` in the run's environment, or `effect-e2e run --ai-trace`, every try that does not pass writes `<output>/results/<test>/ai-trace.json` beside its other evidence. The `trace` setting does not decide it: `trace: 'off'` with ai-trace on still writes the file for a failed try, and a passing try never writes one. `E2E_AI_TRACE` accepts `true` or `false`; any other non-blank value refuses the config at `aiTrace`. A run with ai-trace off removes the `ai-trace.json` an earlier run left under `results/`.

The file is JSON with `schema: "ai-trace-1"`, the test's `id` and `title`, `target`, `agent`, `retry`, and `calls`: one entry per model call the try made, in order, each with the `step` it belongs to (`step-1` is the try's first step), the `request` (model, system prompt, messages, tools offered, tool choice, output budget), and an `outcome`:

- `Answered`: the answer (text or tool calls), `finishReason`, `usage`, the `served` model and `latencyMillis`;
- `Failed`: the model failure's `code` and `message`;
- `Interrupted`: the try ended while the call was still waiting;
- `Died`: the gateway failed unexpectedly, with the rendered `cause`.

Calls made to classify a failure are recorded under the step that failed. A screenshot sent to the model is recorded as its `mediaType` and byte count, never its data. Every object key and string in the file is masked with the `secrets` the try holds, before the JSON is written, so a held value appears as `[secret:<name>]` and never in raw or JSON-escaped form. As in `trace.md` and `screen.txt`, a held value that is part of its own mask text stays visible, and text not declared under `secrets` is written as the page and model gave it. Tries of one test share its result directory, so the last failing try's file is the one kept; `retry` says which it was.

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/runner/effect-e2e#readme).
