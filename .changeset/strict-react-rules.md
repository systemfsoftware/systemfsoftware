---
"@systemfsoftware/oxlint-config-recommended": major
---

React code runs no Effect, and the Rules of React are errors.

- `useEffect`, `useLayoutEffect`, `useInsertionEffect` and `useEffectEvent` from `react` are reported in every form. The one admitted Effect is effect-atom's after-commit `Atom.Hydration.hydrate(registry, queue)`.
- `react` namespace and default imports are reported; import each API by name.
- Every React `correctness` rule, React Compiler checks included, is an error except `react/rules-of-hooks`; `react/hooks` checks the Rules of Hooks instead. Eight more React rules are errors, among them `react/no-array-index-key` and `react/no-unstable-nested-components`.

To migrate, read state with `useAtomValue`, dispatch with `useAtomSet`, and subscribe to an external store with `useSyncExternalStore`. A config with its own `no-restricted-imports` spreads `uiStateImports` into it.
