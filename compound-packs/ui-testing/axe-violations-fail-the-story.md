---
title: Every story runs axe as an error, and no story turns it off
applies_when:
  - configuring the Storybook preview or a Vitest setup file that loads story annotations
  - a story fails an accessibility check
tags: [storybook, accessibility, axe]
---

An app's Storybook preview sets parameters.a11y.test to 'error'.

No app story or meta sets a11y.test to 'off' or 'todo', or disables an axe rule through parameters.a11y.config.rules. A violation is fixed in the UI.

A Vitest setup file that calls setProjectAnnotations for an app's stories includes the a11y addon's preview annotations.

Decision test: after the diff, does any app story run without axe failing it on a violation (a11y.test other than 'error', a disabled rule, or a setup file missing the a11y annotations)? If yes, it fails.

Defect prevented: with 'todo' a violation is only a warning in the Storybook UI and produces no output in CI, so it ships unseen; 'off' or a disabled rule hides it entirely.

```typescript
// WRONG
export const Checkout = { parameters: { a11y: { test: 'todo' } } }
```

```typescript
// RIGHT
// .storybook/preview.tsx
parameters: { a11y: { test: 'error' } },
```

Source: Storybook, Accessibility tests (https://storybook.js.org/docs/writing-tests/accessibility-testing): 'error' makes violations "a failing test in the Storybook UI and CLI/CI"; with 'todo' "there will be no accessibility-related errors, warnings, or output in CI".

Gate: judge
