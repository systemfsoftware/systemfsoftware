---
title: An app's user-visible behaviour is proven by stories run in a real browser, never by a simulated-DOM render test
applies_when:
  - choosing how to test an app screen or component's behaviour
  - setting a test environment for UI code
tags: [storybook, browser, jsdom]
---

An app's user-visible behaviour is proven by stories the Storybook Vitest addon runs in a real browser.

No test of an app's UI runs under jsdom or happy-dom, by environment setting or by a @vitest-environment comment.

No test of an app's UI renders components outside a story, in any environment.

Decision test: does the diff add or change a test that renders an app's UI under a simulated DOM, or renders app components outside a story file? If yes, it fails.

Defect prevented: a simulated DOM is not a browser, so a test there can pass where the browser fails and fail where it works (layout, focus, scrolling and browser APIs differ). A render test outside a story also skips the preview's provider, so it proves a second wiring of the screen that production never runs.

```typescript
// WRONG
// @vitest-environment jsdom
render(<OrderSummary order={order} />)
```

```typescript
// RIGHT
// placing-an-order.stories.tsx, run by the Storybook Vitest addon in browser mode
export const DeclinedCard = PlacingAnOrder['A shopper whose card is declined is told so']
```

Sources: Vitest, Why Browser Mode (https://vitest.dev/guide/browser/why): jsdom and happy-dom "only simulate a browser environment ... false positives or negatives in test results may occur". Storybook, Vitest addon (https://storybook.js.org/docs/writing-tests/integrations/vitest-addon): browser mode "is more accurate than simulations like JSDom or HappyDom".

Gate: judge
