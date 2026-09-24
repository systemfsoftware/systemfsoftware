## 5.0.0

### Major Changes

- One entry per package: `import { Atom } from '@systemfsoftware/effect-atom'` and `import { AtomReact } from '@systemfsoftware/effect-atom-react'`. Subpaths are gone; use `Atom.Registry`, `Atom.AsyncResult`, `Atom.Hydration`, `Atom.Ref`, `Atom.HttpApi`, `Atom.Rpc`.

  No global registry: `Atom.Registry.make` returns a handle for `Atom.Registry.get(registry, atom)` and the rest.

  Listeners hear only values that differ from the last one they heard. Unwatched `keepAlive` values keep their writes; refreshing an unread value no longer computes it.

  Atoms are immutable; read settings from `atom.spec`. `Atom.TypeId` is a symbol; `WritableTypeId`, `SerializableTypeId`, `ServerValueTypeId`, `ServerValue`, and `Atom.Ref`'s `key` are removed.

  `AtomReact` hooks throw without a `RegistryProvider`. `Atom.Hydration.hydrate` skips malformed entries and lists them in `Atom.Registry.refusals(registry)`.
