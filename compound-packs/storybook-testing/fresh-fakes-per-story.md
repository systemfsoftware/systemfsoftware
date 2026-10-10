---
title: Every story starts from freshly built fakes and sets I/O state only through their configurable responses
applies_when:
  - a story needs a fault armed, a history seeded or a peer to answer a certain way
  - an AI agent proposes a module-scope switch, a shared record or a reset list in `beforeEach`
  - reviewing why a story passes alone and fails after another story, or the reverse
tags: [storybook, fakes, isolation, configurable-responses, parameters, registry]
---

Every story starts from freshly built fakes and sets I/O state and faults only through those fakes' configurable responses, so no switch or record survives into the next story. A switch at module scope outlives the story that set it. The next story then passes or fails by the order stories ran in, and a reset list kept by hand misses whatever state was added after the list was written. Shore's Configurable Responses names the alternative: the factory that builds the dependency takes the desired response as a parameter, defined by the dependency's externally visible behaviour.

Freshness is structural. The preview's decorator keys the registry provider on the story's id (see `stories-compose-at-their-own-root.md`), so each story gets a new registry. The fake Layer, and every piece of state it allocates while it is built, is constructed once for that story and discarded with it. Storybook's Interaction tests page requires that state be reset between stories to keep them isolated; this seam meets that requirement by construction rather than by the `beforeEach` reset the page shows.

1. **State is allocated inside the fake's construction.** A fake that records what it was sent, or serves a history, allocates that state while its Layer is built. It never closes over a variable at module scope.
2. **A story configures responses through `parameters`.** The story states what the fakes answer, such as a fault to arm or a history to seed, in its exported `parameters`. The preview's decorator reads those parameters and builds the fake from them, the mechanism Storybook's Mocking providers page documents for varying a provided value per story.
3. **No reset list.** A preview or story never resets fake state in `beforeEach` or a cleanup function. A fake built fresh has nothing to reset, and a list that resets by name misses every switch added after it.
4. **No arming during play.** A play function or step never flips a fake's switch partway through a story. A story that needs the peer to change its answer configures that sequence of responses up front.

```tsx
import type { Preview, StoryObj } from '@storybook/react-vite'
import { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { Context, Data, Effect, Layer, Ref } from 'effect'

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
  decorators: [
    (Story) => (
      <AtomReact.RegistryProvider initialValues={[Atom.initialValue(appLayer, sharedFake)]}>
        <Story />
      </AtomReact.RegistryProvider>
    ),
  ],
} satisfies Preview

export const SendFailsBySwitch = {
  play: () => {
    sendFails = true
  },
} satisfies StoryObj

// RIGHT: the story states its responses in parameters; the fake allocates its history
// while it is built, once per story, inside a registry keyed on the story's id.
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
  decorators: [
    (Story, { id, parameters }) => (
      <AtomReact.RegistryProvider
        key={id}
        initialValues={[Atom.initialValue(appLayer, fakeMessages({ ...noFaults, ...parameters['messages'] }))]}
      >
        <Story />
      </AtomReact.RegistryProvider>
    ),
  ],
} satisfies Preview

export const SendFails = { parameters: { messages: { sendFails: true } } } satisfies StoryObj
```

Grounds: James Shore, Testing Without Mocks, Configurable Responses (https://www.jamesshore.com/v2/projects/nullables/testing-without-mocks); Storybook 10.6, Mocking providers (https://storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-providers) and Interaction tests (https://storybook.js.org/docs/writing-tests/interaction-testing).

Gate: `review` — reject fake state held at module scope, a switch flipped during play, or a reset list in `beforeEach` or a cleanup function; verify each story's responses come from its own `parameters` into a fake built for that story.
