---
title: A control that takes the person to a route is an Astryx component with an href, never an onClick that navigates
applies_when:
  - adding a button, link, menu item or side-navigation item that goes to another route
  - adding a control whose handler calls the router's navigate
tags: [design-system, astryx, navigation, accessibility]
---

Set `href` to the route on the Astryx component (Button, Link, menu item, side-navigation item) whose activation goes to a route; never an `onClick` that calls the router's `navigate`. A navigating button is announced as a button, shows no destination and cannot be opened in a new tab.

A control whose activation performs an action (submit, save, delete) is a button with `onClick`, and any navigation after the action runs in the code that handles its result. An `href` names a route or the id of an element on the same page, never a bare `#`; a control that changes same-page state without changing the URL is a button with `onClick`.

```tsx
// WRONG
<Button label='Orders' onClick={() => navigate('/orders')} />
// RIGHT
<Button label='Orders' href='/orders' />
```
