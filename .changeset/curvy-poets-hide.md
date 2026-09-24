---
"@systemfsoftware/effect-atom": major
"@systemfsoftware/effect-atom-react": major
---

Each package now has one entry point with one namespace: `import { Atom } from '@systemfsoftware/effect-atom'` and `import { AtomReact } from '@systemfsoftware/effect-atom-react'`. The `/Atom`, `/Registry`, `/Result`, `/Hydration`, `/AtomRef`, `/AtomHttpApi`, and `/AtomRpc` subpaths are gone; use `Atom.Registry`, `Atom.AsyncResult`, `Atom.Hydration`, `Atom.Ref`, `Atom.HttpApi`, and `Atom.Rpc`.

There is no global registry any more. `Atom.Registry.make` returns a handle whose operations are functions (`Atom.Registry.get(registry, atom)` or `registry.pipe(Atom.Registry.get(atom))`), `Atom.Registry.Current` is the service tag, and `Atom.Registry.layer(tag, options?)` provides a registry under any tag. Each registry keeps its own clock, timers, hook caches, and batch: `Atom.Registry.batch(registry, f)` defers notifications only for that registry. `Atom.Ref` values are handles with the same data-first and data-last operations.

`AtomReact` hooks throw when no `RegistryProvider` is above them, and Suspense uses `React.use`.

`Atom.Hydration.hydrate` decodes every entry through a Schema. A malformed entry (including a negative `dehydratedAt`), or a value that fails its atom's schema in either direction, is skipped and recorded; read the records with `Atom.Registry.refusals(registry)`. Hydration payload keys are unchanged.
