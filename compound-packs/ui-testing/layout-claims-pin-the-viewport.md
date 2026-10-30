---
title: A story that asserts layout at a screen size pins a configured viewport, on both sides of a breakpoint it claims
applies_when:
  - writing a story that asserts collapse, hiding or reflow at a screen size
tags: [storybook, viewport, responsive]
---

Set `globals.viewport` on the story or its meta to a key defined in the project's Storybook viewport options whenever a story asserts that something collapses, hides or reflows. An unpinned assertion runs at whatever size the runner's window has.

Prove a claim that layout changes at a breakpoint with one story pinned below it and one above it; a story on one side only cannot tell a breakpoint from a layout that never changes.

```typescript
// WRONG
export const MenuCollapses = { play: async () => expect(menuButton()).toBeVisible() }
// RIGHT
export const OnAPhoneTheMenuIsBehindAButton = { globals: { viewport: { value: 'mobile1' } }, play: … }
export const OnADesktopTheMenuIsShownInFull = { globals: { viewport: { value: 'desktop' } }, play: … }
```
