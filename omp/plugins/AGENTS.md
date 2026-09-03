# AGENTS.md — `omp/plugins/`

Packages the OMP host loads as extensions. Plugin manifests, `pi.on` handlers, link/release flows: load `skill://omp-plugin-development` first. Root `AGENTS.md` governs.

## The load model (why every rule below exists)

Verified against `@oh-my-pi/pi-coding-agent@17.0.5` (vendored: `repos/oh-my-pi/`):

- The host re-imports each entry per session with a `?mtime=<tag>` cache-bust (`src/extensibility/plugins/legacy-pi-compat.ts:1592`) — the **factory body runs once per session**, main session and every task subagent.
- Chunks the entry imports carry no query — **module top level runs once per process**, and its exports are shared by every session.
- The host awaits the factory (`src/extensibility/extensions/loader.ts:328`) — work done there blocks startup.
- `session_shutdown` fires per session, including a subagent's (`src/session/agent-session.ts:6867`) — a subagent ending emits it **while the main session is still live**.

Factory body = per session. Module top level = per process. Confusing the two is the defect class this leaf exists to prevent.

## Rules

| ID       | Rule                                                                                                                                                                                                                                                                                                                                                   | Gate                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PLG1** | Process-lifetime wiring goes at module top level, never in the factory or a helper it calls: `process.on`/`process.once` handlers and process-wide singletons live at the top level of the cached module that owns the resource. The factory runs once per session, so every subagent otherwise adds another listener against the one shared instance. | `grep -n 'process\.on\|process\.once' omp/plugins/*/src/*.ts` — review that every hit sits at module top level                                                       |
| **PLG2** | NEVER dispose a shared runtime from a per-session event: a process-cached `ManagedRuntime` is disposed only by a process-level signal, or given a refcount if a session must release it. `dispose()` from `session_shutdown` poisons every live session — the main session's next keystroke throws `ManagedRuntime disposed`.                          | `grep -rn 'dispose' omp/plugins/*/src/*.ts` — review that no hit sits inside a per-session `pi.on(...)` callback                                                     |
| **PLG3** | Registration completes before the factory's promise settles: call every `pi.on(...)` before the default export resolves, highest-precedence blocker first — never from an unawaited `.then()`, a timer, or after the promise settles (a late-registered blocker loses; the runner short-circuits on the first `{ block: true }`).                      | `node omp/scripts/smoke-plugin.mjs omp/plugins/<name>/dist/index.js` — every expected event name appears in the handler list                                         |
| **PLG4** | NEVER warm a runtime inside the factory — the host awaits it, so layer evaluation lands on the startup path. Warm after `session_start` via `@systemfsoftware/omp-runtime` (`warmRuntimeAfterStart` / `lazyRunSafe`); never statically import a platform-node layer in the factory body.                                                               | `grep -n 'await import(' src/index.ts` accounts for every runtime-module import, each inside a callback; a top-level `import` of the runtime module is the violation |

## Failure Modes

| Symptom                                                                       | Cause                                                                       | Fix                                                                           |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `error TS2769: No overload matches this call` on `pi.on(...)`                 | OMP installed a stricter `ExtensionHandler` overload than the source pinned | Type-narrow the handler locally; never change the `pi.on` signature           |
| Workflow tests pass but `pnpm check` reports `pure-core` mutations unkillable | A workflow swallowed a typed error into `null` (unfalsifiable code path)    | Surface the error variant in the error channel; let the executor branch on it |

## Verifying a lifecycle change

```bash
pnpm turbo build --filter '@systemfsoftware/omp-claude-compat'
# load dist/index.js twice under distinct ?mtime= tags, emit session_shutdown on
# the second, then emit an event on the first — it must still answer.
```
