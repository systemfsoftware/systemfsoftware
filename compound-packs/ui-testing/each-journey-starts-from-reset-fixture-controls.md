---
title: Each journey starts from reset fixture controls, set before mount when mount reads them, and a step sets a control only before the action it tests; a control steers behaviour, never data
applies_when:
  - writing the preview's decorator, a story's beforeEach or a journey's first Given
  - a story needs the I/O layer stand-in to hold a write, fail at a boundary, wait for a person's approval or give a different answer
  - a story seems to need different data
tags: [storybook, fixture-controls, fakes, lifecycle]
---

Applies to: whoever writes or reviews a story, a step file or `.storybook/preview.tsx`. The app's fixture-controls module is `src/io/__mocks__/fixture-controls.ts`, beside the I/O layer stand-in. It names the app's controls and builds them from the primitives in the workspace package `packages/fixture-controls`, where every control registers itself when it is created and `resetAll()` resets every registered control (stories-get-io-from-stand-ins-beside-the-io-module.md; worked-example-preview-stand-ins-story-and-contract-suite.md shows both files whole).

Call `resetAll()` in the first Given of every journey, so no control a previous story set is still in force. Never reset controls from a hand-written list.

When a component reads a control while it mounts (its services are built on mount, or it fetches on mount), call `resetAll()` in the story's `beforeEach`, set the control there, and return the function that undoes it. A Given runs after mount and sets that state too late. State that the I/O layer would answer (no account, an unavailable service) is set this way, by a named control the stand-in consults; never by writing an app atom from a story or decorator.

A step changes the stand-in's behaviour only through a named control: hold or confirm a write, raise a fault at a boundary, hold or answer a person's approval. It sets the control before the action whose outcome it asserts. A step never supplies data. A story's data is the stand-in's seed: a step names a seeded record and finds it the way a person would, or the person's actions in the real UI create it. Data the seed lacks is added to the seed. A control holds behaviour or one value the stand-in produced, never the records a screen lists. A step never reaches into a stand-in's internals or a component's state.

The preview's decorator provides the registry the production entry uses. Never create a registry during render (useState, useRef, a key remount): `RegistryProvider` reads its options only on first render, so a story can inherit another's registry. `resetAll()` resets I/O controls only. Atom state and the stand-in's world reset because each story mounts a new registry, which builds a new runtime and a new world.

```typescript
// WRONG: the runtime was built on mount, before this Given ran
Given('the orders cannot be read', () => setOrdersReadFault(true))
// WRONG: a story pushes data into a fixture module
export const Shown = { beforeEach: () => seedOrders([{ id: 'o-9', name: 'Sofa', total: 900 }]) }
// WRONG: a decorator writes an app atom to set an I/O answer
const withNoAccount = (Story) => {
  useAtomSet(accountAtom)(AccountAnswer.None())
  return <Story />
}
// WRONG: fixture controls modelled as an I/O service
const readOrders = Effect.gen(function*() {
  const controls = yield* FixtureControls
  return yield* Ref.get(controls.orders)
})
// WRONG: control primitives defined inside the app, in src/io/__mocks__/fixture-controls.ts
export const makeLanding = (name: string, phases: ReadonlyArray<string>) => {/* ... */}
// RIGHT: the story's meta, for a fault read while the component mounts
const meta = {
  component: OrdersPanel,
  beforeEach: () => {
    resetAll()
    setOrdersReadFault(true)
    return resetAll
  },
}
// RIGHT: a Given that holds a write before the When that places it
const placingIsSlow = Given`placing an order is slow`(() => holdOrderLanding())
```
