---
title: Every story starts from freshly built fakes in a registry built before it renders, and sets I/O state only through their configurable responses
applies_when:
  - a story needs a fault armed, a history seeded or a peer to answer a certain way
  - a preview or story creates, seeds, provides or disposes the atom registry a story renders against
  - an AI agent proposes a module-scope switch, a shared record, a reset list in `beforeEach`, or a registry created inside a decorator or component
  - reviewing why a story passes alone and fails after another story, or the reverse
tags: [storybook, fakes, isolation, configurable-responses, parameters, registry, loaders, lifecycle]
---

Every story starts from freshly built fakes and sets I/O state and faults only through those fakes' configurable responses, so no switch or record survives into the next story. A switch at module scope outlives the story that set it. The next story then passes or fails by the order stories ran in, and a reset list kept by hand misses whatever state was added after the list was written. Shore's Configurable Responses names the alternative: the factory that builds the dependency takes the desired response as a parameter, defined by the dependency's externally visible behaviour.

Freshness is structural. The preview's loader builds each story's registry before the story renders, seeded with a fake built from that story's parameters. Its decorator only provides that registry, and its `beforeEach` returns the cleanup that disposes it. Each story therefore starts from a new registry, and every piece of state its fake Layer allocates is discarded with that registry. Storybook 10.6 runs a story's loaders before render and hands their result to decorators as `context.loaded`. It runs `beforeEach` after the loaders on the same context, and keeps the function `beforeEach` returns as a cleanup:

- **Storybook UI:** loaders and `beforeEach` run again on every render of the story, an args change included, so each render that reaches `beforeEach` builds its own registry and adds its own cleanup. A render aborted between the two leaves a registry nothing read, which holds seeds and runs no atom. Every cleanup runs when the story is torn down, before Storybook leaves the canvas to the next story. A disposed registry notifies no listener, so it starts no render of the old story's tree.
- **Portable stories (`@storybook/addon-vitest`):** the cleanup runs, after the story's React root unmounts, when the next story starts.

`afterEach` runs as soon as `play` ends, while the story is still on screen, so it is never where the registry is disposed. Storybook's Interaction tests page requires that state be reset between stories to keep them isolated; this seam meets that requirement by construction rather than by the `beforeEach` reset the page shows.

1. **State is allocated inside the fake's construction.** A fake that records what it was sent, or serves a history, allocates that state while its Layer is built. It never closes over a variable at module scope.
2. **A story configures responses through `parameters`.** The story states what the fakes answer, such as a fault to arm or a history to seed, in its exported `parameters`. The preview's loader reads those parameters and builds the fake from them, the mechanism Storybook's Mocking providers page documents for varying a provided value per story.
3. **No reset list.** A preview or story never resets fake state in `beforeEach` or a cleanup function. A fake built fresh has nothing to reset, and a list that resets by name misses every switch added after it. The one cleanup a preview's `beforeEach` returns disposes the story's registry. That ends every fake built into the registry at once, and resets none by name.
4. **No arming during play.** A play function or step never flips a fake's switch partway through a story. A story that needs the peer to change its answer configures that sequence of responses up front.
5. **The registry is built before render, never during it.** No decorator, provider or component creates the story's registry in render or in render state (`useState`, `useRef`, a `key` remount), and no story renders a provider that builds its own registry. React keeps no state for a render that suspended before its first mount, and retries that tree from scratch. A registry made in render is therefore rebuilt on every retry, the suspended atom starts again in each new registry, and nothing disposes the abandoned ones. The loader builds the registry with `Atom.Registry.make`, passing `AtomReact.scheduleTask` so atom work keeps the React scheduler the provider used. The decorator provides `context.loaded`'s registry.

Incident (2026-10-13), from two browser probes:

- **The effect-atom React binding:** a registry provider whose first mount suspended on an atom never showed its content. It built six registries and started the atom six times. With the `Suspense` boundary inside the provider, the same atom showed its value from one registry.
- **Storybook 10.6 under `@storybook/addon-vitest`:** an owner kept in component state was created twice across a suspended first mount, and nothing disposed the first. An owner built by the story's loader was the same object through the suspended retry, was seen by `beforeEach`, the decorator and the render, and was disposed before the next story built its own.

