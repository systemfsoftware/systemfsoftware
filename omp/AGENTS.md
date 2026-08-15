# AGENTS.md — `omp/` workspace

> **Location:** `omp/` — the OMP workspace. Two directories:
>
> - `omp/plugins/` — host extension packages (carry `omp.extensions`, loaded per session by the OMP host). **Leaf: `omp/plugins/AGENTS.md`** — read it before editing any entry, handler, or runtime wiring there.
> - `omp/packages/` — plain libraries consumed by plugins. No leaf: the root plus this file govern them.

## Critical

- Touching `omp/plugins/<pkg>/src/<name>.workflow.ts` (or `omp/packages/<pkg>/src/` for shared libraries) or designing a new decision cell: the workflow cells in this workspace follow the DMMF (Decision-Module-Mechanism-Feature) composition pattern, not a bespoke architecture. Choose the cell suffix with the decision tree below; wrong suffix is a category error.

- Authoring/modifying a plugin manifest, `pi.on` handler, link flow, or release pipeline → **load `skill://omp-plugin-development`** first.

## Cell Architecture (DMMF in this workspace)

`plugins/omp-claude-compat/src/` is the canonical example. The pattern:

| Suffix          | Role                                                      | Purity | Example in this workspace                                        |
| --------------- | --------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| `*.workflow.ts` | Pure decision: typed command → `Either<Decision, Error>`  | Pure   | `hook-verdict.workflow.ts`                                       |
| `*.executor.ts` | I/O shell — reads inputs, calls workflow, writes outputs  | Impure | `hook-dispatcher.executor.ts`, `inject-instructions.executor.ts` |
| `*.acl.ts`      | Foreign-shape → domain decode (never cast)                | Pure   | `hook-output.acl.ts`, `hook-settings.acl.ts`, `tool-name.acl.ts` |
| `*.handler.ts`  | Transport terminus — registers `pi.on(...)` handlers      | Impure | `hook-dispatcher.handler.ts`, `inject-instructions.handler.ts`   |
| `*.schema.ts`   | Shared tagged unions or branded primitives (≥2 consumers) | Pure   | `hook-dispatcher.schema.ts`                                      |
| `index.ts`      | Package barrel — extension manifest wiring                | Impure | `plugins/omp-claude-compat/src/index.ts`                         |

**Decision tree for a new module under `omp/plugins/*/src/` (or `omp/packages/*/src/` for shared libs):**

1. Does it make a domain decision with ≥2 outcome variants across `Decision ∪ Error`? → `*.workflow.ts`.
2. Does it do subprocess execution, file reads, or other impure I/O? → `*.executor.ts` (the workflow is the filling).
3. Does it decode JSON from an external shape into a domain type? → `*.acl.ts`.
4. Does it register a `pi.on(...)` handler? → `*.handler.ts`.
5. None of the above? → re-read the Cell Architecture table above. Wrong suffix is a category error.

## Workflow Gates (S.TaggedError rule)

Errors in this workspace MUST extend `S.TaggedError`, not `S.TaggedClass`. A `TaggedClass` is data; a `TaggedError` is an error. The convention exists because errors flow through Effect's `catchTag` / `catchTags` machinery and need the discriminator plus the metadata that `TaggedError` provides. Reference usage: `packages/effect-daemon-spec/src/leader-lock.schema.ts`.

**Pattern in this workspace** — `plugins/omp-claude-compat/src/hook-verdict.workflow.ts` after the 2026-07-20 fix:

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

**Decision variants** (`Block`, `Allow`, `Warning`, `Blocked`, `Continue` in this workspace) are data and stay `S.TaggedClass`. The rule applies to the **error channel only**. Audit: `grep -n 'extends S.TaggedClass' omp/plugins/*/src/*.workflow.ts` — every match must be a decision/command class. Compare the grep output against the workflow's error type: any `TaggedClass` declared with an `_tag` whose name appears in the `Either<..., Error>` channel is a violation.

## ACL Gates (Schema.transformOrFail rule)

An `*.acl.ts` decodes foreign bytes (JSON, TOML, a wire DTO) into a branded domain type. Constitution II.5 — "Decode, never cast" — is enforceable here by making the transform a typed Schema, not a hand-written function. The mechanical rule:

```yaml
- id: ACL1
  title: ACLs are Schema.transformOrFail with strict:true; no as casts
  do: "declare an ACL as `Schema.transformOrFail(<ForeignSchema>, <DomainSchema>, { strict: true, decode: ..., encode: ... })` where the inactive direction returns `ParseResult.Forbidden`; brand through `ParseResult.decode(DomainSchema)`"
  dont: "write a plain function `{ return Effect.try({ try: () => parse(raw), catch: ... }).pipe(Effect.flatMap(Schema.decode(TomlConfig))) }` — the parse step is a foreign-side cast outside Schema's contract"
  harm: hand-written decode chains bypass Schema's strict identity, drift from the foreign shape on package upgrades, and re-introduce the cast pattern the type system is meant to forbid
  check: "every ACL file declares `Schema.transformOrFail` with `strict: true`; grep `grep -rL 'export.*transformOrFail' omp/packages/*/src/*.acl.ts omp/plugins/*/src/*.acl.ts` returns zero"
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

```ts
export function normalizeToolName(name: string): string {
  if (name.length === 0) return name
  return name.charAt(0).toUpperCase() + name.slice(1)
}
// → VIOLATION: lowercase→capitalized is a foreign-shape→domain mapping re-implemented in code; the correct shape is a Schema.transformOrFail from `Schema.String` to a branded `NormalizedToolName` brand.
```

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

| Symptom                                                                       | Cause                                                                       | Fix                                                                          |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `error TS2769: No overload matches this call` on `pi.on(...)`                 | OMP installed a stricter `ExtensionHandler` overload than the source pinned | Type-narrow the handler locally; do not change pi.on signature               |
| Workflow tests pass but `pnpm check` reports `pure-core` mutations unkillable | A workflow swallowed a typed error into `null` (unfalsifiable code path)    | Surface the error variant via `S.TaggedError`; let the executor branch on it |
| Plugin loads but handlers never fire                                          | Factory threw before `pi.on(...)` calls                                     | Run the smoke tool with `--cwd /tmp/plugin-smoke`; check stderr              |
