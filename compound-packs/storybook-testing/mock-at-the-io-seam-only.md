---
title: A Storybook UI test substitutes only the module that composes the app's typed I/O Layer
applies_when:
  - authoring a Storybook preview or story that substitutes a module
  - an AI agent proposes sb.mock on a component, hook, atom, router, or any other module
  - reviewing a __mocks__ module or an sb.mock call added to a UI test
tags: [storybook, testing, no-mocks, composition, io-seam, anti-slop]
---

A Storybook UI test substitutes exactly one module, the one that composes the app's typed I/O Layer, and never mocks a component, hook, atom, store, or any other module.

A story proves the real app at composition altitude: real components, real hooks, real atoms and real decisions, composed as they ship, over a fake I/O Layer. Every other module a story replaces is code the story no longer proves, and a component or hook stand-in returns whatever the author expected, so the story passes while the shipped app is broken.

1. **One seam.** The preview calls `sb.mock` on the module that composes the app's I/O Layer, and on nothing else. A story that needs different I/O state gets it from the fake Layer and its controls (`states-via-fixture-controls`), not from a second substituted module.
2. **Storybook's `__mocks__/` is the one sanctioned folder named for a kind of code.** It sits beside the module that composes the app's I/O Layer, because `sb.mock` automocking resolves the sibling `__mocks__/` module. Outside Storybook the test double is each port's `layerTest`, and `__mocks__` is not used. Where real implementations and `layerTest` live is `cell-architecture/service-and-layer-boundaries.md`'s concern.
3. **Doubles of drivers inside a boundary adapter** are governed by `boundary-testing/no-mocks-on-internal-glue.md`, which names this substitution as a boundary stand-in.

```ts
// WRONG: the preview replaces a component, a hook and an atom, so every story renders
// canned values and proves none of the code it replaced
// .storybook/preview.tsx
sb.mock(import('../src/channel/channel-list.tsx'))
sb.mock(import('../src/channel/use-unread-count.ts'))
sb.mock(import('../src/channel/channel.atom.ts'))

// RIGHT: the preview replaces only the module that composes the app's I/O Layer.
// Storybook resolves src/__mocks__/app-io.ts beside it, and every story mounts the real app.
// .storybook/preview.tsx
sb.mock(import('../src/app-io.ts'))

// a journey story: the real app, nothing else replaced
export default { title: 'Journeys/Post a message', component: App }
```

Gate: `review` — reject any `sb.mock` call whose target is not the module that composes the app's I/O Layer, and any `__mocks__/` folder anywhere else.
