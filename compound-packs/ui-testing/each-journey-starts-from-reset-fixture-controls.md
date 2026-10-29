---
title: Each journey starts from reset fixture controls, set before mount when mount reads them, and a step sets a control only before the action it tests
applies_when:
  - writing the preview's decorator, a story's beforeEach or a journey's first Given
  - a story needs an I/O stand-in to answer differently, hold or fail
tags: [storybook, fixture-controls, fakes, lifecycle]
---

The first Given of every journey calls the fixture-controls module's `resetAll()`, so no I/O control a previous story set is still in force. No list of controls is reset by hand.

When a component reads a control while it mounts (its services are built on mount, or it fetches on mount), the story's `beforeEach` calls `resetAll()`, sets that control, and returns the function that undoes it. A Given runs after mount and cannot place that state.

A step changes I/O behaviour only through a named fixture control (hold a write, raise a fault at a boundary, answer a question) and sets it before the action whose outcome it asserts. A step never reaches into a stand-in's internals or a component's state.

The preview's decorator provides the registry the production entry uses. No decorator, provider or component creates a registry during render (useState, useRef, a key remount). `resetAll()` resets I/O controls only; atom state in that registry is not reset by it.

Decision test: can any I/O control a story reads have been left set by another story or set by anything but a fixture control (a first Given that does not call `resetAll()`, controls reset by a hand-written list, a `beforeEach` that sets a control without `resetAll()` first or without returning its undo, a step that reaches into a stand-in), is a control a component reads on mount set in a Given instead of `beforeEach`, is a control set after the action whose outcome it asserts, or does anything create a registry during render? If yes, it fails.

Defect prevented: stories that leak into each other pass or fail by run order. A control set in a Given when the component read it on mount is set too late, so the story passes without ever exercising that state. A registry made in render is a second leak: RegistryProvider reads its options only on first render and, on unmount, delays disposal and cancels it if the provider remounts, so a story can inherit another story's registry.

```typescript
// WRONG: the runtime was built on mount, before this Given ran
Given('the server is unavailable', () => {
  rpc.failNext('unavailable')
})
```

```typescript
// RIGHT: startup-unavailable.stories.tsx
beforeEach: () => {
  resetAll()
  rpc.failNext('unavailable')
  return resetAll
},
```

Sources: owner ruling, 2026-10-29: the reference app's pattern overrides this pack. The reference app's `features/steps/app-shell.ts` calls `resetAll()` in its first Given; its `features/startup-unavailable.stories.tsx` resets and sets a fault in `beforeEach` because "a `Given` step runs after the runtime already exists and would prove nothing". effect-atom-react RegistryProvider documentation (packages/atom/effect-atom-react/src/registry-context.ts): "Option changes after the first render do not rebuild the registry. When the provider unmounts, registry disposal is delayed briefly and canceled if the provider remounts before the timeout fires."

Gate: judge
