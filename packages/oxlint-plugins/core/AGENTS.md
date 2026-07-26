# AGENTS.md — `@systemfsoftware/oxlint-plugin` (`core/`)

> **Location:** `packages/oxlint-plugins/core/` — the general oxlint rule package for System F Software. Shared rule-authoring conventions (config split, error format, guards, testing, mutation gate) live in `packages/oxlint-plugins/AGENTS.md`; this file carries only `core/`-specific deltas.

## 1. Rule Template (ESLintUtils Style)

Rules use the ESLint-compatible API via `@typescript-eslint/utils` for compatibility with oxlint's `jsPlugins` feature. Standard template:

```typescript
import { ESLintUtils, TSESTree } from '@typescript-eslint/utils'

export type Options = [] // or [{ optionName: type }]
export type MessageIds = 'errorKey'

const createRule = ESLintUtils.RuleCreator.withoutDocs

export const rule = createRule<Options, MessageIds>({
  name: 'rule-name',
  meta: {
    type: 'suggestion',
    docs: { description: 'Rule description' },
    schema: [],
    messages: { errorKey: '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' },
    fixable: 'code', // if auto-fixable
    hasSuggestions: true, // if providing suggestions
  },
  defaultOptions: [],
  create(context) {/* AST selectors */},
})
```

## 2. Test File Template

```typescript
import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'
import { rule } from '../rule-name.js'

RuleTester.afterAll = vitest.afterAll
RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester()

ruleTester.run('rule-name', rule, {
  valid: [{ name: 'Should_Pass_When_...', code: '...' }],
  invalid: [{
    name: 'Should_Report_When_...',
    code: '...',
    output: '...',         // For auto-fix rules
    errors: [{ messageId: '...', data: { ... } }],
  }],
})
```

Coverage: 100% statements/branches/functions/lines — thresholds in `vitest.config.ts`.

## 3. Migration from ESLint Plugin

1. Copy rule file to `src/rules/{name}.ts`.
2. Keep all rule logic, AST selectors, message formats.
3. Copy test file to `src/rules/__tests__/{name}.test.ts`.
4. Update test import to `oxlint/plugins-dev`.
5. Update import paths (`.js` extension for ESM).
6. Add rule export to `src/index.ts`.

## 4. Commands

```bash
pnpm --filter @systemfsoftware/oxlint-plugin typecheck
pnpm --filter @systemfsoftware/oxlint-plugin test        # 100% coverage enforced
pnpm --filter @systemfsoftware/oxlint-plugin lint
```
