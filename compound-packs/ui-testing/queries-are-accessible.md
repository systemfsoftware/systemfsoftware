---
title: Play functions and steps find elements by role, label or text and assert what a person perceives
applies_when:
  - writing a play function or step definition that finds or asserts on an element
tags: [storybook, accessibility, queries]
---

Find elements only with `getByRole` and an accessible name, `getByLabelText` or `getByText` (and their find and query variants), scoped with `within`. Never query by `getByTestId`, `querySelector`, a class name or a DOM path; give an element no accessible query finds an accessible name instead.

Assert visibility, accessible text, value, focus or ARIA state, never a class name, a style or a markup-only attribute.

```typescript
// WRONG
await userEvent.click(canvas.getByTestId('submit'))
// RIGHT
await userEvent.click(canvas.getByRole('button', { name: 'Place order' }))
expect(canvas.getByRole('alert')).toHaveTextContent('Your card was declined')
```
