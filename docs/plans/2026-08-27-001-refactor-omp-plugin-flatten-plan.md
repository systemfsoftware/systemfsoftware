---
title: OMP Plugin Flatten and Recompose - Plan
type: refactor
date: 2026-08-27
topic: omp-plugin-flatten
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
supersedes_work_remaining: docs/plans/2026-08-26-001-refactor-omp-plugin-sandwich-plan.md (executed; commit 3bf1dfefe8)
---

# OMP Plugin Flatten and Recompose - Plan

## Goal Capsule

- **Objective.** Flatten and recompose the two OMP host extensions: the suffix-sprawl file layout (~60 files in `omp-claude-compat`, 17 in `omp-agent-discipline`) becomes flat capability modules; the duplicated per-plugin kernel (two runner abstractions, two hand-rolled runtimes, duplicated warm wiring) becomes one platform kernel; the Claude settings lookup becomes a substitutable source policy; dead and shim paths die in the same recomposition.
- **Authority.** Root `AGENTS.md` (`REPO-A1`: the only suffixes are `.workflow.ts` and `.schema.ts`, and neither grants powers; `REPO-A2` Wlaschin; `DEL1` no traces) > `CONSTITUTION.md` > `omp/plugins/AGENTS.md` (`PLG1`–`PLG4`) > this plan. `omp/AGENTS.md` is DELETED by this plan (user directive 2026-08-27: "Garbage. Subtract instead" — its DMMF table conflicted with `REPO-A1`, its TaggedError rule is generic Effect doctrine, and every other line had an owner elsewhere).
- **User directive (2026-08-27).** "Stop keep file structure same. Flatten it and re-compose." Supersedes any preservation instinct in the round-1 plan's file lists.
- **Execution profile.** Deep cutover on `refactor/omp-plugin-sandwich`, continuing from checkpoint `3bf1dfefe8`. One PR. `repos/` read-only.
- **Tail ownership.** Implementer owns verification; human owns merge.

---

## Product Contract

### Summary

Each plugin is a handful of flat capability modules — `settings`, `hooks`, `wire`, `doctrine`, `delegation` — plus the three entry files the exports map already names. Decisions stay `.workflow.ts`, declarations stay `.schema.ts`, and no other suffix exists. One kernel in `omp-platform` owns runtime bootstrap, signal disposal, `runSafe`, and ordered extension registration. The Claude settings lookup is a declared source policy consumed by the load description and the gaps report alike.
- KDD1. **The kernel is two functions, not a framework** (2026-08-27, user: "SUBTRACT AGGRESSIVE AND RE-ARCHITECT"). A first cut shipped `defineOmpExtension` — a generic factory with register arrays and lazy `runSafe` delegation — plus Gherkin features for registration order. Conformance finding against `REPO-A2`/`CONST-S3`: no second implementation, no impurity that two plain factory entries do not already carry; the factory existed to make entries look declarative, and its tests were ceremony on a for-loop. `defineOmpExtension` and all kernel Gherkin files deleted. Kernel = `bootstrapPluginRuntime` (ManagedRuntime + top-level signal disposal + runSafe) + `lazyRunSafe` (3-line event-time delegation). Entries stay plain async factories; the two-session proof lives in the plugin smoke ritual (`omp/plugins/AGENTS.md`), where `PLG2` puts it.

- KDD2. **`omp-platform` was `omp-utils` reborn and is deleted** (2026-08-27, user: "OMP-PLATFORM IS THE SAME AS OMP-UTILS A GRAB BAG" / "SYSTEMFSOFTWARE.TOML HAS NOTHING TO DO WITH OMP" / "systemfsoftware toml is an IMPLEMENTATION OF A PORT"). It fused the harness-policy capability with the OMP process model under a shapeless name. Correct decomposition by capability: **`@systemfsoftware/effect-harness-policy`** (`packages/core/effect/policy`) owns the `HarnessPolicy` port ("what is this setting") with the layered `systemfsoftware.toml` reader as one live adapter (`HarnessPolicyLive`, `HARNESS_POLICY_HOME` anchor); **`@systemfsoftware/omp-runtime`** (`omp/packages/omp-runtime`) owns the extension runtime kernel (`bootstrapPluginRuntime`, `lazyRunSafe`, `warmRuntimeAfterStart`). `omp-platform` is removed; both plugins depend on the two packages and bundle both.

