---
"@systemfsoftware/oxlint-config-recommended": major
---

React code runs no Effect, and the Rules of React are errors.

- `useEffect`, `useLayoutEffect`, `useInsertionEffect` and `useEffectEvent` from `react` are reported in every form, with no exception.
- `react` namespace and default imports, `import('react')` and `require('react')` are reported; import each API by name.
- A disable comment that would switch these bans off is itself reported.
- Every React `correctness` rule, React Compiler checks included, is an error except `react/rules-of-hooks`; `react/hooks` checks the Rules of Hooks instead. Eight more React rules are errors.

To migrate, read state with `useAtomValue`, dispatch with `useAtomSet`, and subscribe to an external store with `useSyncExternalStore`. A config with its own `no-restricted-imports` spreads `uiStateImports` into it.
