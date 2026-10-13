---
"@systemfsoftware/effect-atom-react": major
---

`useAtomSubscribe` is removed. A component that runs a side effect on every atom change no longer has a hook for it: run the reaction outside React, with `Atom.Registry.subscribe(registry, atom, f)` inside a scoped Effect that releases the subscription when its scope closes.

`useAtomMount`, the setter hooks, `useAtomRef` and `RegistryProvider` now hold their subscriptions through `useSyncExternalStore` instead of an Effect. Mount, unmount and the delayed disposal of a provider's registry behave as before.
