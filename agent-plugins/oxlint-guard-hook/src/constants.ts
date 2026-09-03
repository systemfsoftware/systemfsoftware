export const COMMAND_BUDGET_MS = 30_000
export const STDIN_CAP_BYTES = 1024 * 1024

export const EDIT_TOOL_NAMES: readonly string[] = [
  'Write',
  'Edit',
  'Update',
  'MultiEdit',
  'Create',
  'morph_mcp_edit-file',
  'morph_edit',
]

export const LINTABLE_EXTENSIONS: readonly string[] = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'mts',
  'cts',
  'mjs',
  'cjs',
  'vue',
  'svelte',
  'astro',
]

export const PRIMARY_CONFIG_BASENAMES: readonly string[] = [
  '.oxlintrc.json',
  '.oxlintrc.jsonc',
  'oxlint.config.ts',
  'oxlint.config.mts',
]
export const FALLBACK_CONFIG_BASENAMES: readonly string[] = [
  'oxlint.config.js',
  'oxlint.config.mjs',
  'oxlint.config.cjs',
  'oxlint.json',
]
export const CONFIG_BASENAMES: readonly string[] = [
  ...PRIMARY_CONFIG_BASENAMES,
  ...FALLBACK_CONFIG_BASENAMES,
]

export const DENO_PREREQUISITE = 'deno (https://deno.land)'
export const PNPM_PREREQUISITE = 'pnpm with oxlint as a dev dependency (pnpm add -D oxlint)'
