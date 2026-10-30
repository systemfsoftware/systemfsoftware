---
title: Each journey starts from reset fixture controls, set before mount when mount reads them, and a step sets a control only before the action it tests
applies_when:
  - writing the preview's decorator, a story's beforeEach or a journey's first Given
  - a story needs an I/O stand-in to answer differently, hold or fail
tags: [storybook, fixture-controls, fakes, lifecycle]
---

Call the fixture-controls module's `resetAll()` in the first Given of every journey, so no I/O control a previous story set is still in force. Never reset controls from a hand-written list.

When a component reads a control while it mounts (its services are built on mount, or it fetches on mount), call `resetAll()` in the story's `beforeEach`, set the control there, and return the function that undoes it. A Given runs after mount and sets that state too late.

A step changes I/O behaviour only through a named fixture control (hold a write, raise a fault at a boundary, answer a question), set before the action whose outcome it asserts. A step never reaches into a stand-in's internals or a component's state.

The preview's decorator provides the registry the production entry uses. Never create a registry during render (useState, useRef, a key remount): `RegistryProvider` reads its options only on first render, so a story can inherit another's registry. `resetAll()` resets I/O controls only, not atom state.

```typescript
// WRONG: the runtime was built on mount, before this Given ran
Given('the server is unavailable', () => { rpc.failNext('unavailable') })
// RIGHT: the story's meta
beforeEach: () => { resetAll(); rpc.failNext('unavailable'); return resetAll },
```
