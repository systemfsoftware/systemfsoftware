---
title: A story that asserts layout at a screen size pins a configured viewport, on both sides of a breakpoint it claims
applies_when:
  - writing a story that asserts collapse, hiding or reflow at a screen size
tags: [storybook, viewport, responsive]
---

A story that asserts layout at a screen size sets globals.viewport on the story or its meta to a key defined in the project's Storybook viewport options.

A claim that layout changes at a breakpoint is proven by one story pinned below it and one pinned above it.

Decision test: does a story assert that something collapses, hides or reflows without setting globals.viewport to a configured key, or claim a breakpoint with a story on only one side of it? If yes, it fails.

Defect prevented: an unpinned layout assertion runs at whatever size the runner's window has, so it passes on one machine and fails on another. A story on one side only cannot tell a breakpoint from a layout that never changes: a menu that is always collapsed passes "collapsed on a phone".

```typescript
// WRONG
export const MenuCollapses = { play: async () => expect(menuButton()).toBeVisible() }
```

```typescript
// RIGHT
export const OnAPhoneTheMenuIsBehindAButton = { globals: { viewport: { value: 'mobile1' } }, play: … }
export const OnADesktopTheMenuIsShownInFull = { globals: { viewport: { value: 'desktop' } }, play: … }
```

Source: Storybook, Viewport (https://storybook.js.org/docs/essentials/viewport): viewports are defined in viewport options and selected per story or component.

Gate: judge
