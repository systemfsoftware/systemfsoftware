---
title: A control that takes the person to a route is an Astryx component with an href, never an onClick that navigates
applies_when:
  - adding a button, link, menu item or side-navigation item that goes to another route
  - adding a control whose handler calls the router's navigate
tags: [design-system, astryx, navigation, accessibility]
---

A control whose activation goes to a route sets href to that route on the Astryx component (Button, Link, menu item, side-navigation item), never an onClick that calls the router's navigate.

A control whose activation performs an action (submit, save, delete) is a button with onClick, and any navigation after the action runs in the code that handles its result.

An href names a route or the id of an element on the same page, never a bare # placeholder; a control that changes same-page state without changing the URL is a button with onClick.

Decision test: the diff fails if it adds a handler whose only effect is a navigate call or a location change, or an href of "#".

Defect it prevents: a button that navigates in onClick is announced as a button, shows no destination, and cannot be opened in a new tab or copied as a link; a "#" href scrolls to the top and pushes a history entry.

```tsx
// WRONG
<Button label='Orders' onClick={() => navigate('/orders')} />
```

```tsx
// RIGHT
<Button label='Orders' href='/orders' />
```

Source: @astryxdesign/core Button docs ("If it only takes the user to another page, use a link instead. Buttons are for actions like saving, deleting, or submitting"; href renders the button as a link through LinkProvider); Link docs ("Use Link for actions that do not navigate; use a Button instead").

Gate: judge