```tsx
import type { Preview, StoryObj } from '@storybook/react-vite'
import { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { Context, Data, Effect, Layer, Ref } from 'effect'
import { type ReactNode, useState } from 'react'

class SendFailed extends Data.TaggedError('SendFailed') {}

class Messages extends Context.Service<Messages, {
  readonly post: (text: string) => Effect.Effect<void, SendFailed>
  readonly history: Effect.Effect<ReadonlyArray<string>>
}>()('Messages') {}

const appLayer = Atom.make(Layer.effect(Messages)(Effect.die('no Messages Layer was provided')))

// WRONG: the fault switch and the history live at module scope; a story arms the switch
// during play, and the reset list in beforeEach forgets the history.
let sendFails = false
const sent: Array<string> = []

const sharedFake = Layer.succeed(Messages)({
  post: (text) => (sendFails ? Effect.fail(new SendFailed()) : Effect.sync(() => void sent.push(text))),
  history: Effect.sync(() => [...sent]),
})

export const sharedPreview = {
  beforeEach: () => {
    sendFails = false
  },
} satisfies Preview

export const SendFailsBySwitch = {
  play: () => {
    sendFails = true
  },
} satisfies StoryObj

// WRONG: the decorator builds the registry in render state. A first mount that suspends
// rebuilds it on every retry, and no one disposes the registries it leaves behind.
function StoryRegistry(props: { readonly children: ReactNode }) {
  const [registry] = useState(() => Atom.Registry.make({ initialValues: [Atom.initialValue(appLayer, sharedFake)] }))
  return <AtomReact.RegistryContext.Provider value={registry}>{props.children}</AtomReact.RegistryContext.Provider>
}

export const renderBuiltPreview = {
  decorators: [
    (Story, { id }) => (
      <StoryRegistry key={id}>
        <Story />
      </StoryRegistry>
    ),
  ],
} satisfies Preview

// RIGHT: the story states its responses in parameters. The loader builds the story's registry
// before render, seeded with a fake that allocates its history while it is built; the decorator
// only provides it, and the cleanup beforeEach returns disposes it.
interface MessagesResponses {
  readonly sendFails: boolean
  readonly history: ReadonlyArray<string>
}

const noFaults: MessagesResponses = { sendFails: false, history: [] }

const fakeMessages = (responses: MessagesResponses) =>
  Layer.effect(Messages)(
    Effect.gen(function*() {
      const sentHere = yield* Ref.make(responses.history)
      return {
        post: (text: string) =>
          responses.sendFails ? Effect.fail(new SendFailed()) : Ref.update(sentHere, (all) => [...all, text]),
        history: Ref.get(sentHere),
      }
    }),
  )

export default {
  loaders: [
    ({ parameters }) => ({
      registry: Atom.Registry.make({
        initialValues: [Atom.initialValue(appLayer, fakeMessages({ ...noFaults, ...parameters['messages'] }))],
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

export const SendFails = { parameters: { messages: { sendFails: true } } } satisfies StoryObj
```

Grounds:

- James Shore, Testing Without Mocks, Configurable Responses (https://www.jamesshore.com/v2/projects/nullables/testing-without-mocks).
- Storybook 10.6: Mocking providers (https://storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-providers), Loaders (https://storybook.js.org/docs/writing-stories/loaders) and Interaction tests (https://storybook.js.org/docs/writing-tests/interaction-testing).
- Storybook source at v10.6.0:
  - `StoryRender.ts`: loaders before render (L288), the shared context passed to the story function (L284), an aborted render returning before `beforeEach` (L291-L293), the `beforeEach` cleanup registered (L295-L296), `afterEach` after play (L395), a rerender running the whole render again (L440-L445), and cleanup at teardown before the canvas is torn down (L469-L483). https://github.com/storybookjs/storybook/blob/v10.6.0/code/core/src/preview-api/modules/preview-web/render/StoryRender.ts
  - `portable-stories.ts`: cleanups run when the next story starts (L311-L314), then loaders (L327), `beforeEach` (L333) and `afterEach` (L363). https://github.com/storybookjs/storybook/blob/v10.6.0/code/core/src/preview-api/modules/store/csf/portable-stories.ts
- `@systemfsoftware/effect-atom`: a new registry only records its seeds until an atom is read (`packages/atom/effect-atom/src/registry-engine.ts:531-539`); disposing a registry removes every node (`:763-779`), and removing a node clears its listeners (`atom-node.ts:438-442`).
- react.dev, `<Suspense>` caveats: "React does not preserve any state for renders that got suspended before they were able to mount for the first time" (https://react.dev/reference/react/Suspense).

Gate: `review` — reject fake state held at module scope, a switch flipped during play, a reset list in `beforeEach` or a cleanup function, or a story registry created by a decorator, provider or component during render; verify each story's responses come from its own `parameters` into a fake seeded into a registry the story's loader builds, and that the cleanup `beforeEach` returns disposes that registry.
