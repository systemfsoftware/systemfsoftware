---
"@systemfsoftware/oxlint-config-recommended": major
---

Two new error-level bans, each citing the ui-state compound pack rule it enforces.

- `no-restricted-imports` now reports React server-state libraries in every file the preset lints (`ui-state/server-data-lives-in-atoms`): `@tanstack/react-query`, `@tanstack/react-query-devtools`, `@tanstack/react-query-persist-client`, `@tanstack/react-query-next-experimental`, `react-query`, `swr`, `urql`, `@apollo/client/react`, `@reduxjs/toolkit/query/react`, `@trpc/react-query` and `@trpc/tanstack-react-query`, each with its subpaths, in import, type-only import, re-export and dynamic `import()` forms. `@tanstack/query-core`, `@apollo/client`, `@urql/core` and `@reduxjs/toolkit/query` stay allowed. The node-builtin ban from `@systemfsoftware/oxlint-plugin-effect-platform` still applies where it did before; both are reported on the same file.
- In `**/*.tsx`, `no-restricted-globals` reports `fetch` and `no-restricted-properties` reports `globalThis.fetch`, `window.fetch` and `self.fetch` (`ui-state/components-perform-no-io`), story files included.

To migrate, read server data through effect-atom runtime atoms (`appRuntime.atom`, `useAtomValue`) over Effect services, and move `fetch` out of `.tsx` modules into an Effect service in a `.ts` module.

A config that sets its own `no-restricted-imports` replaces the preset's value, because oxlint does not merge rule options. Spread the preset's patterns into yours: `serverStateImports` for files the node-builtin ban does not cover, `nodeBuiltinAndServerStateImports` for files it does (`**/src/**`, `**/*.test.ts`). Both are new named exports of this package, typed `PatternImportBan`.
