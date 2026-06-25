---
version: "2026-04-15"
---

# AGENTS.md — Oxlint Plugin

> **Delta ONLY**: Oxlint-plugin-specific additions. Root AGENTS.md defines universal policies.

## Critical

**MUST** invoke relevant skills before domain-specific work.

## 1. Rule File Structure

Rules use ESLint-compatible API via `@typescript-eslint/utils` for compatibility with oxlint's `jsPlugins` feature.

### Standard Rule Template

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
    schema: [], // JSON Schema for options
    messages: {
      errorKey: '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    },
    fixable: 'code', // if auto-fixable
    hasSuggestions: true, // if providing suggestions
  },
  defaultOptions: [],
  create(context) {
    // Rule logic here
    return {
      // AST selectors
    }
  },
})
```

### Error Message Format (MANDATORY)

**ALL error messages MUST use AI-Native format:**

```
'{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.'
```

| Component      | Purpose                  | Example                           |
| -------------- | ------------------------ | --------------------------------- |
| `{{name}}`     | The violating element    | `eval`, `Data.TaggedError`        |
| `{{expected}}` | What should be used      | `Schema.TaggedError`              |
| `{{actual}}`   | What was detected        | `Data.TaggedError`                |
| `{{fix}}`      | Concrete fix instruction | `Replace with Schema.TaggedError` |

## 2. Testing Requirements

### Test Framework

- **REQUIRED:** `oxlint/plugins-dev` RuleTester (per Issue #2092)
- **Structure:** `valid: [...]` and `invalid: [...]` cases
- **Run:** `pnpm --filter @systemfsoftware/oxlint-plugin test`

### Test File Template

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
  valid: [
    { name: 'Should_Pass_When_...', code: '...' },
  ],
  invalid: [
    {
      name: 'Should_Report_When_...',
      code: '...',
      output: '...',  // For auto-fix rules
      errors: [{ messageId: '...', data: { ... } }],
    },
  ],
})
```

### Coverage Requirements

| Metric     | Threshold | Config Location               |
| ---------- | --------- | ----------------------------- |
| Statements | 100%      | `vitest.config.ts:thresholds` |
| Branches   | 100%      | `vitest.config.ts:thresholds` |
| Functions  | 100%      | `vitest.config.ts:thresholds` |
| Lines      | 100%      | `vitest.config.ts:thresholds` |

## 3. Oxlint JS Plugin Integration

### How Oxlint Loads This Plugin

```typescript
// In oxlint-config/src/oxlint-config.base.ts
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin'],
  rules: {
    '@systemfsoftware/oxlint-plugin/rule-name': 'error',
  },
})
```

### Rule Export Format

```typescript
// src/index.ts
import { rule as myRule } from './rules/my-rule.js'

export default {
  meta: { name: '@systemfsoftware/oxlint-plugin' },
  rules: {
    'my-rule': myRule,
  },
}
```

## 4. Migration from ESLint Plugin

When migrating rules from `@systemfsoftware/eslint-plugin`:

1. **Copy** rule file to `src/rules/{name}.ts`
2. **Keep** all rule logic, AST selectors, and message formats
3. **Copy** test file to `src/rules/__tests__/{name}.test.ts`
4. **Update** test import to use `oxlint/plugins-dev`:
   ```typescript
   import { RuleTester } from 'oxlint/plugins-dev'
   ```
5. **Update** import paths (`.js` extension for ESM)
6. **Add** rule export to `src/index.ts`

## 5. Commands

```bash
# Type check
pnpm --filter @systemfsoftware/oxlint-plugin typecheck

# Run tests (with coverage, 100% threshold enforced)
pnpm --filter @systemfsoftware/oxlint-plugin test

# Lint
pnpm --filter @systemfsoftware/oxlint-plugin lint
```
