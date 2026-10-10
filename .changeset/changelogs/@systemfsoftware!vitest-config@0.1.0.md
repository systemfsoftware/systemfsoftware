## 0.1.0

### Minor Changes

- Publish initial release of `@systemfsoftware/vitest-config`: `defineConfig` (Vitest's `defineConfig` that adds the `@systemfsoftware/vitest` guard setup file to every block that runs tests, returned as a promise), `sharedConfig`, `sourceResolveConditions` and `isCI`. `vite` `^8` and `vitest` `^5` are required peers, and the consuming package must also depend on `@systemfsoftware/vitest`: without it, config load rejects and names the `package.json` to fix.
