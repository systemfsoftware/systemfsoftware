---
title: The Storybook I/O fake is typed to the real Layer and built from one fake per service
applies_when:
  - writing or extending the Storybook fake I/O Layer
  - adding a service to the app's I/O Layer
  - an AI agent proposes a cast stand-in such as {} as SomeService to satisfy a fake
  - reviewing a __mocks__ Layer
tags: [storybook, fakes, types, layer, io-seam]
---

The I/O fake is typed against the real Layer and composed from one fake per I/O service (each port's `layerTest`), with no cast stand-in for any service.

A fake that is not typed to the real Layer drifts silently: a service added, renamed or reshaped in the real Layer still compiles against the fake, and stories keep passing over a shape the app no longer has. A cast stand-in compiles and answers nothing, so the first story that reaches it fails at runtime, or never reaches it and proves nothing. One file holding every service's fake grows until no one can tell which fake a story depends on.

1. **Typed to the real Layer.** The `__mocks__/` module (why it exists: `mock-at-the-io-seam-only`) exports its Layer under the real Layer's type, imported as a type from the module it replaces. When the real Layer gains or reshapes a service, the fake stops compiling; a service the real Layer removed is caught in review.
2. **One fake per service, owned by its port.** Each port carries its own fake as its `layerTest`, and the `__mocks__/` module only merges them. Where `layerTest` and real implementations live is `cell-architecture/service-and-layer-boundaries.md`'s concern.
3. **No casts.** A service with no useful fake yet gets a `layerTest` that fails every call with the port's own tagged error, never `{} as SomeService`.
4. **Static shape only.** That the fake also behaves like the real adapter is `storybook-io-fake-parity-law`'s concern.

```ts
// WRONG: one module defines every service's fake inline, untyped against the real Layer,
// and one service is a cast stand-in that answers nothing
// src/__mocks__/app-io.ts
export const appIOInline = Layer.mergeAll(
  Layer.succeed(Directory, { lookup: () => Effect.succeedNone }),
  Layer.succeed(Messages, {} as Context.Service.Shape<typeof Messages>),
  // ...every other service's fake, inline in this one file
)

// RIGHT: each port owns its fake, and the __mocks__ module merges them under the real Layer's type
// src/messages/messages.service.ts
export class Messages extends Context.Service<Messages, {
  readonly post: (channel: ChannelId, text: string) => Effect.Effect<void, MessagePostFailed>
  readonly list: (channel: ChannelId) => Effect.Effect<ReadonlyArray<Message>>
}>()('app/Messages') {
  static readonly layerTest = Layer.effect(
    Messages,
    Effect.gen(function*() {
      const posted = yield* Ref.make<ReadonlyArray<Message>>([])
      return {
        post: (channel: ChannelId, text: string) => Ref.update(posted, (all) => [...all, { channel, text }]),
        list: (channel: ChannelId) =>
          Ref.get(posted).pipe(Effect.map((all) => all.filter((m) => m.channel === channel))),
      }
    }),
  )
}

// src/__mocks__/app-io.ts
import type { AppIOLayer } from '../app-io.ts'

export const appIO: AppIOLayer = Layer.mergeAll(Directory.layerTest, Messages.layerTest, Drafts.layerTest)
```

Gate: the compiler fails the fake when the real Layer gains or reshapes a service; `review` — reject a fake Layer exported without the real Layer's type, a fake left for a service the real Layer removed, a service fake defined outside its port, and any `as` cast standing in for a service.
