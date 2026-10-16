---
title: Play functions and steps find elements by role, label or text and assert what a person perceives
applies_when:
  - writing a play function or a step definition that finds or asserts on an element
  - an AI agent proposes a test id, a CSS selector or `querySelector` in a story
  - reviewing an assertion on markup structure or on a class name
tags: [storybook, queries, accessibility, testing-library, play]
---

Play functions and steps find elements by role, label or visible text and assert what a person perceives, never by test id or markup selector. A query by role and accessible name is the query a person using assistive technology makes, so it fails when a control loses its name or role. A test id or selector finds an element no person can reach and passes on a restyle that changed what a person sees.

Testing Library ranks its queries by how closely they resemble the way users interact with the page: queries accessible to everyone first, then semantic queries, with test ids last, for "cases where you can't match by role or text or it doesn't make sense".

1. **Query through the canvas.** A play function destructures `canvas` from its context, and a step uses the `canvas` on its step context; both are queries scoped to the story's root. Assertions use `expect` from `storybook/test`, so failures render in the Interactions panel.
2. **Role, label, text, in that order.** Find a control by `getByRole` with its accessible name, a field by `getByLabelText`, and content by `getByText`. Scope a query inside a found region with `within`.
3. **No test id, no selector.** Never query by `getByTestId`, `querySelector`, a class name or a DOM path. If no accessible query can find the element, the element lacks an accessible name, and that is the defect to fix.
4. **Assert the perceived result.** Assert visibility, accessible text, and the enabled or pressed state a person perceives. Never assert a class name or attribute only the markup carries.

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

const meta = { component: MessageList, args: { channel: 'General' } } satisfies Meta<typeof MessageList>
export default meta
type Story = StoryObj<typeof meta>

// WRONG: a test id and a class selector find nodes no person can name, so the story
// passes when the list loses its accessible name.
export const ShowsMessageByTestId: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByTestId('message-list')).toBeInTheDocument()
    await expect(canvasElement.querySelector('li.message')).toHaveTextContent('Hello all')
  },
}

// RIGHT: the list is found by its accessible name and the message inside it by its text.
export const ShowsPostedMessage: Story = {
  play: async ({ canvas }) => {
    const messages = canvas.getByRole('list', { name: 'Messages' })
    await expect(within(messages).getByText('Hello all')).toBeVisible()
  },
}
```

Grounds: Testing Library, query priority (https://testing-library.com/docs/queries/about/#priority); Storybook 10.6, Interaction tests (https://storybook.js.org/docs/writing-tests/interaction-testing).

Gate: `review` — reject a play function or step that queries by test id, `querySelector`, class name or DOM path, or that asserts on markup a person does not perceive.
