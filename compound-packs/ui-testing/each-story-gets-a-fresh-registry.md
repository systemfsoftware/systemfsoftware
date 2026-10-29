---
title: Each story's registry and fake are built before render from that story's parameters, never changed during it, and disposed after it
applies_when:
  - writing the preview's loader, decorator or beforeEach in an effect-atom application
  - a story needs a fake to answer differently, fail, or change its answer over time
tags: [storybook, registry, fakes, lifecycle]
---

Before render, the preview's loader builds each story's registry with Atom.Registry.make and scheduleTask: AtomReact.scheduleTask (the scheduler the production RegistryProvider uses), seeded with a fake built from that story's parameters.

The preview's decorator only provides the loaded registry. No decorator, provider or component creates a registry during render (useState, useRef, a key remount).

The preview's beforeEach returns a cleanup that disposes the loaded registry with Atom.Registry.dispose. No beforeEach, afterEach or cleanup resets or changes fake state.

A fake allocates its state while its Layer is built, so no fake state outlives the story's registry; it never closes over a module-scope variable.

A story sets I/O responses and faults only through its parameters. No play function or step definition, Given included, changes a fake mid-story. A peer that changes its answer is configured up front as a sequence of responses.

Decision test: can any state a story reads have been set by another story, or by anything other than that story's parameters (a registry made in render, a registry not disposed, module-scope fake state, a reset hook, a step that changes a fake)? If yes, it fails.

Defect prevented: stories that leak into each other pass or fail by run order. A registry made in render is the leak: RegistryProvider reads its options only on first render and, on unmount, delays disposal and cancels it if the provider remounts, so the next story can inherit the previous story's registry and ignore its own seed. A fake changed mid-story makes the scenario's Given untrue.

```typescript
// WRONG
let orders: Array<Order> = [] // module scope, shared by every story
const decorators = [(Story) => (
  <RegistryProvider>
    <Story />
  </RegistryProvider>
)]
```

```typescript
// RIGHT
// .storybook/preview.tsx
beforeEach: ({ loaded }) => () => Atom.Registry.dispose(loaded.registry),
decorators: [(Story, { loaded }) => <AtomReact.RegistryContext.Provider value={loaded.registry}><Story /></AtomReact.RegistryContext.Provider>],
```

Source: effect-atom-react RegistryProvider documentation (packages/atom/effect-atom-react/src/registry-context.ts): "Option changes after the first render do not rebuild the registry. When the provider unmounts, registry disposal is delayed briefly and canceled if the provider remounts before the timeout fires."

Gate: judge
