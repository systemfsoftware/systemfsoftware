# AGENTS.md — `omp/` workspace

> **Location:** `omp/` — the OMP workspace. Two directories:
>
> - `omp/plugins/` — host extension packages (carry `omp.extensions`, loaded per session by the OMP host). **Leaf: `omp/plugins/AGENTS.md`** — read it before editing any entry, handler, or runtime wiring there.
> - `omp/packages/` — plain libraries consumed by plugins. No leaf: the root plus this file govern them.

## Critical

- Designing a decision or any load-bearing step of a machine-readable association: the decisions in this workspace follow DMMF (Decision-Module-Mechanism-Feature): a pure decision — a typed command mapped to `Result<Decision, Error>` — is built with `Workflow.make` from `@systemfsoftware/effect-cell-types`, and the shell (the file that performs I/O) wraps it in the impure/pure/impure sandwich. There is no cell-suffix taxonomy and no sanctioned name list: a file's name grants nothing, and every gate binds on the `Workflow.make` boundary or on an import edge — never on a filename. A module renamed or restructured keeps its gates.

- Authoring/modifying a plugin manifest, `pi.on` handler, link flow, or release pipeline → **load `skill://omp-plugin-development`** first.

## Sandwich + Workflow (DMMF in this workspace)

`plugins/omp-claude-compat/src/` is the canonical example. The pattern — a name-independent skeleton:

| Role            | Responsibility                                                                                              | Purity |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| the shell       | sequences the sandwich: reads inputs, classifies, runs the workflow, writes outputs; registers `pi.on(...)` | Impure |
| `Workflow.make` | the decision: typed command → `Result<Decision, Error>` by exhaustive dispatch over a closed classification | Pure   |
| decode          | foreign-shape → branded domain type via a `Schema` codec (see ACL Gates below)                              | Pure   |
| shape           | the output/event built from the decision                                                                    | Pure   |

- The decisions, not the files, are the unit. A decision is a `Workflow.make` value; a decision that cannot fail (a total classification) stays a plain function — inventing an error to reach workflow status is forbidden.
- The `Left` of a decision is an outcome worth an error channel, so the channel carries a tag; the `Left`-of-decision travels onward only where the shell folds it into a value (see `run-user-prompt-submit-hooks.executor.ts` for the fold pattern).
- A later read that depends on an earlier decision is pre-fetched, split into a second sandwich, or left visibly in the shell — never placed inside the filling.
- The shell may branch on event/field structure, never on domain state; the domain state mapping happens in the decision body.
- Pure and impure modules may sit in the same folder. No `core`, `shell`, `pure`, or `io` path segment is introduced.

**Naming** (free): a module is named by the concept it exports (`Target.ts`, `LeafContext.ts`, `LeafContextExtension.ts` like the sibling `leaf-context` plugin), never by a role the file happens to hold. Nothing below this line reads a filename.

## Decision channel (TaggedError) rule

Errors in workspace channels MUST extend `S.TaggedError`, not `S.TaggedClass`. A `TaggedClass` is data; a `TaggedError` is an error. The distinction matters because decisions flow through `Match`/`Result` machinery that dispatches on `_tag`, and the compiler is the only place a mistaken channel can be caught: `Workflow.make` inside `@systemfsoftware/effect-cell-types` refuses an untagged `Error` channel.

```ts
// RIGHT — the error channel of a decision is a TaggedError
export class HookVerdictError extends S.TaggedError<HookVerdictError>()('HookVerdictError', {
  raw: S.String,
}) {}

// WRONG — Tag is right but the class is a TaggedClass, not a TaggedError
export class MalformedJson extends S.TaggedClass<MalformedJson>()('MalformedJson', {
  raw: S.String,
}) {}
```

**Decision variants** (e.g. `Block`, `Allow`, `Warning` in this workspace) are data and stay `S.TaggedClass`. Audit (boundary-keyed, not file-keyed): for every `Workflow.make` site under `omp/`, the decision's error channel type is a `TaggedError`; the union of `TaggedError`/`TaggedClass` classes named by a `Result` signature is exactly the decision channel.

## ACL Gates (Schema.transformOrFail rule)

An ACL decodes foreign bytes (JSON, TOML, a wire DTO) into a branded domain type — wherever the decode lives. Constitution II.5 — "Decode, never cast" — is enforced by making the transform a typed `Schema`, not a hand-written function:

```yaml
- id: ACL1
  title: ACLs are Schema.transformOrFail with strict:true; no as casts
  do: "declare an ACL as `Schema.transformOrFail(<ForeignSchema>, <DomainSchema>, { strict: true, decode: ..., encode: ... })` where the inactive direction returns `ParseResult.Forbidden`; brand through `ParseResult.decode(DomainSchema)`"
  dont: "write a DTO→domain mapping as a plain function run directly on `JSON.parse` output — the parse step is a foreign-side cast outside Schema's contract"
  harm: hand-written decode chains bypass Schema's strict identity, drift from the foreign shape on package upgrades, and re-introduce the cast pattern the type system is meant to forbid
  check: "search every `omp/` module that decodes a foreign shape: it declares `Schema.transformOrFail` (or a `decodeTo` ACL built on it with a forbidden encode direction); `grep -rn 'as ' omp/plugins/*/src omp/packages/*/src` — zero casts beyond literal assertions"
```

**RIGHT — the canonical ACL shape** (the new `leaf` plugin's `Target.ts` resets the convention):

```ts
export const ToolCallTargetFromInput: S.Codec<TargetPath, Readonly<Record<string, unknown>>> = ForeignToolInput.pipe(
  S.decodeTo(TargetPath, {
    decode: SchemaGetter.transformOrFail((input) => parseTarget(input)),
    encode: SchemaGetter.forbidden(() => 'decode-only'),
  }),
)
```

**WRONG — hand-written decode outside Schema's contract** (what `tool-input.acl.ts` originally did, re-produced here for detection):

```ts
export function normalizeToolName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}
// → VIOLATION: lowercase→capitalized is a foreign-shape→domain mapping re-implemented
//   in a plain function; the correct shape is a Schema.transformOrFail to a branded
//   NormalizedToolName.
```

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

## Failure Modes (boundary-specific)

| Symptom                                                                       | Cause                                                                       | Fix                                                                                                                                           |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `error TS2769: No overload matches this call` on `pi.on(...)`                 | OMP installed a stricter `ExtensionHandler` overload than the source pinned | Type-narrow the handler locally; do not change the `pi.on` signature                                                                          |
| Decision tests pass but `pnpm check` reports `pure-core` mutations unkillable | A decision swallowed a typed error into `null` (unfalsifiable code path)    | Surface the error variant via `S.TaggedError`; let the shell branch on it                                                                     |
| Plugin loads but handlers never fire                                          | Factory threw before `pi.on(...)` calls                                     | Run the smoke tool with `--cwd /tmp/plugin-smoke`; check stderr                                                                               |
| A gate's grep finds nothing after a rename                                    | The rule keys on a filename                                                 | Re-key it on the boundary (make body / import edge). The invariant still holds after the rename; the check lies — fix the check, not the file |