- KDD3. **A plugin is a composition root: no subpath exports** (2026-08-27, user: "This a plugin. it shouldnt have subpath exports. thats for a library" / "Or you actually extract into SEPARATE PACKAGES"). `./api` and `./inject` on the plugin packages were library-shaped escapes giving internals a public name. The plugins' export surface is `.` — the host entry — plus `./package.json`. Every capability a behaviour test proves is extracted into its own library package, where subpaths and package-name test imports are legitimate: `packages/core/claude/{settings,hooks,wire,inject}` (`@systemfsoftware/claude-*`) and `packages/core/agent/discipline` (`@systemfsoftware/agent-discipline`). Each plugin root shrinks to `index.ts` (factory + registration) and `runtime.ts` (layer graph over the library ports). The `tests-import-public-api` rule stands unmodified — it now names packages that exist.

The sandwich cutover fixed the semantics and left the shape rotten:

- `omp-claude-compat/src` carries ~60 files: 35 top-level plus `internal/` (20) plus `wire/` (8), averaging under 4KB each — one DMMF role per file, plus re-export shims (`NoSkillDelegation.schema.ts`, `DispatchDoctrine.schema.ts`, the `mergeSettings` line in `HookSettings.ts`), micro-barrels (`HookRunner.ts` 146B, `RunSafe.ts` 262B, `HookOutput.ts` 237B), and one dead duplicate pipeline (`internal/LoadSettingsExecutor.ts` — zero importers).
- Two hand-rolled runner abstractions (`HookRunner` vs `RunSafe`+`RunSafePolicy`) and two runtime modules with divergent lifecycle discipline: `HookRuntime.ts` disposes on signal, `Runtime.ts` never disposes and constructs `NodeFileSystem.layer` twice in one graph.
- The settings lookup policy — ordered managed/user/project/plugin sources — is hardcoded in `SettingsPaths.ts` + `ClaudeSettingsLive`; `gaps()` bypasses the port's description and re-derives paths itself.

### Key Decisions

- KD1. **Flatten to capability modules; only `.workflow.ts` and `.schema.ts` survive as suffixes** (`REPO-A1`). Entry files (`index.ts`, `api.ts`, `inject.ts`) keep their names — the exports map points at them (`REPO-S4`: touch `tsdown.config.ts` entry names only if needed; they are unchanged).
- KD2. **One kernel in `omp-platform`**: `bootstrapPluginRuntime` (ManagedRuntime + top-level signal disposal + the one `runSafe`), `defineOmpExtension` (ordered lazy registration + warm-after-start). Both plugins consume; no plugin owns a runner or a runtime graph again. `PLG1`–`PLG4` hold by construction: signal handlers register when the consumer's `runtime.ts` module top level calls `bootstrapPluginRuntime`; the factory never imports the runtime eagerly.
- KD3. **Settings lookup is a substitutable policy.** A `ClaudeSettingsSources` port returns the ordered source list (label, path, managed) including plugin-hook files; `ClaudeSettings.load` and `gaps` both consume it. No module outside the live policy names `/etc/claude-code` or `.claude/settings` paths.
- KD4. **RPC stays deferred, with the seam named.** `effect/unstable/rpc` exists in the pinned `effect@4.0.0-rc.111` (vendored: `repos/effect/packages/effect/src/unstable/rpc/`), but in-process there is one implementation and Wlaschin's test (`REPO-A2`) refuses the abstraction. The `Workflow.make` command classes are already schema'd data — they are the seam. **Reversing observation:** a second transport (worker host, socket) is the trigger; mounting the command schemas on `RpcSchema` is then additive. Recorded here per `REPO-W8`.

### Requirements

