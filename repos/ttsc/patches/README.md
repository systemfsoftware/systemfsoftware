# patches

pnpm applies these files through `patchedDependencies` in `pnpm-workspace.yaml`. Each one backports an upstream fix that no release contains yet, so delete a patch only when a release includes its fix.

## `@rollup__plugin-typescript@12.3.0.patch`

`packages/factory`, `packages/metro`, and `packages/unplugin` build with `@rollup/plugin-typescript` from `config/`. The plugin drives TypeScript through a watch program even in a one-off build, and with the TypeScript 6 that `config/` pins, closing that program can leave a queued update behind. When the update fires, it reopens file watchers, so the build process may not exit. The patch tracks the host's timers and cancels them when the program closes.

It backports [rollup/plugins#2025](https://github.com/rollup/plugins/pull/2025), which no release includes yet.

`tests/test-ttsc/src/features/build/test_rollup_typescript_releases_queued_program_updates.ts` guards the behavior, with or without the patch.

Once a release includes the fix:

1. Raise `@rollup/plugin-typescript` in `config/package.json` to that release.
2. Remove its entry from `patchedDependencies` in `pnpm-workspace.yaml`.
3. Delete the patch.
