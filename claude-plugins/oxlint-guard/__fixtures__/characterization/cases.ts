import type { CharacterizationCase, TreeSpec } from './harness.ts'

const DENO_SHEBANG = '#!/usr/bin/env -S deno run\n'

const lintPayload = (filePath: string): string =>
  JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } })

const configPayload = (toolName: string, toolInput: Record<string, unknown>): string =>
  JSON.stringify({ tool_name: toolName, tool_input: toolInput })

const FULL_TREE: TreeSpec = {
  files: {
    'oxlint.config.mjs': 'export default {}\n',
    'src/clean.ts': 'export const a = 1\n',
    'src/bad.ts': 'debugger\n',
    'src/ignored.ts': 'export const b = 2\n',
    'src/outside.ts': 'export const c = 3\n',
    'src/tsgolint.ts': 'export const d = 4\n',
    'src/retry.ts': 'export const e = 5\n',
    'src/tsgolint-noise.ts': 'export const f = 6\n',
    'src/huge.ts': 'export const g = 7\n',
    'src/typeaware-timeout.ts': 'export const h = 8\n',
    'src/retry-timeout.ts': 'export const i = 9\n',
    'src/eacces.ts': 'export const j = 10\n',
    'src/--fixme.ts': 'export const k = 11\n',
    'src/readme.md': '# readme\n',
    'src/deno.ts': DENO_SHEBANG,
    'src/deno-check-fail.ts': DENO_SHEBANG,
    'src/deno-lint-fail.ts': DENO_SHEBANG,
    'src/deno-missing.ts': DENO_SHEBANG,
  },
}

const withFiles = (base: TreeSpec, overrides: Partial<TreeSpec>): TreeSpec => ({ ...base, ...overrides })

const lintCase = (id: string, filePath: string, tree: TreeSpec = FULL_TREE): CharacterizationCase => ({
  id,
  hook: 'lint',
  tree,
  stdin: lintPayload(filePath),
})

const MODULE_CONFIG = 'oxlint.config.ts'
const MODULE_DISK_WARN = "export default { rules: { 'no-debugger': 'warn' } }"
const MODULE_DISK_OFF = "export default { rules: { 'no-debugger': 'off' } }"
const JSON_DISK_ERROR = '{"rules":{"no-debugger":"error"}}'
const JSON_DISK_OFF = '{"rules":{"no-debugger":"off"}}'
const OVERRIDES_DISK = '{"rules":{},"overrides":[{"files":["*.ts"],"rules":{"no-debugger":"error"}}]}'

const configCase = (
  id: string,
  files: Readonly<Record<string, string>>,
  stdin: string,
): CharacterizationCase => ({ id, hook: 'config', tree: { files, oxlint: 'absent' }, stdin })