- R13. **Flat shape.** No directories under either plugin's `src/` except `__tests__` fixtures where tests already live. Module names are capabilities (`settings`, `hooks`, `wire`, `events`, `doctrine`, `delegation`, `xd-retry`, `runtime`). The only suffixes are `.workflow.ts` (decisions) and `.schema.ts` (declarations) — `REPO-A1`.
- R14. **One kernel.** `omp-platform` owns runtime bootstrap, signal disposal, `runSafe`, and ordered registration. Both entries consume it. `RunSafe.ts`, `RunSafePolicy.ts`, `HookRunner.ts` are deleted, not renamed.
- R15. **Settings policy substitutable.** `load` and `gaps` flow through the same source-list port; the path constants live only in the live policy implementation.
- R16. **Dead and shim paths gone.** `LoadSettingsExecutor.ts`, both `.schema.ts` re-export shims, the `HookSettings.ts` re-export line, mismatched `InstanceType` export names — deleted/aligned. `DEL1`: `git grep` for each removed name prints zero lines.
- R17. **Layer graphs construct each platform layer once.** Discipline's runtime builds `NodeFileSystem.layer`/`Path.layer` exactly once and shares them with `ProjectConfigLive`.
- R18. **Behaviour preserved.** Every existing test (122 claude-compat, 66 discipline) passes with import updates only where paths moved; public exports of `.`, `./api`, `./inject` are byte-identical in surface (same names, same signatures).
- R19. **Instruction surface subtracts.** `omp/AGENTS.md` is deleted; its earned survivors (skill trigger, smoke/link commands, two failure-mode rows) fold into `omp/plugins/AGENTS.md`, which keeps only host-load-model facts, `PLG1`–`PLG4`, and the verify ritual. Net line delta on the omp instruction surface is negative.

### Acceptance Examples

- AE5. **Fresh eyes test** (covers R13). A reader who has never seen the tree can enumerate what `omp-claude-compat` does from `ls src/`: `index`, `api`, `inject`, `runtime`, `events`, `settings*`, `hooks*`, `wire`.
- AE6. **One runner** (covers R14). `git grep -n 'RunSafePolicy\|HookRunner' omp/` → zero hits; both entries call `defineOmpExtension`.
- AE7. **Policy substitution** (covers R15). A test provides a fake `ClaudeSettingsSources` (memfs + one custom source) and `load` returns its snapshot with no filesystem read of the default paths.
- AE8. **Two-session survival** (covers R14, per `omp/plugins/AGENTS.md`). Smoke tool loads each dist entry twice under distinct `?mtime=` tags; the second session's `session_shutdown` does not break the first.

### Scope Boundaries

- Deferred: RPC mount (`KD4`); `omp-typescript-discipline` (rules package, not a host extension); Cell.Phases ceremony sugar in `effect-cell-types` (taste, not rot — separate change if wanted).
- Outside identity: editing `repos/`; changing published export names.

---

## Implementation Units

### U1. Platform kernel (`omp-platform`)

- **objective.** `bootstrapPluginRuntime`, `RunSafe`, `defineOmpExtension` exist in `omp-platform` with tests proving two-session survival and registration order.
- **write_scope.** `omp/packages/omp-platform/src/**`, `omp/packages/omp-platform/tests/**`, `omp/packages/omp-platform/package.json`.
- **approach.** New `src/runtime.ts`: `RunSafe` type + `bootstrapPluginRuntime(layer)` — `ManagedRuntime.make`, `process.once('SIGINT'|'SIGTERM', dispose)` at call time (consumer calls it at module top level → `PLG1`), returns `{ runtime, runSafe }` where `runSafe` runs `Effect.exit` and squashes failures. New `src/extension.ts`: `defineOmpExtension({ register: readonly (() => Promise<(pi, runSafe) => void>)[], runtime: () => Promise<unknown> })` — awaits each register in order (`PLG3`), wires `warmRuntimeAfterStart` once (`PLG4`), resolves only after registration. Re-export from `mod.ts`.
- **verify_commands.** `pnpm --filter @systemfsoftware/omp-platform test`; `pnpm --filter @systemfsoftware/omp-platform exec tsc --noEmit`.
- **acceptance.** Kernel test loads a fake entry twice with `?mtime=` tags, emits `session_shutdown` on the second, asserts the first still answers; a registration-order test asserts the first blocker registers first.
- **rollback.** `git checkout HEAD -- omp/packages/omp-platform`.

### U2. Discipline flatten (`omp-agent-discipline`)

