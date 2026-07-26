# AGENTS.md — `omp/` workspace

> **Location:** `omp/` — the OMP workspace. Two directories:
>
> - `omp/plugins/` — OMP extension packages (have `omp.extensions`, register `pi.on` handlers): `omp-agent-discipline`, `omp-claude-compat`.
> - `omp/packages/` — shared libraries consumed by plugins: `omp-utils`.
>   Universal agent rules live in the root `AGENTS.md`; this file carries only `omp/`-specific deltas.

## Critical

- Touching `omp/plugins/<pkg>/src/<name>.workflow.ts` (or `omp/packages/<pkg>/src/` for shared libraries) or designing a new decision cell → **load `skill://architect-dmmf-application`** first; it routes to the right cell suffix and rejects category errors. The workflow cells in this workspace follow the DMMF (Decision-Module-Mechanism-Feature) composition pattern, not a bespoke architecture.

- Authoring/modifying a plugin manifest, `pi.on` handler, link flow, or release pipeline → **load `skill://omp-plugin-development`** first.
- Deciding what a single cell type (workflow, executor, schema, acl, handler, store, policy, state, shape, middleware) should look like → load the matching `skill://architect-*`.

## Cell Architecture (DMMF in this workspace)

`omp-claude-compat/src/` is the canonical example. The pattern:

| Suffix          | Role                                                      | Purity | Example in this workspace                                        |
| --------------- | --------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| `*.workflow.ts` | Pure decision: typed command → `Either<Decision, Error>`  | Pure   | `hook-verdict.workflow.ts`                                       |
| `*.executor.ts` | I/O shell — reads inputs, calls workflow, writes outputs  | Impure | `hook-dispatcher.executor.ts`, `inject-instructions.executor.ts` |
| `*.acl.ts`      | Foreign-shape → domain decode (never cast)                | Pure   | `hook-output.acl.ts`, `hook-settings.acl.ts`, `tool-name.acl.ts` |
| `*.handler.ts`  | Transport terminus — registers `pi.on(...)` handlers      | Impure | `hook-dispatcher.handler.ts`, `inject-instructions.handler.ts`   |
| `*.schema.ts`   | Shared tagged unions or branded primitives (≥2 consumers) | Pure   | `hook-dispatcher.schema.ts`                                      |
| `index.ts`      | Package barrel — extension manifest wiring                | Impure | `omp-claude-compat/src/index.ts`                                 |

**Decision tree for a new module under `omp/plugins/*/src/` (or `omp/packages/*/src/` for shared libs):**

1. Does it make a domain decision with ≥2 outcome variants across `Decision ∪ Error`? → `*.workflow.ts`.
2. Does it do subprocess execution, file reads, or other impure I/O? → `*.executor.ts` (the workflow is the filling).
3. Does it decode JSON from an external shape into a domain type? → `*.acl.ts`.
4. Does it register a `pi.on(...)` handler? → `*.handler.ts`.
5. None of the above? → re-read the cell taxonomy in `skill://architect-dmmf-application`. Wrong suffix is a category error.

## Workflow Gates (S.TaggedError rule)

Errors in this workspace MUST extend `S.TaggedError`, not `S.TaggedClass`. A `TaggedClass` is data; a `TaggedError` is an error. The convention exists because errors flow through Effect's `catchTag` / `catchTags` machinery and need the discriminator plus the metadata that `TaggedError` provides. Reference usage: `packages/effect-daemon-spec/src/leader-lock.schema.ts`.

**Pattern in this workspace** — `omp-claude-compat/src/hook-verdict.workflow.ts` after the 2026-07-20 fix:

```ts
// RIGHT
export class HookVerdictError extends S.TaggedError<HookVerdictError>()('HookVerdictError', {
  raw: S.String,
}) {}

// WRONG — Tag is right but the class is a TaggedClass, not a TaggedError
export class MalformedJson extends S.TaggedClass<MalformedJson>()('MalformedJson', {
  raw: S.String,
}) {}
```

**Decision variants** (`Block`, `Allow`, `Warning`, `Blocked`, `Continue` in this workspace) are data and stay `S.TaggedClass`. The rule applies to the **error channel only**. Audit: `grep -n 'extends S.TaggedClass' omp/plugins/*/src/*.workflow.ts omp/packages/*/src/*.workflow.ts` — every match must be a decision/command class. Compare the grep output against the workflow's error type: any `TaggedClass` declared with an `_tag` whose name appears in the `Either<..., Error>` channel is a violation.

## ACL Gates (Schema.transformOrFail rule)

An `*.acl.ts` decodes foreign bytes (JSON, TOML, a wire DTO) into a branded domain type. Constitution II.5 — "Decode, never cast" — is enforceable here by making the transform a typed Schema, not a hand-written function. The mechanical rule:

