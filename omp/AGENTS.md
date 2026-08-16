# AGENTS.md — `omp/` workspace

> **Location:** `omp/` — the OMP workspace. Two directories:
>
> - `omp/plugins/` — host extension packages (carry `omp.extensions`, loaded per session by the OMP host). **Leaf: `omp/plugins/AGENTS.md`** — read it before editing any entry, handler, or runtime wiring there.
> - `omp/packages/` — plain libraries consumed by plugins. No leaf: the root plus this file govern them.

## The sandwich (DMMF in this workspace)

Touching `omp/plugins/<pkg>/src/` or `omp/packages/<pkg>/src/`, or designing a new decision cell: cells in this workspace follow the sandwich (Decision-Module-Mechanism-Feature) composition pattern, not a bespoke architecture. The shape is impure shell → pure decision → impure shell: an executor shell reads inputs and performs the I/O, a `Workflow.make` decision is the pure middle (`Result.Result<Decision, Error>`, no I/O, no Effect runtime), a handler registers `pi.on(...)` and acts on the returned decision.

The `make` boundary — not a filename — is what the gates bind (see **Workflow Gates**). A suffix (`workflow`, `executor`, `acl`, `handler`, `kernel`) describes a module's role and grants it nothing: the cell taxonomy was retired 2026-08-16, no rule keys on a filename, and a file's name never scopes a check (CONCEPTS.md — Cell; `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`).

- Authoring/modifying a plugin manifest, `pi.on` handler, link flow, or release pipeline → **load `skill://omp-plugin-development`** first.

## Modules by role

Names describe the subject; the suffix is a comment on the role:

- **workflow** (pure) — typed `Command` → `Result.Result<Decision, Error>` inside `Workflow.make`; decision variants `S.TaggedClass`, error variants `S.TaggedError`, dispatch `Match.value` + `Match.exhaustive`. (`hook-verdict.workflow.ts`)
- **executor** (impure) — I/O shell: reads inputs, calls the workflow, writes outputs. (`hook-dispatcher.executor.ts`, `inject-instructions.executor.ts`)
- **handler** (impure) — transport terminus: registers `pi.on(...)` handlers. (`hook-dispatcher.handler.ts`, `inject-instructions.handler.ts`)
- **acl** (pure) — decode of a foreign shape into a branded domain type, declared as a Schema transform (ACL Gates below). (`omp/packages/omp-utils/src/toml-loader.acl.ts`)
- **kernel** (pure) — pure helper or transform with no I/O; decision kernels keep their property laws colocated (`hook-verdict.kernel.ts` ↔ `hook-verdict.kernel.property.test.ts`). (`tool-name.kernel.ts`, `hook-verdict.kernel.ts`)
- **schema/shape/state/policy** — data and tagging declarations.

## Workflow Gates (S.TaggedError rule)

Errors in this workspace MUST extend `S.TaggedError`, never `S.TaggedClass` — a `TaggedClass` is data, a `TaggedError` is an error; `catchTag`/`catchTags` need the discriminator plus the metadata `TaggedError` provides. Decision variants (`Block`, `Allow`, `Warning`, `Blocked`, `Continue`) are data and stay `S.TaggedClass`.

What enforces it: `Workflow.make` refuses an uninhabited decision channel, a `never` error channel, or an untagged error channel at the construction site via the `Inhabited` constraint in `@systemfsoftware/effect-cell-types` (markers `UninhabitedDecision` / `UninhabitedError` / `UntaggedError`); `make-body-purity` and `workflow-match-exhaustive`, delivered by `@systemfsoftware/oxlint-config/strict` (which every omp package extends), read the decision body at the same boundary, never at a filename:

```ts
// RIGHT — errors are tagged errors
export class HookVerdictError extends S.TaggedError<HookVerdictError>()('HookVerdictError', { raw: S.String }) {}
// WRONG — the tag is right, but the class is data
export class MalformedJson extends S.TaggedClass<MalformedJson>()('MalformedJson', { raw: S.String }) {}
```

check: review — the reviewer reads a new decider's error channel and rejects a `TaggedClass` standing where a `TaggedError` belongs; the channel refusals are the constructor's and the linter's. Canonical: `omp/plugins/omp-claude-compat/src/hook-verdict.workflow.ts`.

## ACL Gates (Schema transform rule)

Constitution II.5 — "Decode, never cast". A decode of outside data (bytes, serialized text, a wire DTO) into a branded domain type is declared as a Schema transform, never a hand-written function. The rule:

```yaml
- id: ACL1
  title: Decodes are Schema-declared transforms; a plain mapping is a kernel, not a decode
  do: "declare a decode as `Schema.decodeTo(Schema.toType(Domain), { decode: SchemaGetter.transformOrFail(...), encode: SchemaGetter.forbidden(...) })`, branding earned by `Schema.decodeUnknownEffect(Domain)`; canonical form: `omp/packages/omp-utils/src/toml-loader.acl.ts`"
  dont: "write a plain function that maps the foreign value in place of a Schema declaration, or cast (`as`) at the decode position — a `normalize(name)`-style transliteration is a domain transform (a kernel), not a decode"
  harm: "a hand-written decode bypasses Schema's identity contract, silently drifts from the foreign shape on package upgrades, and re-introduces the cast pattern the type checker and lint refuse everywhere else"
  check: "review — the reviewer decides whether a new decode is a Schema-declared transform and whether any `as` sits at a decode position"
```

The `no-unsafe-*` / `no-unnecessary-type-assertion` battery in the shared `@systemfsoftware/oxlint-config` (`strict` extends `base`) already refuses the `as`-adjacent holes everywhere.

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

## Failure modes

| Symptom                                                       | Cause                                                                       | Fix                                                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `error TS2769: No overload matches this call` on `pi.on(...)` | OMP installed a stricter `ExtensionHandler` overload than the source pinned | Type-narrow the handler locally; do not change the `pi.on` signature                                                  |
| Workflow tests pass but `pnpm check` reports mutants survive  | A workflow swallowed a typed error into `null` (unfalsifiable path)         | Surface the error variant via `S.TaggedError`; let the executor branch on it                                          |
| Plugin loads but handlers never fire                          | Factory threw before `pi.on(...)` calls                                     | Run `node omp/scripts/smoke-plugin.mjs omp/plugins/<name>/dist/index.js` with `--cwd /tmp/plugin-smoke`; check stderr |