- **objective.** 17 files → 8 flat modules, kernel-consumed, single-layer runtime.
- **write_scope.** `omp/plugins/omp-agent-discipline/src/**`, `omp/plugins/omp-agent-discipline/tests/**`.
- **target map.** `doctrine.workflow.ts` ← `DispatchDoctrine.workflow.ts` + `DispatchDoctrine.ts` (pure helpers); `doctrine.ts` ← `DispatchDoctrineExecutor.ts` + `DispatchDoctrineHandler.ts`; `delegation.workflow.ts` ← `NoSkillDelegation.workflow.ts`; `delegation.ts` ← `NoSkillDelegationExecutor.ts` + `NoSkillDelegationHandler.ts`; `xd-retry.ts` ← `XdRetryGuardMiddleware.ts`; `runtime.ts` ← `Runtime.ts` (single `NodeFileSystem.layer`/`Path.layer`, `bootstrapPluginRuntime`, exports `runSafe` + scope layer for tests); `index.ts` ← `defineOmpExtension` with ordered register list (doctrine first — `PLG3`); `api.ts` unchanged exports (runSafe from `runtime.ts`). Delete: both `.schema.ts` shims, `RunSafe.ts`, `RunSafePolicy.ts`, `Runtime.ts`, `DispatchDoctrine.ts`, old suffixed files.
- **verify_commands.** `pnpm --filter @systemfsoftware/omp-agent-discipline test`; `pnpm --filter @systemfsoftware/omp-agent-discipline exec tsc --noEmit`.
- **acceptance.** 66 tests green with only import-path changes; `ls src/` shows exactly the 8 modules; `git grep -n 'RunSafePolicy\|NoSkillDelegation.schema\|DispatchDoctrine.schema'` empty.
- **rollback.** `git checkout HEAD -- omp/plugins/omp-agent-discipline`.

### U3. Claude-compat flatten (`omp-claude-compat`)

- **objective.** ~60 files → 11 flat modules; settings policy port; dead pipeline deleted; kernel-consumed entry.
- **write_scope.** `omp/plugins/omp-claude-compat/src/**`, `omp/plugins/omp-claude-compat/tests/**`, `omp/plugins/omp-claude-compat/tsdown.config.ts` (only if entry names change — they must not).
- **target map.** `events.ts` ← `HookCatalog.ts`; `settings.schema.ts` ← `HookSettings.schema.ts` (+ `SettingsSource`, gaps types); `settings.workflow.ts` ← `MergeSettings.workflow.ts` (type names aligned: exported type matches the class it mirrors); `settings.ts` ← `ClaudeSettings.ts` + `HookSettings.ts` (coverage analysis) + `internal/SettingsPaths.ts` + `internal/PluginHookSources.ts` + `internal/CollectSettingsGapsExecutor.ts` + NEW `ClaudeSettingsSources` policy port with live default; `hooks.schema.ts` ← `HookOutput.schema.ts` + `HookDispatcher.schema.ts` + `PromptDestination.ts` + `HookSession.ts` + `AsyncHookOutput.ts`; `hooks.workflow.ts` ← `HookVerdict.workflow.ts` + `HookDispatch.workflow.ts`; `hooks.ts` ← `HookDispatcherExecutor.ts` + `HookDispatcherHandler.ts` + `internal/Run*Executor.ts` (all 12) + `Deadline.ts` + `internal/SuperviseForkExecutor.ts`; `wire.ts` ← `wire/*` (8 modules); `inject.ts` ← public surface + `InjectInstructionsExecutor.ts` + `InjectInstructionsHandler.ts`; `runtime.ts` ← `HookRuntime.ts` + `HookRunner.ts` replaced by kernel (`bootstrapPluginRuntime`, exports `HookScopeLive`); `index.ts` ← `defineOmpExtension`. Delete: `internal/`, `wire/`, `LoadSettingsExecutor.ts`, `HookSettings.ts`, all old suffixed top-level files.
- **verify_commands.** `pnpm --filter @systemfsoftware/omp-claude-compat test` (budget 300s; suite ~85s); `pnpm --filter @systemfsoftware/omp-claude-compat exec tsc --noEmit`; `pnpm --filter @systemfsoftware/omp-claude-compat build`.
- **acceptance.** 122 tests green (import updates only); AE7 policy-substitution test added under `tests/` as a Gherkin feature; `ls src/` shows the 11 modules + regenerated law files; no `src/internal`, no `src/wire`.
- **rollback.** `git checkout HEAD -- omp/plugins/omp-claude-compat`.

