---
title: Play functions and steps find elements by role, label or text and assert what a person perceives
applies_when:
  - writing a play function or step definition that finds or asserts on an element
tags: [storybook, accessibility, queries]
---

Elements are found only with getByRole and an accessible name, getByLabelText or getByText (and their find and query variants), scoped with within.

Never query by getByTestId, querySelector, a class name or a DOM path; an element no accessible query finds is fixed by giving it an accessible name.

Assertions check visibility, accessible text, value, focus or ARIA state, never a class name, a style, or a markup-only attribute.

Decision test: does a play function or step definition in the diff find an element by anything but role and name, label or text, or assert anything a person could not perceive? If yes, it fails.

Defect prevented: a test-id or selector query keeps passing when a control loses its role or name, so a button a screen reader cannot announce goes green; and it breaks when markup is refactored without changing anything a person perceives.

```typescript
// WRONG
await userEvent.click(canvas.getByTestId('submit'))
expect(canvas.getByTestId('banner')).toHaveClass('error')
```

```typescript
// RIGHT
await userEvent.click(canvas.getByRole('button', { name: 'Place order' }))
expect(canvas.getByRole('alert')).toHaveTextContent('Your card was declined')
```

Source: Testing Library, About Queries, Priority (https://testing-library.com/docs/queries/about/#priority): tests "should resemble how users interact with your code"; getByRole with a name is the first choice, and "if you can't, it's possible your UI is inaccessible".

Gate: judge
