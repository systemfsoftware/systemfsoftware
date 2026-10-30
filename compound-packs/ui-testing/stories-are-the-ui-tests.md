---
title: An app's user-visible behaviour is proven by stories run in a real browser, never by a simulated-DOM render test
applies_when:
  - choosing how to test an app screen or component's behaviour
  - setting a test environment for UI code
tags: [storybook, browser, jsdom]
---

Prove an app's user-visible behaviour with stories the Storybook Vitest addon runs in a real browser. Never test an app's UI under jsdom or happy-dom, and never render app components outside a story, in any environment: a simulated DOM differs from a browser in layout, focus, scrolling and browser APIs, and a render outside a story skips the preview's provider and proves a wiring production never runs.

```typescript
// WRONG
// @vitest-environment jsdom
render(<OrderSummary order={order} />)
// RIGHT: placing-an-order.stories.tsx, run by the Storybook Vitest addon in browser mode
```
