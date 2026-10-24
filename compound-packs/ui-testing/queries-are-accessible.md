---
title: Play functions and steps find elements by role, label or text and assert what a person perceives
applies_when:
  - writing a play function or step definition that finds or asserts on an element
tags: [storybook, accessibility, queries]
---

Elements are found only with getByRole and an accessible name, getByLabelText or getByText (and their find and query variants), scoped with within.
Never query by getByTestId, querySelector, a class name or a DOM path; an element no accessible query finds is fixed by giving it an accessible name.
Assertions check visibility, accessible text, value or ARIA state, never a class name or a markup-only attribute.

```typescript
// WRONG
await userEvent.click(canvas.getByTestId('submit'))
```

```typescript
// RIGHT
await userEvent.click(canvas.getByRole('button', { name: 'Place order' }))
```

Gate: judge
