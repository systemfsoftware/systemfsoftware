# AGENTS.md — `packages/oxlint-plugins/`

> **Location:** `packages/oxlint-plugins/` — the oxlint plugin family: `core/` (general rule set), `test-hygiene/` (test naming), `effect-workflow/` (workflow constitution). Universal agent rules live in the root `AGENTS.md`; this file carries the shared rule-authoring conventions for every plugin in this folder. Package leaves carry only their package's delta.

## 1. Rule File Structure

Two API styles exist. Use the one the package already uses; do not mix styles inside a package.

**New packages (`test-hygiene`, `effect-workflow`):** `defineRule` from `@oxlint/plugins`.

```typescript
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

export const rule = defineRule({
  meta: { ...meta, schema: [JSONSchema.make(Options)] },
  create(context: Context) {/* AST selectors */},
})
```

**Legacy (`core`):** `ESLintUtils.RuleCreator` from `@typescript-eslint/utils` (kept for jsPlugins compatibility; see `core/AGENTS.md` for the template and the ESLint migration notes). New rules in `core/` follow the existing style until a dedicated migration.

## 2. Config Split (MANDATORY)

Static config lives in `src/rules/<rule>.config.ts`; the rule file holds logic only. The mutation `mutate` glob excludes `*.config.ts`.

- `meta` (type, docs, schema, messages), `Options` schema, constants, regexes, message templates → config file.
- Guards, predicates, selectors, `create()` → rule file.
- `defineRule({ meta, create })` — pass the imported config `meta` directly, no spread.

Rationale (CONSTITUTION §III.4): behavior lives where the mutator sees it; declarations carry no behavior, so they live outside the mutation surface.

## 3. Error Message Format (MANDATORY)

ALL error messages use the AI-native format:

```
'{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.'
```

Each placeholder carries: violating element, correct alternative, detected element, concrete fix.

## 4. Guard Construction (MANDATORY)

Decode at the boundary; never write manual `undefined` guards on data the runtime contract already shapes.

- Path segments: `S.decodeUnknownSync(S.Tuple([S.String, S.String], S.String))` (≥2 segments, rejects short arrays); destructure from a reversed split for typed `basename`/`parentDir`.
- Last element: `A.lastNonEmpty` on a decoded `S.NonEmptyArray`, or `A.last(...)` + `Option` combinators — never `length > 0 ? arr[len-1] : null` ternaries.
- Suffix-strip: `slice(0, -SUFFIX.length)` after a load-bearing guard — never a redundant `endsWith` + regex-replace pair (the pair makes anchor mutants equivalent and unverifiable).
- Dead ESTree-spec checks are deleted, not kept: `spec.local.type === 'Identifier'` (always Identifier), `decl.type === 'VariableDeclarator'`, `typeof importSource !== 'string'`.

## 5. Testing Requirements

- **Runner:** `oxlint/plugins-dev` `RuleTester` with `vitest` bindings (`RuleTester.it = vitest.it` etc.). Structure: `valid: [...]` / `invalid: [...]`.
- **Naming:** self-hosted `@systemfsoftware/test-hygiene(damp-test-naming)` — `Should_[Behavior]_When_[Condition]`, strict PascalCase conditions (no consecutive capitals, no single-letter words).
- **Assertions:** `expect()` on every outcome — plain `it()` boolean returns are vacuous. Assert `data` fields on reports, not just `messageId`.
- **Branches:** every conditional gets a distinguishing case per side — operator direction (`===`/`!==`), computed access (`foo['it']()`, `S['TaggedClass']`), aliasing, non-matching near-misses (`Object.for`, `X.TaggedClass`).
- **Filenames:** the RuleTester resolves `filename` to an absolute path inside node_modules — never assert on path prefixes; guards on path _shape_ are unreachable and must be decodable (§4).

## 6. Mutation Gate (MANDATORY)

`pnpm --filter <pkg> mutation` — **100%** on rule files. Every mutant is killed by a test or eliminated by a restructure. Ignoring a killable mutant is `// Stryker disable all` with extra steps and is forbidden.

Legitimate ignores are exactly one class: §III.4 declaration data (Effect Schema `Symbol.for` descriptions, `TaggedClass`/`TaggedError` `_tag` and fields, `optionalWith` defaults) via the `effect-schema-declarations` ignorer registered in `stryker.config.json#ignorers`. No other ignore plugin, no disable comments.

Type-error mutants (stripped `!`, invalid rewrites) are excluded by the typescript checker as `CompileError` — that is the checker working, not suppression.

## 7. Integration

`oxlint-config/src/oxlint-config.base.ts` registers plugins by package name:

```typescript
jsPlugins: ['@systemfsoftware/oxlint-plugin', '@systemfsoftware/oxlint-plugin-test-hygiene'],
rules: { '@systemfsoftware/oxlint-plugin/rule-name': 'error' },
```

Rule export format (`src/index.ts`): `export default { meta: { name }, rules: { 'rule-name': rule } }`.

## 8. Package Deltas

| Package            | Leaf delta                                                    |
| ------------------ | ------------------------------------------------------------- |
| `core/`            | ESLintUtils template, ESLint migration notes, legacy commands |
| `test-hygiene/`    | —                                                             |
| `effect-workflow/` | —                                                             |

## 9. Commands

```bash
pnpm --filter @systemfsoftware/oxlint-plugin test              # core
pnpm --filter @systemfsoftware/oxlint-plugin-test-hygiene test
pnpm --filter @systemfsoftware/oxlint-plugin-effect-workflow test
pnpm --filter <pkg> mutation                                    # 100% required, see §6
```
