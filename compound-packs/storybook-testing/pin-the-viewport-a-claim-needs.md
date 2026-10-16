---
title: A story that claims a layout pins its viewport, and a responsive claim is proven on each side of the breakpoint
applies_when:
  - a story asserts that something collapses, hides, reflows or appears at a screen size
  - an AI agent writes a responsive story with no viewport set
  - reviewing a claim that a layout responds to width
tags: [storybook, viewport, layout, responsive, globals]
---

A story that claims a layout pins its viewport through `globals.viewport`, and a responsive claim is proven by a story on each side of the breakpoint. A story with no pinned viewport runs at whatever size the test page defaults to, so a claim about narrow screens is tested at a wide one and passes or fails for a reason it does not state. One side of a breakpoint proves only that the layout looks that way at one width. It cannot show that the layout responds to width at all.

1. **Pin through `globals.viewport`.** A story or its meta sets `globals: { viewport: { value, isRotated } }`, which Storybook's Viewport docs define. The Vitest addon applies that global to the test page before the story runs. A viewport set in `globals` cannot be changed from the toolbar, so the story always renders at that size.
2. **Name a configured viewport.** The `value` is a key the project's viewport options define. The Vitest addon falls back to its default size when the key is unknown and does not report it, so a misspelt key silently tests the wrong width. Which keys exist and their sizes stay in the project's Storybook configuration.
3. **Both sides of the breakpoint.** A claim that the layout changes at a width is proven by one story pinned below the breakpoint and one pinned above it. Each asserts what a person sees at that size.

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

const meta = { component: AppShell } satisfies Meta<typeof AppShell>
export default meta
type Story = StoryObj<typeof meta>

// WRONG: claims a collapse but pins no viewport, so it runs at the default size, and no
// story shows the navigation open on the other side of the breakpoint.
export const NavigationCollapses: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Open navigation' })).toBeVisible()
  },
}

// RIGHT: one story on each side of the breakpoint, each pinned through globals.viewport.
export const NavigationCollapsesOnNarrowScreens: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole('button', { name: 'Open navigation' })
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  },
}

export const NavigationStaysOpenOnWideScreens: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: async ({ canvas }) => {
    const navigation = canvas.getByRole('navigation', { name: 'Main' })
    await expect(navigation).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Open navigation' })).toBeNull()
  },
}
```

Grounds: Storybook 10.6, Viewport (https://storybook.js.org/docs/essentials/viewport); Storybook source, the Vitest plugin's `setViewport` (https://github.com/storybookjs/storybook/blob/v10.6.1/code/addons/vitest/src/vitest-plugin/viewports.ts#L55-L95).

Gate: `review` — reject a story that asserts a layout without pinning `globals.viewport` to a configured key, and a responsive claim proven on one side of its breakpoint only.
