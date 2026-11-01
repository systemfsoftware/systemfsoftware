---
title: Every interactive element of a page is reached by Tab in DOM order, operated by Enter or Space, and left again by keyboard alone
applies_when:
  - adding a link, button, menu, disclosure, dialog, carousel, tab set or form to a page
  - attaching a click, mousedown or pointerdown handler to an element
  - setting tabindex on an element
  - adding an embedded iframe or third-party widget to a page
tags: [accessibility, keyboard, focus-order, keyboard-trap, page-suite]
---

The page suite's `keyboard` test runs on every page at both widths. It presses Tab from the top of the page until focus returns to where it started, then Shift+Tab the whole way back.

- Reach: the elements Tab focuses, in order, are exactly the page's visible interactive elements in DOM order: every link, button, form field, `summary`, element with `tabindex="0"`, and every element Chromium reports a click, mousedown or pointerdown listener on (CDP `DOMDebugger.getEventListeners`). An element with such a listener that Tab never reaches fails. Use a native `button` or `a href`, never a clickable `div`. Never set a positive tabindex.
- Operate: every `summary`, and every element with `aria-expanded` or `aria-pressed`, toggles that state on Enter and again on Space; every element with `aria-checked` toggles on Space; every in-page link moves focus to its target; a dialog opened from the keyboard closes on Escape and returns focus to the control that opened it.
- Leave: focus leaves every widget and iframe by Tab or Shift+Tab, or by a key the widget names in visible text (WCAG 2.1.2). A walk that never returns to its start is a trap and fails.
- What a key does inside an island (a combobox's arrows, a slider's steps) is proven by the island's stories (islands-are-proven-by-stories-and-in-the-built-page.md).

```html
<!-- WRONG: a click listener Tab never reaches -->
<div class="plan" onclick="choose('pro')">Pro</div>
<!-- RIGHT -->
<button type="button" aria-pressed="false">Choose Pro</button>
```

Gate: the page suite's `keyboard` test fails on an unreached interactive element, a focus order that differs from DOM order, a state Enter or Space does not change, or a walk that never returns.
