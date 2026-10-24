---
title: A control that takes the person to a route is an Astryx component with an href, never an onClick that navigates
applies_when:
  - adding a button, link, menu item or side-navigation item that goes to another route
tags: [design-system, astryx, navigation, accessibility]
---

A control whose activation goes to a route sets href to that route on the Astryx component (Button, Link, menu item, side-navigation item), never an onClick that calls the router's navigate.

A control whose activation performs an action (submit, save, delete) is a button with onClick, and any navigation after the action runs in the code that handles its result.

An href names a route or the id of an element on the same page, never a bare # placeholder; a control that changes same-page state without changing the URL is a button with onClick.

```WRONG
<Button onClick={() => navigate('/orders')}>Orders</Button>
```

```RIGHT
<Button href="/orders">Orders</Button>
```

Gate: judge