export const CASES: readonly CharacterizationCase[] = [
  lintCase('lint-violation-refused', 'src/bad.ts'),
  lintCase('lint-clean-allowed', 'src/clean.ts'),
  lintCase('lint-benign-no-files', 'src/ignored.ts'),
  lintCase('lint-benign-outside-root', 'src/outside.ts'),
  lintCase('lint-tsgolint-missing-retried', 'src/tsgolint.ts'),
  lintCase('lint-still-fails-after-retry', 'src/retry.ts'),
  lintCase('lint-tsgolint-noise-retried', 'src/tsgolint-noise.ts'),
  lintCase('lint-huge-output-truncated', 'src/huge.ts'),
  lintCase('lint-dash-prefixed-file', 'src/--fixme.ts'),
  lintCase('lint-skip-missing-file', 'src/nope.ts'),
  lintCase('lint-skip-markdown', 'src/readme.md'),
  lintCase('lint-deno-script-allowed', 'src/deno.ts'),
  lintCase('lint-deno-check-fails', 'src/deno-check-fail.ts'),
  lintCase('lint-deno-lint-fails', 'src/deno-lint-fail.ts'),
  lintCase('lint-typeaware-timeout-retried', 'src/typeaware-timeout.ts'),
  lintCase('lint-retry-timeout-allowed', 'src/retry-timeout.ts'),

  { id: 'lint-ignores-non-json', hook: 'lint', tree: FULL_TREE, stdin: 'not json' },
  {
    id: 'lint-ignores-read-tool',
    hook: 'lint',
    tree: FULL_TREE,
    stdin: JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'src/clean.ts' } }),
  },
  {
    id: 'lint-relative-path-resolved-once',
    hook: 'lint',
    tree: {
      files: {
        'a/b/oxlint.config.mjs': 'export default {}\n',
        'a/b/src/relative.ts': 'export const a = 1\n',
      },
    },
    cwd: 'a',
    stdin: lintPayload('b/src/relative.ts'),
  },

  lintCase('lint-no-config-refused', 'src/clean.ts', {
    files: { 'src/clean.ts': 'export const a = 1\n' },
  }),
  lintCase('lint-no-binary-bun-hint', 'src/clean.ts', {
    files: { 'oxlint.config.mjs': 'export default {}\n', 'src/clean.ts': 'export const a = 1\n', 'bun.lock': 'v1\n' },
    oxlint: 'absent',
  }),
  lintCase('lint-path-binary-never-substitutes', 'src/clean.ts', {
    files: { 'oxlint.config.mjs': 'export default {}\n', 'src/clean.ts': 'export const a = 1\n' },
    oxlint: 'absent',
    oxlintOnPath: true,
  }),
  lintCase('lint-ancestor-binary-never-selected', 'src/clean.ts', {
    files: { 'oxlint.config.mjs': 'export default {}\n', 'src/clean.ts': 'export const a = 1\n' },
    oxlint: 'absent',
    ancestorOxlint: true,
  }),
  lintCase('lint-binary-not-executable', 'src/eacces.ts', withFiles(FULL_TREE, { oxlint: 'noexec' })),
  lintCase('lint-binary-is-directory', 'src/clean.ts', withFiles(FULL_TREE, { oxlint: 'dir' })),
  lintCase('lint-deno-interpreter-missing', 'src/deno-missing.ts', withFiles(FULL_TREE, { denoOnPath: false })),

  configCase(
    'config-module-edit-adds-off',
    { [MODULE_CONFIG]: MODULE_DISK_WARN },
    configPayload('Edit', {
      file_path: MODULE_CONFIG,
      old_string: "rules: { 'no-debugger': 'warn' }",
      new_string: "rules: { 'no-debugger': 'off' }",
    }),
  ),
  configCase(
    'config-json-edit-adds-off',
    { 'oxlint.json': JSON_DISK_ERROR },
    configPayload('Edit', {
      file_path: 'oxlint.json',
      old_string: '{"rules":{"no-debugger":"error"}}',
      new_string: '{"rules":{"no-debugger":"off"}}',
    }),
  ),
  configCase(
    'config-json-downgrade-allowed',
    { 'oxlint.json': JSON_DISK_ERROR },
    configPayload('Edit', {
      file_path: 'oxlint.json',
      old_string: '"no-debugger":"error"',
      new_string: '"no-debugger":"warn"',
    }),
  ),
  configCase(
    'config-json-severity-zero',
    { 'oxlint.json': JSON_DISK_ERROR },
    configPayload('Edit', {
      file_path: 'oxlint.json',
      old_string: '"no-debugger":"error"',
      new_string: '"no-debugger":0',
    }),
  ),
  configCase(
    'config-json-severity-allow',
    { 'oxlint.json': JSON_DISK_ERROR },
    configPayload('Edit', {
      file_path: 'oxlint.json',
      old_string: '"no-debugger":"error"',
      new_string: '"no-debugger":"allow"',
    }),
  ),
  configCase(
    'config-multiedit-one-hunk-off',
    { [MODULE_CONFIG]: "export default { rules: { 'no-console': 'warn', 'no-debugger': 'warn' } }" },
    configPayload('MultiEdit', {
      file_path: MODULE_CONFIG,
      edits: [
        { old_string: "'no-console': 'warn'", new_string: "'no-console': 'error'" },
        { old_string: "'no-debugger': 'warn'", new_string: "'no-debugger': 'off'" },
      ],
    }),
  ),
  configCase(
    'config-multiedit-sequential-off',
    { 'oxlint.json': JSON_DISK_ERROR },
    configPayload('MultiEdit', {
      file_path: 'oxlint.json',
      edits: [
        { old_string: '"error"', new_string: '"warn"' },
        { old_string: '"warn"', new_string: '"off"' },
      ],
    }),
  ),
  configCase(
    'config-write-new-module-with-off',
    {},
    configPayload('Write', { file_path: MODULE_CONFIG, content: MODULE_DISK_OFF }),
  ),
  configCase(
    'config-write-new-json-with-off',
    {},
    configPayload('Write', { file_path: 'oxlint.json', content: JSON_DISK_OFF }),
  ),
  configCase(
    'config-create-new-module-with-off',
    {},
    configPayload('Create', { file_path: MODULE_CONFIG, content: MODULE_DISK_OFF }),
  ),
  configCase(
    'config-write-preserves-existing-off',
    { [MODULE_CONFIG]: MODULE_DISK_OFF },
    configPayload('Write', { file_path: MODULE_CONFIG, content: MODULE_DISK_OFF }),
  ),
  configCase(
    'config-json-unparseable-fails-closed',
    { 'oxlint.json': '{"rules":{}}' },
    configPayload('Edit', { file_path: 'oxlint.json', old_string: '{"rules":{}}', new_string: 'not json at all' }),
  ),
  configCase(
    'config-morph-non-severity-edit',
    { 'oxlint.json': JSON_DISK_ERROR },
    configPayload('morph_mcp_edit-file', { file_path: 'oxlint.json', file_edits: [{ find: 'a', replace: 'b' }] }),
  ),
  configCase(
    'config-morph-adds-off',
    { 'oxlint.json': JSON_DISK_ERROR },
    configPayload('morph_mcp_edit-file', {
      file_path: 'oxlint.json',
      file_edits: [{ find: '"error"', replace: '"off"' }],
    }),
  ),
  configCase(
    'config-relative-nested-write',
    { 'src/oxlint.json': JSON_DISK_ERROR },
    configPayload('Write', { file_path: 'src/oxlint.json', content: JSON_DISK_OFF }),
  ),
  configCase(
    'config-ignorepatterns-allowed',
    { [MODULE_CONFIG]: "export default { ignorePatterns: ['dist'] }" },
    configPayload('Edit', {
      file_path: MODULE_CONFIG,
      old_string: "ignorePatterns: ['dist']",
      new_string: "ignorePatterns: ['dist', 'build']",
    }),
  ),
  configCase(
    'config-hunk-absent-from-disk',
    { 'oxlint.json': JSON_DISK_ERROR },
    configPayload('Edit', {
      file_path: 'oxlint.json',
      old_string: '"no-restricted-globals": "error"',
      new_string: '"no-restricted-globals": "off"',
    }),
  ),
  configCase(
    'config-overrides-block-adds-off',
    { 'oxlint.json': OVERRIDES_DISK },
    configPayload('Edit', {
      file_path: 'oxlint.json',
      old_string: '"no-debugger":"error"',
      new_string: '"no-debugger":"off"',
    }),
  ),
  configCase(
    'config-module-non-rule-off-allowed',
    { [MODULE_CONFIG]: MODULE_DISK_WARN },
    configPayload('Edit', {
      file_path: MODULE_CONFIG,
      old_string: 'export default',
      new_string: "const defaults = { telemetry: 'off' }\nexport default",
    }),
  ),
  configCase(
    'config-non-config-target-ignored',
    { 'src/index.ts': 'const x = 1\n' },
    configPayload('Edit', {
      file_path: 'src/index.ts',
      old_string: 'const x = 1',
      new_string: "rules: { 'no-debugger': 'off' }",
    }),
  ),
  configCase(
    'config-contentless-payload-skipped',
    { [MODULE_CONFIG]: MODULE_DISK_WARN },
    configPayload('Edit', { file_path: MODULE_CONFIG }),
  ),
  configCase('config-non-json-stdin', { [MODULE_CONFIG]: MODULE_DISK_WARN }, 'not json'),
  {
    id: 'config-oversize-stdin-fails-closed',
    hook: 'config',
    tree: { files: { [MODULE_CONFIG]: MODULE_DISK_WARN }, oxlint: 'absent' },
    stdin: JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: MODULE_CONFIG, old_string: 'a', new_string: 'b'.repeat(1024 * 1024 + 64) },
    }),
  },
]