```yaml
- id: ACL1
  title: ACLs are Schema.transformOrFail with strict:true; no as casts
  do: declare an ACL as `Schema.transformOrFail(<ForeignSchema>, <DomainSchema>, { strict: true, decode: ..., encode: ... })` where the inactive direction returns `ParseResult.Forbidden`; brand through `ParseResult.decode(DomainSchema)`
        dont: write a plain function `{ return Effect.try({ try: () => parse(raw), catch: ... }).pipe(Effect.flatMap(Schema.decode(TomlConfig))) }` — the parse step is a foreign-side cast outside Schema's contract
            harm: hand-written decode chains bypass Schema's strict identity, drift from the foreign shape on package upgrades, and re-introduce the cast pattern the type system is meant to forbid
            check: every ACL file declares `Schema.transformOrFail` with `strict: true`; grep `grep -rL 'export.*transformOrFail' omp/packages/*/src/*.acl.ts omp/plugins/*/src/*.acl.ts` returns zero
```

**RIGHT — the canonical ACL shape** (this pattern was missing in the existing `.acl.ts` files; the new `toml-loader.acl.ts` resets the convention to canonical):

```ts
export const TomlConfigFromText = Schema.transformOrFail(
  Schema.String,
  Schema.typeSchema(TomlConfig),
  {
    strict: true,
    decode: (raw) =>
      ParseResult.try({
        try: () => parse(raw),
        catch: (e) => new ParseResult.Unexpected(`TOML parse error: ${e instanceof Error ? e.message : String(e)}`),
      }).pipe(ParseResult.flatMap(ParseResult.decode(TomlConfig))),
    encode: (_, _d, ast) => ParseResult.fail(new ParseResult.Forbidden(ast, _, 'TomlConfigFromText is decode-only')),
  },
)
```

**WRONG — hand-written decode outside Schema's contract** (this is what the existing `tool-input.acl.ts`, `tool-name.acl.ts`, and `context-mode.acl.ts` do; flagged as a follow-up to bring into ACL1 compliance):

````ts
export function normalizeToolName(name: string): string {
  if (name.length === 0) return name
  return name.charAt(0).toUpperCase() + name.slice(1)
}
// → VIOLATION: lowercase→capitalized is a foreign-shape→domain mapping re-implemented in code; the correct shape is a Schema.transformOrFail from `Schema.String` to a branded `NormalizedToolName` brand.

## Extension Registration Contract

**All `pi.on(...)` registrations MUST complete synchronously before the `default export function(pi)` returns.** The OMP ExtensionAPI requires this — handlers are collected during the function call, not after. A dynamic import inside the factory defers the callbacks, violating the contract.

Consequence for the lazy-init pattern: `*.handler.ts` files are statically imported from `src/index.ts` so their module-level `pi.on(...)` calls execute synchronously during the factory. The runtime (`.runtime.ts`) is backed by `await import('./runtime.js')` inside each callback, so its construction is deferred to first handler fire — but the handler registration itself is synchronous.

```yaml
- id: EXT1
  title: OMP handlers register synchronously in the factory
  do: statically import handler modules and call pi.on(...) in the default export function before it returns
  dont: register pi.on(...) handlers inside a module-scope Effect or inside a then/callback of a dynamic import
  harm: handlers are never collected and the extension silently does nothing
  check: grep -rn 'pi.on(' omp/plugins/*/src/index.ts — pi.on is called directly in the factory body, not inside a then() or Effect.runSync
````

**Audit:**

- `grep -rn 'export.*transformOrFail' omp/packages/*/src/*.acl.ts omp/plugins/*/src/*.acl.ts` — every ACL declares the transform.
- `grep -rn 'as ' omp/packages/*/src/*.acl.ts omp/plugins/*/src/*.acl.ts` — zero `as` casts (type annotations like `as const` are fine).

## Commands

```bash
# Per-package verification (omit <pkg> to run across all three)
pnpm --filter @systemfsoftware/omp-claude-compat exec vitest run
pnpm --filter @systemfsoftware/omp-claude-compat exec tsc --noEmit
pnpm --filter @systemfsoftware/omp-claude-compat build

# Workspace-wide
pnpm --filter @systemfsoftware/omp-* exec vitest run
pnpm --filter @systemfsoftware/omp-* exec tsc --noEmit

# Plugin-specific (manifests, link, smoke) — see skill://omp-plugin-development
node omp/scripts/smoke-plugin.mjs omp/plugins/<name>/dist/index.js
omp plugin link omp/plugins/<name>
```

## Failure Modes (cell-specific)

| Symptom                                                                       | Cause                                                                                        | Fix                                                                          |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `error TS2769: No overload matches this call` on `pi.on(...)`                 | OMP installed a stricter `ExtensionHandler` overload than the source pinned                  | Type-narrow the handler locally; do not change pi.on signature               |
| Workflow tests pass but `pnpm check` reports `pure-core` mutations unkillable | A workflow swallowed a typed error into `null` (unfalsifiable code path)                     | Surface the error variant via `S.TaggedError`; let the executor branch on it |
| Plugin loads but handlers never fire                                          | Factory threw before `pi.on(...)` calls                                                      | Run the smoke tool with `--cwd /tmp/plugin-smoke`; check stderr              |
| Two CLAUDE.md files in the same workspace appear different                    | `omp/CLAUDE.md` was added — it should be a one-line `@AGENTS.md` shim, not a content carrier | Replace any content beyond `@AGENTS.md` with the root or this leaf           |
