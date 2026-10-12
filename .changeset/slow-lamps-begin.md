---
"@systemfsoftware/oxlint-config-recommended": major
---

Two new error-level bans, each message naming the ui-state compound pack rule it enforces.

- `no-restricted-imports` reports React server-state libraries and their subpaths in every linted file: `@tanstack/react-query` and its devtools, persist-client and next-experimental packages, `react-query`, `swr`, `urql`, `@apollo/client/react`, `@reduxjs/toolkit/query/react`, `@trpc/react-query` and `@trpc/tanstack-react-query`.
- In `.tsx` files, `fetch`, `globalThis.fetch`, `window.fetch` and `self.fetch` are reported.

To migrate, read server data through effect-atom runtime atoms over Effect services, and move `fetch` into an Effect service in a `.ts` module. A config that sets its own value for one of these rules drops the preset's ban, so spread the new exports into it: `serverStateImports`, `nodeBuiltinAndServerStateImports`, `fetchInComponentsGlobals`, `fetchInComponentsProperties`.
