---
"@systemfsoftware/oxlint-plugin-effect-platform": minor
---

Adds the `no-react-effect` rule. It reports `import('react')`, `require('react')` and any disable comment that would switch the React Effect ban off, so an Effect can no longer carry a subscription, an I/O call or a timer unnoticed. `reactImportBanNames` now starts with `useEffect`: a config that spreads it into `no-restricted-imports` refuses every React Effect hook by name, with no exception. Read state with `useAtomValue` and dispatch with `useAtomSet` instead. The rule is opt-in: enable `@systemfsoftware/oxlint-plugin-effect-platform/no-react-effect` where React code is linted.
