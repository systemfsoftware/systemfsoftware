---
"@systemfsoftware/effect-atom": major
"@systemfsoftware/effect-atom-react": major
---

Each package has one entry point: `import { Atom } from '@systemfsoftware/effect-atom'` and `import { AtomReact } from '@systemfsoftware/effect-atom-react'`. The subpaths are gone; use `Atom.Registry`, `Atom.AsyncResult`, `Atom.Hydration`, `Atom.Ref`, `Atom.HttpApi`, and `Atom.Rpc`.

There is no global registry. `Atom.Registry.make` returns a handle used with functions such as `Atom.Registry.get(registry, atom)`, and `Atom.Registry.layer(tag)` provides one. Batches are per registry.

Listeners hear a value only when it differs from the last one they heard, after the write or the outermost batch. Writes feeding an unwatched `keepAlive` value survive idle time, and refreshing an unread value no longer computes it.

`AtomReact` hooks throw without a `RegistryProvider`. `Atom.Hydration.hydrate` skips malformed entries and lists them in `Atom.Registry.refusals(registry)`.
