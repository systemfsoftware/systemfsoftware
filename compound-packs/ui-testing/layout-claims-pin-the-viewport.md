---
title: A story that asserts layout at a screen size pins a configured viewport, on both sides of a breakpoint it claims
applies_when:
  - writing a story that asserts collapse, hiding or reflow at a screen size
tags: [storybook, viewport, responsive]
---

A story that asserts layout at a screen size sets globals.viewport on the story or its meta to a key defined in the project's Storybook viewport options.
A claim that layout changes at a breakpoint is proven by one story pinned below it and one pinned above it.

Gate: judge
