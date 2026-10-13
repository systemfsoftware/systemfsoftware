---
"@systemfsoftware/oxlint-plugin-effect-platform": minor
---

Adds the `no-react-effect` rule. React code that imports `useEffect` from `react` and reaches it — a call, a value passed around, or a re-export — is now reported, so an Effect can no longer carry a subscription, an I/O call or a timer unnoticed. The one admitted Effect is effect-atom's after-commit hydration: a `useEffect` with a dependency array whose callback body is a single `Atom.Hydration.hydrate(registry, queue)` whose `Atom` comes from `@systemfsoftware/effect-atom`. Read state with `useAtomValue` and dispatch with `useAtomSet` instead. The rule is opt-in: enable `@systemfsoftware/oxlint-plugin-effect-platform/no-react-effect` where React code is linted.
