import { defineConfig, type UserConfig } from 'tsdown'

/**
 * Claude Code COPIES the plugin directory into its own cache on install, so nothing
 * outside this directory is guaranteed to travel with it. Each hook must therefore be
 * ONE self-contained `.mjs` with `effect` inlined: externalizing the deps would resolve
 * here and fail with `ERR_MODULE_NOT_FOUND` on a user's machine, where no test can see it.
 *
 * Hence one build PER hook rather than one build with two entries. Two entries sharing a
 * module make rolldown hoist `effect` into a sibling chunk, and "one self-contained file
 * per hook" silently becomes three files that only work while they stay together.
 * `codeSplitting: false` is what keeps it that way: rolldown rejects it outright when a
 * config has more than one input, so re-merging these builds fails loudly at build time
 * instead of quietly reintroducing the shared chunk.
 */
const hook = (name: string, entry: string, clean: boolean): UserConfig => ({
  entry: { [name]: entry },
  format: 'esm',
  platform: 'node',
  dts: false,
  clean,
  tsconfig: './tsconfig.build.json',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  deps: { alwaysBundle: [/^effect$/, /^@effect\//, /^@std\//], onlyBundle: false },
  outputOptions: { codeSplitting: false },
})

export default defineConfig([
  hook('oxlint-guard', './src/lint-guard/main.ts', true),
  hook('oxlint-config-off-guard', './src/config-guard/main.ts', false),
])