### U4. Doctrine docs

- **objective.** The omp instruction tree shrinks: `omp/AGENTS.md` deleted, `omp/plugins/AGENTS.md` subtracted to its mandate.
- **write_scope.** `omp/AGENTS.md` (delete), `omp/plugins/AGENTS.md`, `.harness-validator.json` (annotation).
- **approach.** Placement escalation: DMMF table + Module-Shape restatement → root `REPO-A1`; TaggedError section → deleted (generic Effect doctrine); Decode/ACL gates → `CONSTITUTION-ARTICLES.md` II.5; commands → `PLG3` check + `omp-plugin-development` skill; failure rows + skill trigger → plugins leaf. Delete `omp/AGENTS.md` outright; drop the plugins leaf's cache-bust and "prose cannot catch" paragraphs.
- **verify_commands.** `git grep -nF "omp/AGENTS.md" -- . ':!docs/plans' ':!repos'` → zero live hits.
- **acceptance.** omp instruction tree is one leaf; every deleted line names its surviving committed owner here.
- **size_estimate.** { files: 3, verify_minutes: 1 }
- **context_paths.** `omp/AGENTS.md`, `omp/plugins/AGENTS.md`, root `AGENTS.md`.
- **rollback.** `git checkout HEAD -- omp/AGENTS.md omp/plugins/AGENTS.md .harness-validator.json`.
- **dependencies.** None (landed before U1–U3 to keep worker prompts accurate).

### Sequencing

U1 ∥ U2 (disjoint scopes; U2 codes against the U1 contract below) → U3 (needs U1 landed; largest) → U4 (needs final shape) → orchestrator verification tail.

**U1 contract (fixed before dispatch):**
```ts
// @systemfsoftware/omp-platform
export type RunSafe = <A, E>(effect: Effect.Effect<A, E, RuntimeContext<R>>) => Promise<A>  // R = the runtime's layer success
export const bootstrapPluginRuntime = <R>(layer: Layer.Layer<R, unknown, never>) => {
  readonly runtime: ManagedRuntime.ManagedRuntime<R>
  readonly runSafe: RunSafe
}
export const defineOmpExtension = (spec: {
  readonly register: ReadonlyArray<(pi: ExtensionAPI, runSafe: RunSafe) => Promise<void> | void>
  readonly runtime: () => Promise<unknown>
}) => (pi: ExtensionAPI) => Promise<void>
```
(`register` entries are already-imported functions in the entry; the laziness is that the *handlers* they register are dynamically imported inside them — keeping the eager-entry budget. `runtime` is the lazy `() => import('./runtime.js')` loader.)

---

## Verification Contract

| Gate | Command | Applies |
| --- | --- | --- |
| Platform | `pnpm --filter @systemfsoftware/omp-platform test && pnpm --filter @systemfsoftware/omp-platform exec tsc --noEmit` | U1 |
| Discipline | `pnpm --filter @systemfsoftware/omp-agent-discipline test && pnpm --filter @systemfsoftware/omp-agent-discipline exec tsc --noEmit` | U2 |
| Claude | `pnpm --filter @systemfsoftware/omp-claude-compat test && pnpm --filter @systemfsoftware/omp-claude-compat exec tsc --noEmit && pnpm --filter @systemfsoftware/omp-claude-compat build` | U3 |
| Smoke | `node omp/scripts/smoke-plugin.mjs omp/plugins/omp-claude-compat/dist/index.js` and the discipline dist | U2, U3 |
| Traces | `git grep -nI -e RunSafePolicy -e HookRunner -e LoadSettingsExecutor -e 'NoSkillDelegation.schema' -e 'DispatchDoctrine.schema' -- omp/` → zero | U2, U3 |
| Local | `pnpm check:local` after the last edit | all |

## Definition of Done

- R13–R19 hold in the tree; both dists load through the smoke tool (AE8); traces grep clean; changesets filed for both plugins (`none` bump — no consumer-observable surface change); `pnpm check:local` exits 0.
