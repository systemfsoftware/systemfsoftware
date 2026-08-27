# AGENTS.md — `omp/plugins/`

> **Location:** `omp/plugins/` — packages the OMP host loads as extensions. This leaf carries only
> what the **host's load model** makes true here, which nothing in this repo's source can show you.

## The load model (why every rule below exists)

Plugin manifests, `pi.on` handlers, link/release flows → load `skill://omp-plugin-development` first.

Verified against `@oh-my-pi/pi-coding-agent@17.0.5`:

| Fact                                                                                               | Source                                                              | Consequence                                                                                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| The host re-imports each entry per session, appending a `?mtime=<tag>` cache-bust to the specifier | `src/extensibility/plugins/legacy-pi-compat.ts:1592`                | Your **factory body runs once per session** — main session and every task subagent                   |
| Chunks the entry imports carry no query                                                            | ESM registry keys on resolved URL                                   | Their **module top level runs once per process**; the values they export are shared by every session |
| The host awaits the factory                                                                        | `src/extensibility/extensions/loader.ts:328` (`await factory(api)`) | An `async` factory is supported; work done there blocks startup                                      |
| `session_shutdown` fires per session, including a subagent's                                       | `src/session/agent-session.ts:6867`, `src/task/executor.ts:1983`    | A subagent ending emits it **while the main session is still live**                                  |

Factory body = per session. Module top level = per process. Confusing the two is the defect class this leaf exists to prevent.

## Mandates

```yaml
- id: PLG1
  title: Process-lifetime wiring goes at module top level, never in the factory or a helper it calls
  do: register `process.on`/`process.once` handlers, and construct any process-wide singleton, at the top level of the cached module that owns the resource
  dont: register a signal handler, or construct process-wide state, inside the default-export factory or inside a helper the factory invokes
  harm: the factory runs once per session, so every subagent adds another listener against the one shared instance — measured 2 listeners after 2 loads, and a MaxListenersExceededWarning past ten subagents
  check: "`grep -n 'process\\.on\\|process\\.once' omp/plugins/*/src/*.ts` — review that every hit sits at module top level, never inside a function the factory calls"

- id: PLG2
  title: NEVER dispose a shared runtime from a per-session event
  do: let a process-cached `ManagedRuntime` be disposed only by a process-level signal, or give it a refcount if a session must be able to release it
  dont: call `runtime.dispose()` from `session_shutdown`, `session_stop`, or any other per-session handler
  harm: "`dispose()` is terminal and the runtime is shared, so one subagent finishing poisons every live session — the main session's next keystroke throws `ManagedRuntime disposed`. This shipped."
  check: "`grep -rn 'dispose' omp/plugins/*/src/*.ts` — review that no hit sits inside a per-session `pi.on(...)` callback"

- id: PLG3
  title: Registration must complete before the factory's promise settles — order is load-bearing
  do: call every `pi.on(...)` before the default export resolves, and register the highest-precedence blocker first
  dont: register from a `.then()` you never await, from a timer, or after the returned promise settles
  harm: "unregistered handlers are silently never collected; a late-registered blocker loses because the runner short-circuits on the first `{ block: true }`"
  check: "run `node omp/scripts/smoke-plugin.mjs omp/plugins/<name>/dist/index.js` — every expected event name appears in the handler list"

  do: warm after `session_start` via `@systemfsoftware/omp-runtime` (`warmRuntimeAfterStart` / `lazyRunSafe`)
  title: NEVER warm a runtime inside the factory
  dont: await runtime construction, or statically import a platform-node layer, in the factory body
  harm: the host awaits the factory, so layer evaluation lands on the startup path — measured ~30s
  check: "`grep -n 'await import(' src/index.ts` accounts for every runtime-module import, each inside a callback; a top-level `import` of the runtime module is the violation"
```

## Failure Modes

| Symptom                                                                       | Cause                                                                       | Fix                                                                           |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `error TS2769: No overload matches this call` on `pi.on(...)`                 | OMP installed a stricter `ExtensionHandler` overload than the source pinned | Type-narrow the handler locally; never change the pi.on signature             |
| Workflow tests pass but `pnpm check` reports `pure-core` mutations unkillable | A workflow swallowed a typed error into `null` (unfalsifiable code path)    | Surface the error variant in the error channel; let the executor branch on it |

## Verifying a lifecycle change

```bash
pnpm turbo build --filter '@systemfsoftware/omp-claude-compat'
# load dist/index.js twice under distinct ?mtime= tags, emit session_shutdown on
# the second, then emit an event on the first — it must still answer.
```
