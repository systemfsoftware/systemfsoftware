---
title: Each journey starts from reset fixture controls, set before mount when mount reads them, and a step sets a control only before the action it tests
applies_when:
  - writing the preview's decorator, a story's beforeEach or a journey's first Given
  - a story needs the I/O layer stand-in to answer differently, hold or fail
tags: [storybook, fixture-controls, fakes, lifecycle]
---

Applies to: whoever writes or reviews a story, a journey step or `.storybook/preview.tsx`. The fixture-controls module is `src/io/__mocks__/fixture-controls.ts`, beside the I/O layer stand-in (stories-get-io-from-stand-ins-beside-the-io-module.md). Every control registers itself there when it is created, and `resetAll()` resets every registered control.

Call `resetAll()` in the first Given of every journey, so no I/O control a previous story set is still in force. Never reset controls from a hand-written list.

When a component reads a control while it mounts (its services are built on mount, or it fetches on mount), call `resetAll()` in the story's `beforeEach`, set the control there, and return the function that undoes it. A Given runs after mount and sets that state too late.

A step changes I/O behaviour only through a named fixture control (hold a write, raise a fault at a boundary, answer a question), set before the action whose outcome it asserts. A step never reaches into a stand-in's internals or a component's state.

The preview's decorator provides the registry the production entry uses. Never create a registry during render (useState, useRef, a key remount): `RegistryProvider` reads its options only on first render, so a story can inherit another's registry. `resetAll()` resets I/O controls only, not atom state.

```typescript
// WRONG: the runtime was built on mount, before this Given ran
Given('the server is unavailable', () => { rpc.failNext('unavailable') })
// RIGHT: the story's meta
beforeEach: () => { resetAll(); rpc.failNext('unavailable'); return resetAll },
```
