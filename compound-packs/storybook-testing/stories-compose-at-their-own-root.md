---
title: A story gets its I/O from port fakes the preview provides through the production entry's provider, never by module substitution
applies_when:
  - a story's components reach I/O, navigation history or other infrastructure
  - an AI agent proposes `sb.mock`, an alias or a subpath import to stand in for a first-party module
  - writing or reviewing the loaders, `beforeEach` or decorators in `.storybook/preview.*`, or the registry the production entry renders with
tags: [storybook, composition-root, provider, layer, sb-mock, fakes, registry]
---

A story whose components reach I/O, navigation history or other infrastructure gets it from port fakes that the preview provides through the same provider the production entry uses, and no preview or story substitutes a first-party module by `sb.mock`, alias or subpath import. Storybook documents both seams: module mocking, and decorators that wrap a story in a provider. This pack picks the provider. Seemann places composition at an application's entry point. A Storybook build is a separate application, so its preview composes the real app, and only the Layer it provides differs from production. A provider passes a Layer, which is a value, and Bernhardt argues for values as the boundaries between components.

`sb.mock` costs four things. It registers only in the preview, so every story shares one substitution. It binds to the module's file path, so moving the module breaks every story that relied on it. With no mock file beside the module, it automocks every export into a mock function that returns `undefined` until a story configures it. And reaching the mock takes the `mocked()` wrapper plus an `import()` path for typing. Shore's "Replace Mocks with Nullables" replaces mocks, spies and other test doubles, module mocks included, with a Nulled version of the real dependency.

1. **One provider, two roots.** Components reach I/O only through a runtime that reads one writable Layer atom. The production entry builds its registry before it renders, seeds that atom with the live Layer, and renders the registry provider with it. The preview's loader builds each story's registry and seeds the same atom with a fake Layer, and its decorator renders the same provider with it. Nothing else differs. Neither root builds a registry while it renders; `fresh-fakes-per-story.md` gives the story registry's lifetime.
2. **The default fails on use.** The atom's own default is a Layer typed to the app's services that fails when used. A component module therefore never imports the live adapters, and only the production entry references them.
3. **No module substitution for first-party code.** No preview or story calls `sb.mock` on a first-party module, aliases its import or redirects it through a subpath import. A story that needs different I/O behaviour gets it from the fake's configuration (see `fresh-fakes-per-story.md`).
4. **Only admissible fakes.** A fake is provided to stories once it is typed to its port and passes the contract suite it shares with the real adapter. Admissibility is defined in `boundary-testing/port-fakes-pass-the-port-contract.md`, and doubles inside an adapter's own tests in `boundary-testing/no-mocks-on-internal-glue.md`. Neither is restated here.

```tsx
import type { Preview, StoryObj } from '@storybook/react-vite'
import { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { Context, Data, Effect, Layer } from 'effect'
import { mocked, sb } from 'storybook/test'
import { postMessage } from '../src/channel-messages.ts'

// WRONG: the preview swaps a first-party module by its path and a story steers it through
// `mocked()`; every story shares the swap, and moving the module breaks them all.
sb.mock(import('../src/channel-messages.ts'))

export const SendFailsThroughModuleMock = {
  beforeEach: () => {
    mocked(postMessage).mockRejectedValue(new Error('send failed'))
  },
} satisfies StoryObj<typeof Composer>

// RIGHT: one Layer atom; the entry seeds it live, the preview seeds it with a fake built
// from the story's parameters. Each root builds its registry before render and passes it
// through the same provider.
class SendFailed extends Data.TaggedError('SendFailed') {}

class Messages extends Context.Service<Messages, {
  readonly post: (text: string) => Effect.Effect<void, SendFailed>
}>()('Messages') {}

const appLayer = Atom.make(Layer.effect(Messages)(Effect.die('no Messages Layer was provided')))
const appRuntime = Atom.context()((get) => get(appLayer))
const send = appRuntime.fn((text: string) => Messages.use((messages) => messages.post(text)))

function Composer() {
  const post = AtomReact.useAtomSet(send)
  return <button type='button' onClick={() => post('Hello all')}>Send</button>
}

const liveMessages = Layer.succeed(Messages)({ post: (text) => sendToServer(text) })

const entryRegistry = Atom.Registry.make({
  initialValues: [Atom.initialValue(appLayer, liveMessages)],
  scheduleTask: AtomReact.scheduleTask,
})

export const entry = (
  <AtomReact.RegistryContext.Provider value={entryRegistry}>
    <Composer />
  </AtomReact.RegistryContext.Provider>
)

const fakeMessages = (io: { readonly sendFails: boolean }) =>
  Layer.succeed(Messages)({ post: () => (io.sendFails ? Effect.fail(new SendFailed()) : Effect.void) })

export default {
  loaders: [
    ({ parameters }) => ({
      registry: Atom.Registry.make({
        initialValues: [Atom.initialValue(appLayer, fakeMessages(parameters['io'] ?? { sendFails: false }))],
        scheduleTask: AtomReact.scheduleTask,
      }),
    }),
  ],
  beforeEach: ({ loaded }) => () => Atom.Registry.dispose(loaded['registry']),
  decorators: [
    (Story, { loaded }) => (
      <AtomReact.RegistryContext.Provider value={loaded['registry']}>
        <Story />
      </AtomReact.RegistryContext.Provider>
    ),
  ],
} satisfies Preview

export const SendFails = { parameters: { io: { sendFails: true } } } satisfies StoryObj<typeof Composer>
```

Grounds: Mark Seemann, Composition Root (https://blog.ploeh.dk/2011/07/28/CompositionRoot/); Gary Bernhardt, Boundaries (https://www.destroyallsoftware.com/talks/boundaries); James Shore, Testing Without Mocks, Replace Mocks with Nullables (https://www.jamesshore.com/v2/projects/nullables/testing-without-mocks); Storybook 10.6, Mocking modules (https://storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-modules) and Mocking providers (https://storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-providers); Storybook source, `resolveMock` (https://github.com/storybookjs/storybook/blob/v10.6.1/code/core/src/mocking-utils/resolve.ts#L54-L79).

Gate: `review` — reject a preview or story that calls `sb.mock` on a first-party module, aliases or redirects one, or provides I/O through anything but the provider the production entry uses; reject a production entry or preview that builds its registry while rendering; reject a fake provided to stories without the shared contract suite.
