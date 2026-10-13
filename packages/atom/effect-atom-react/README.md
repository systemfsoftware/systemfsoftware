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

## API

The public surface is generated from the source and versioned with the package: [`etc/effect-atom-react.api.md`](./etc/effect-atom-react.api.md).

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/effect-atom/atom-react#readme).
