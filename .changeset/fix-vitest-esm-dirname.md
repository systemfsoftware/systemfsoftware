---
"@systemfsoftware/effect-atom": patch
"@systemfsoftware/effect-atom-react": patch
---

Replace `__dirname` with `import.meta.dirname` in both `vitest.config.ts` files.

Vite 4.1.10's native config loader evaluates the config as ESM, where `__dirname`
is not defined; the loader refused the config, which surfaced as a
`Failed to fetch dynamically imported module` failure for the browser-mode test
project's dynamic import of `test/Hooks.feature.test.tsx` in `check:ci`. Both
configs now use the ESM-native `import.meta.dirname` receiver (Node 20.11+),
preserving the `path.join(…)` alias shape; no config surface outside those two
files changes.
