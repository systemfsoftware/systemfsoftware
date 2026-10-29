---
title: A story gets its I/O from a fake Layer the preview seeds into the production provider, never by module substitution
applies_when:
  - a story's components in an effect-atom application reach I/O, navigation or other infrastructure
  - writing the loaders or decorators in .storybook/preview, or the registry the production entry renders with
tags: [storybook, provider, layer, fakes]
---

Components reach I/O only through one writable Layer atom. The production entry seeds it with the live Layer, and the Storybook preview seeds it with a fake Layer. Both render through the same registry provider.

The Layer atom's own default is a Layer typed to the app's services that fails on use.

No preview or story substitutes a first-party module by sb.mock, a bundler or Storybook alias, or a subpath or imports-map redirect.

A story renders components under the preview's provider. It never imports the application entry module, never renders a router-owned route or built output, and never renders an iframe whose src is a route, a build directory or a URL.

Decision test: in the diff, does any story or preview reach I/O by a path other than the fake Layer seeded into the same provider production uses (a module mock, an alias, the app entry, a route, an iframe), or does the Layer atom default to anything but a Layer that fails on use? If yes, it fails.

Defect prevented: a substituted module replaces the code the screen imports, so the story proves a module graph production never runs and stays green when the real wiring between components and their services breaks. Rendering the app entry or a route pulls in the live Layer, so a story performs real I/O. A Layer atom whose default quietly works hides a component rendered outside the provider.

```typescript
// WRONG
sb.mock(import('../src/order-history.ts'))
```

```typescript
// RIGHT
// .storybook/preview.tsx
loaders: [({ parameters }) => ({
  registry: Atom.Registry.make({
    initialValues: [Atom.initialValue(appLayerAtom, fakeAppLayer(parameters.orders))],
    scheduleTask: AtomReact.scheduleTask,
  }),
})],
```

Sources: Storybook, Mocking modules (https://storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-modules): sb.mock transforms the module "at build-time to replace its exports with mocks or spies". Kent C. Dodds, Write tests (https://kentcdodds.com/blog/write-tests): "When you mock something you're removing all confidence in the integration between what you're testing and what's being mocked."

Gate: judge
