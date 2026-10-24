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

Gate: judge
