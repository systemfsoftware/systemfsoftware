# @systemfsoftware/effect-atom

Reactive toolkit for Effect — forked under systemfsoftware from tim-smart/effect-atom.

## Install

```sh
pnpm add @systemfsoftware/effect-atom 'effect@4.0.0-rc.108'
```

Those are peer dependencies: this package declares them but does not install them, so one copy is shared with the rest of your project.

## Entry points

One entry, one namespace:

```ts
import { Atom } from '@systemfsoftware/effect-atom'

const count = Atom.make(0)
const registry = Atom.Registry.make()
Atom.Registry.set(registry, count, 1)
```

`Atom.Registry`, `Atom.AsyncResult`, `Atom.Hydration`, `Atom.Ref`, `Atom.HttpApi`, and `Atom.Rpc` replace the former `/Registry`, `/Result`, `/Hydration`, `/AtomRef`, `/AtomHttpApi`, and `/AtomRpc` subpaths.

## API

The public surface is generated from the source and versioned with the package: [`etc/effect-atom.api.md`](./etc/effect-atom.api.md).

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/effect-atom/atom#readme).
