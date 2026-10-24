---
title: A story gets its I/O from a fake Layer the preview seeds into the production provider, never by module substitution
applies_when:
  - a story's components reach I/O, navigation or other infrastructure
  - writing the loaders, decorators or beforeEach in .storybook/preview, or the registry the production entry renders with
tags: [storybook, provider, layer, fakes]
---

Components reach I/O only through one writable Layer atom. The production entry seeds it with the live Layer, and the Storybook preview seeds it with a fake Layer. Both render through the same registry provider.

The Layer atom's own default is a Layer typed to the app's services that fails on use.

No preview or story substitutes a first-party module by sb.mock, a bundler or Storybook alias, or a subpath or imports-map redirect.

A story renders components under the preview's provider. It never imports the application entry module, never renders a router-owned route or built output, and never renders an iframe whose src is a route, a build directory or a URL.

```typescript
// WRONG
sb.mock(import('../src/channel-messages.ts'))
```

```typescript
// RIGHT
// .storybook/preview.tsx
loaders: [({ parameters }) => ({
  registry: Atom.Registry.make({
    initialValues: [Atom.initialValue(appLayerAtom, fakeAppLayer(parameters.messages))],
    scheduleTask: AtomReact.scheduleTask,
  }),
})],
```

Gate: judge
