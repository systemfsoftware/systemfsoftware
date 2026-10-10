---
title: Stories run in a real browser, fail on axe violations, assert through roles, and back layout claims with evidence
applies_when:
  - configuring how stories run, or setting a story's accessibility parameters
  - writing a play function's queries and assertions
  - claiming a layout is responsive or visually correct
  - an AI agent proposes a simulated DOM, an axe opt-out, or a test-id query
tags: [storybook, browser, accessibility, axe, roles, responsive]
---

Stories run in a real headless browser with axe failures as errors and play functions asserting through accessible roles.

A simulated DOM has no layout, focus model or media queries, so a story that passes there proves nothing about the page a person loads. An axe opt-out ships the violation it hid. A query by test id or markup passes for a control no assistive technology can find, and fails on a restyle that changed nothing a person sees.

1. **Real browser.** The browser is the UI's oracle, as the local system is a boundary adapter's in `boundary-testing/real-system-oracles.md`. Which browser and provider run the stories is tool config.
2. **Axe failures are errors.** The project preview makes them errors, and no story switches axe off or down.
3. **Assert through roles.** Play functions and steps find elements by accessible role and name, so the query is itself an accessibility check.
4. **Responsive claims assert both sides.** A story that claims behaviour at a breakpoint pins a named viewport, and a sibling story pins the other side and asserts the behaviour there.
5. **Visual claims carry evidence.** A claim that something looks right cites the screenshot the browser run took at each viewport, never a look at a dev server.

```tsx
// WRONG: this story switches axe off, and its play function finds the button by test id
export const ComposerSends = {
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByTestId('send-btn'))
  },
}

// RIGHT: the preview makes axe failures errors; each story queries by role and pins a
// named viewport, and a sibling story asserts the other side of the breakpoint
// .storybook/preview.tsx
export default definePreview({ parameters: { a11y: { test: 'error' } } })

// sidebar.stories.tsx
export const SettingsIsShownWhenWide = {
  globals: { viewport: { value: 'wide', isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Settings' })).toBeVisible()
  },
}

export const SettingsIsInTheMenuWhenNarrow = {
  globals: { viewport: { value: 'narrow', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole('link', { name: 'Settings' })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Open navigation' }))
    await expect(canvas.getByRole('link', { name: 'Settings' })).toBeVisible()
  },
}
```

Gate: `review` — reject a story that turns axe off or down, a query by test id or markup, a responsive claim with one side untested, and a visual claim without the run's screenshot.
