# AGENTS.md — `@systemfsoftware/stryker-js-mutation-run`

> **Location:** `packages/testing/mutation/stryker-js/mutation-run/` — ours, published from this repo.

Ported from `@stryker-mutator/core`. The contribution gate lives in `@systemfsoftware/stryker-test-contribution`. The base preset turns it on.

Deltas from root:

- This package has no `mutate` list. Do not add a config that mutates nothing.

- **`RunEnvironment` is the host's data, and it is one service.** `src/RunEnvironment.ts` carries what the host resolved before the run — the event sink, run id, resolved mode, the two rendering flags, clock zero, the reporter module list and the reporter override. The container held those as ten string tokens, so every consumer named each member it wanted and every test provided ten bindings to exercise one. Do not reintroduce a per-member projection: `{ runId, … }` is assignable to `{ runId }`, so a narrower tag is a second name for the same capability (`REPO-A3`).
- **There is no shared errors module.** Each directory declares the failures it raises in its own `*.schema.ts`, beside the code that raises them — the pattern `sandbox/parse-config.schema.ts` and `worker-pool/subject-module.schema.ts` already follow. A single `errors.ts` collecting every variant is a grab bag with a respectable name, and the `schema-declaration-location` rule refuses it anyway. Every variant carries its own `exitClass`, so classification travels with the failure instead of living in a switch a new variant can silently miss.
- **A variant earns its place from a branch some caller takes.** Three callers branch: the exit classifier on whether the user must change something, the run broke, or the engine broke; the config reader on absent-versus-present-but-unreadable, because it keeps searching for the first and stops on the second; the plugin loader on the same distinction, because swallowing a load failure hides a plugin's own syntax error behind "not found". A failure nothing distinguishes carries a `cause` rather than earning a tag.
- **Never flatten a cause into a message.** The replaced `StrykerError` interpolated `errorToString(innerError)` into its own message at construction, so every caller downstream received prose where a value had been. Keep the cause on a `cause` member.

🛑 Rebuild (`pnpm build`) after any source change — an unbuilt edit tests the previous version (rationale: `packages/testing/mutation/stryker-js/AGENTS.md`).

🛑 Keep the worker subpath exports (`./checker-worker`, `./child-process-proxy-worker`, `./child-process-test-runner-worker`); worker entrypoints resolve through them.
