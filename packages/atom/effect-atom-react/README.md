# @systemfsoftware/effect-atom-react

React bindings for effect-atom — forked under systemfsoftware from tim-smart/effect-atom.

## Install

```sh
pnpm add @systemfsoftware/effect-atom-react 'effect@^4' 'react@^19.2.8' 'react-dom@^19.2.8' 'scheduler@*'
```

Those are peer dependencies: this package declares them but does not install them, so one copy is shared with the rest of your project.

## Entry points

One entry, one namespace:

```ts
import { AtomReact } from '@systemfsoftware/effect-atom-react'

// inside a component under <AtomReact.RegistryProvider registry={registry}>
const value = AtomReact.useAtomValue(count)
```

## Owning the registry

The code that mounts the app owns its registry: an app's entry, an island's module, a per-request server handler, or a Storybook story's loader. It creates the registry before the first render, passes it to `RegistryProvider`, and disposes it at teardown. `RegistryProvider` only provides the registry it is given.

```ts
import { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'

const registry = Atom.Registry.make({ scheduleTask: AtomReact.scheduleTask })
const root = createRoot(container)
root.render(createElement(AtomReact.RegistryProvider, { registry }, createElement(App)))

// at teardown
root.unmount()
Atom.Registry.dispose(registry)
```

Pass `scheduleTask: AtomReact.scheduleTask` so registry work runs at React's low priority. Without it, the registry runs work on the host's own dispatcher.

Create the registry outside render. React keeps no state for a render that suspended before its first mount and retries it from scratch, so a registry created during render is rebuilt on every retry and never disposed. Unmounting the root disposes nothing; the owner's `Atom.Registry.dispose` does. An owner that runs inside an Effect can compose `Atom.Registry.layer` instead, which disposes the registry when its scope closes.

## Restoring saved state before the first render

Saved data reaches a registry before the first render; the binding never writes saved data. `Atom.Hydration.hydrate` assigns the saved value to each atom the state names and replaces a value the registry already holds, so the owner restores saved state before the first render, while those atoms have not been read yet; a registry that already holds one of them is not a hydrate target.

The owner writes it in one of three forms, before `hydrateRoot` or `createRoot(...).render`:

1. **Seeds.** `Atom.Registry.make({ initialValues, scheduleTask: AtomReact.scheduleTask })` for typed values the owner already holds, such as an app entry's Layer choice or a story's fakes.
2. **Saved state.** `Atom.Hydration.hydrate(registry, state)` on state the server produced with `Atom.Hydration.dehydrate`. On the server, each request makes, hydrates and disposes its own registry.
3. **Routed apps.** The router's own hydrate option, run before render.

One write happens later, outside React: an entry the server dehydrated while still pending (`encodeInitialAs: 'deferred'`) is completed when the server's promise resolves. It finishes the same server render rather than delivering a second saved page, and components see it through their subscription like any other update.

## Islands

An island that takes no server-data props makes its registry at module scope, `Atom.Registry.make({ scheduleTask: AtomReact.scheduleTask })`, and its root component renders `RegistryProvider` with it. The module is imported before the framework creates the island's root, so the registry exists before any render, and every instance of the island on the page shares it.

- **Props.** A supported island seeds no atom from its props: props exist only inside the island's first render. Its server data comes through atoms over the app runtime's services. Props that seed nothing, such as a label or an id, are fine.
- **Server render.** When the island is also rendered on the server, its module-scope registry is shared by every request in that process. Every atom the island reads during a server render carries `Atom.withServerValue` with a request-independent value, or `Atom.withServerValueInitial` for a result atom; otherwise render it client-only.
- **Teardown.** The island's teardown is the document's unload. When a client-side navigation unmounts the island, each atom it no longer reads is released and its fiber interrupted; a `keepAlive` atom stays in the registry for the next page that mounts the island. No island calls `Atom.Registry.dispose`.

## API

The public surface is generated from the source and versioned with the package: [`etc/effect-atom-react.api.md`](./etc/effect-atom-react.api.md).

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/effect-atom/atom-react#readme).
