import { assertEquals } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import { type ConfigGuardDeps, runConfigGuard } from './config-guard.ts'

const MODULE_CONFIG = 'oxlint.config.ts'
const JSON_DISK_ERROR = '{"rules":{"no-debugger":"error"}}'
const JSON_DISK_OFF = '{"rules":{"no-debugger":"off"}}'
const MODULE_DISK_OFF = "export default { rules: { 'no-debugger': 'off' } }"
const MODULE_DISK_WARN = "export default { rules: { 'no-debugger': 'warn' } }"

const payload = (toolName: string, toolInput: Record<string, unknown>): string =>
  JSON.stringify({ tool_name: toolName, tool_input: toolInput })

const diskDeps = (files: Readonly<Record<string, string>>, reads: string[] = []): ConfigGuardDeps => ({
  readTextFile: async (path: string): Promise<string | undefined> => {
    reads.push(path)
    return files[path]
  },
})

const BLOCKED_NO_DEBUGGER =
  'Blocked: this edit disables the oxlint rule(s) no-debugger in an oxlint config. ' +
  'Fix the underlying violation instead of disabling the rule.\n'

const CANNOT_VERIFY_JSONC =
  'Blocked: cannot verify this edit to an oxlint config file (the config content is not valid JSON or JSONC). ' +
  'Re-express the change as Edit, Write, or MultiEdit so the before/after content can be checked.\n'

const CANNOT_VERIFY_HUNK_ABSENT =
  'Blocked: cannot verify this edit to an oxlint config file (hunk old_string "\\"no-restricted-globals\\": \\"error\\"" is not present in the on-disk config content). ' +
  'Re-express the change as Edit, Write, or MultiEdit so the before/after content can be checked.\n'

const CANNOT_VERIFY_MORPH_RAW =
  'Blocked: cannot verify this edit to an oxlint config file (raw morph content (raw) cannot be turned into a before/after pair). ' +
  'Re-express the change as Edit, Write, or MultiEdit so the before/after content can be checked.\n'

const OVERSIZE_STDERR =
  'Blocked: cannot verify this edit to an oxlint config file (the hook payload exceeded the 1 MiB input cap).\n'

describe('config guard', () => {
  describe('refuses edits that disable a rule', () => {
    it('blocks an Edit that turns no-debugger off in a JSON config, naming the rule', async () => {
      const raw = payload('Edit', {
        file_path: 'oxlint.json',
        old_string: '{"rules":{"no-debugger":"error"}}',
        new_string: '{"rules":{"no-debugger":"off"}}',
      })
      const result = await runConfigGuard(raw, '/proj', diskDeps({ '/proj/oxlint.json': JSON_DISK_ERROR }))
      assertEquals(result, { exitCode: 2, stderr: BLOCKED_NO_DEBUGGER })
    })

    it('blocks an Edit that turns no-debugger off in a module config, naming the rule', async () => {
      const raw = payload('Edit', {
        file_path: MODULE_CONFIG,
        old_string: "rules: { 'no-debugger': 'warn' }",
        new_string: "rules: { 'no-debugger': 'off' }",
      })
      const result = await runConfigGuard(raw, '/proj', diskDeps({ [`/proj/${MODULE_CONFIG}`]: MODULE_DISK_WARN }))
      assertEquals(result, { exitCode: 2, stderr: BLOCKED_NO_DEBUGGER })
    })

    it('blocks a MultiEdit whose sequential hunks turn no-debugger off', async () => {
      const raw = payload('MultiEdit', {
        file_path: MODULE_CONFIG,
        edits: [
          { old_string: "'no-console': 'warn'", new_string: "'no-console': 'error'" },
          { old_string: "'no-debugger': 'warn'", new_string: "'no-debugger': 'off'" },
        ],
      })
      const disk = "export default { rules: { 'no-console': 'warn', 'no-debugger': 'warn' } }"
      const result = await runConfigGuard(raw, '/proj', diskDeps({ [`/proj/${MODULE_CONFIG}`]: disk }))
      assertEquals(result, { exitCode: 2, stderr: BLOCKED_NO_DEBUGGER })
    })

    it('blocks a Write that creates a JSON config with a rule off', async () => {
      const raw = payload('Write', { file_path: 'oxlint.json', content: JSON_DISK_OFF })
      const result = await runConfigGuard(raw, '/proj', diskDeps({}))
      assertEquals(result, { exitCode: 2, stderr: BLOCKED_NO_DEBUGGER })
    })

    it('blocks a Create that creates a module config with a rule off', async () => {
      const raw = payload('Create', { file_path: MODULE_CONFIG, content: MODULE_DISK_OFF })
      const result = await runConfigGuard(raw, '/proj', diskDeps({}))
      assertEquals(result, { exitCode: 2, stderr: BLOCKED_NO_DEBUGGER })
    })

    it('blocks a morph edit whose file_edits turn no-debugger off', async () => {
      const raw = payload('morph_mcp_edit-file', {
        file_path: 'oxlint.json',
        file_edits: [{ find: '"error"', replace: '"off"' }],
      })
      const result = await runConfigGuard(raw, '/proj', diskDeps({ '/proj/oxlint.json': JSON_DISK_ERROR }))
      assertEquals(result, { exitCode: 2, stderr: BLOCKED_NO_DEBUGGER })
    })

    it("detects every disabled spelling — 'off', 'allow', 0, and their array forms", async () => {
      const raw = payload('Write', {
        file_path: 'oxlint.json',
        content: JSON.stringify({
          rules: {
            'bare-off': 'off',
            'bare-allow': 'allow',
            'bare-zero': 0,
            'array-off': ['off'],
            'array-allow': ['allow'],
            'array-zero': [0, 'warn'],
          },
        }),
      })
      const expected =
        'Blocked: this edit disables the oxlint rule(s) bare-off, bare-allow, bare-zero, array-off, array-allow, array-zero in an oxlint config. ' +
        'Fix the underlying violation instead of disabling the rule.\n'
      const result = await runConfigGuard(raw, '/proj', diskDeps({}))
      assertEquals(result, { exitCode: 2, stderr: expected })
    })

    it('blocks an overrides block that turns a rule off', async () => {
      const raw = payload('Edit', {
        file_path: 'oxlint.json',
        old_string: '"no-debugger":"error"',
        new_string: '"no-debugger":"off"',
      })
      const disk = '{"rules":{},"overrides":[{"files":["*.ts"],"rules":{"no-debugger":"error"}}]}'
      const result = await runConfigGuard(raw, '/proj', diskDeps({ '/proj/oxlint.json': disk }))
      assertEquals(result, { exitCode: 2, stderr: BLOCKED_NO_DEBUGGER })
    })
  })

  describe('allows benign edits', () => {
    it('allows a severity downgrade that stays enabled (error to warn)', async () => {
      const raw = payload('Edit', {
        file_path: 'oxlint.json',
        old_string: '"no-debugger":"error"',
        new_string: '"no-debugger":"warn"',
      })
      const result = await runConfigGuard(raw, '/proj', diskDeps({ '/proj/oxlint.json': JSON_DISK_ERROR }))
      assertEquals(result, { exitCode: 0, stderr: '' })
    })

    it('allows an edit to ignorePatterns', async () => {
      const raw = payload('Edit', {
        file_path: MODULE_CONFIG,
        old_string: "ignorePatterns: ['dist']",
        new_string: "ignorePatterns: ['dist', 'build']",
      })
      const disk = "export default { ignorePatterns: ['dist'] }"
      const result = await runConfigGuard(raw, '/proj', diskDeps({ [`/proj/${MODULE_CONFIG}`]: disk }))
      assertEquals(result, { exitCode: 0, stderr: '' })
    })

    it('allows the literal text off outside a rules map in a module config', async () => {
      const raw = payload('Edit', {
        file_path: MODULE_CONFIG,
        old_string: 'export default',
        new_string: "const defaults = { telemetry: 'off' }\nexport default",
      })
      const result = await runConfigGuard(raw, '/proj', diskDeps({ [`/proj/${MODULE_CONFIG}`]: MODULE_DISK_WARN }))
      assertEquals(result, { exitCode: 0, stderr: '' })
    })

    it('preserves an off that already exists on disk', async () => {
      const raw = payload('Write', { file_path: MODULE_CONFIG, content: MODULE_DISK_OFF })
      const result = await runConfigGuard(raw, '/proj', diskDeps({ [`/proj/${MODULE_CONFIG}`]: MODULE_DISK_OFF }))
      assertEquals(result, { exitCode: 0, stderr: '' })
    })

    it('preserves an off at a nested relative path, resolving src/oxlint.json against cwd exactly once', async () => {
      const reads: string[] = []
      const raw = payload('Write', { file_path: 'src/oxlint.json', content: JSON_DISK_OFF })
      const result = await runConfigGuard(raw, '/proj/', diskDeps({ '/proj/src/oxlint.json': JSON_DISK_OFF }, reads))
      assertEquals(result, { exitCode: 0, stderr: '' })
      assertEquals(reads, ['/proj/src/oxlint.json'])
    })

    it('passes an absolute file_path through untouched, without joining cwd a second time', async () => {
      const reads: string[] = []
      const raw = payload('Write', { file_path: '/abs/oxlint.json', content: JSON_DISK_OFF })
      const result = await runConfigGuard(raw, '/proj', diskDeps({ '/abs/oxlint.json': JSON_DISK_OFF }, reads))
      assertEquals(result, { exitCode: 0, stderr: '' })
      assertEquals(reads, ['/abs/oxlint.json'])
    })
  })

  describe('fails closed when the edit cannot be verified', () => {
    it('refuses a Write whose new JSON content does not parse', async () => {
      const raw = payload('Write', { file_path: 'oxlint.json', content: 'not json at all' })
      const result = await runConfigGuard(raw, '/proj', diskDeps({ '/proj/oxlint.json': '{"rules":{}}' }))
      assertEquals(result, { exitCode: 2, stderr: CANNOT_VERIFY_JSONC })
    })

    it('refuses an Edit whose on-disk JSON does not parse', async () => {
      const raw = payload('Edit', { file_path: 'oxlint.json', old_string: 'a', new_string: 'b' })
      const result = await runConfigGuard(raw, '/proj', diskDeps({ '/proj/oxlint.json': 'not json at all' }))
      assertEquals(result, { exitCode: 2, stderr: CANNOT_VERIFY_JSONC })
    })

    it('refuses an Edit hunk whose old_string is absent from the on-disk content', async () => {
      const raw = payload('Edit', {
        file_path: 'oxlint.json',
        old_string: '"no-restricted-globals": "error"',
        new_string: '"no-restricted-globals": "off"',
      })
      const result = await runConfigGuard(raw, '/proj', diskDeps({ '/proj/oxlint.json': JSON_DISK_ERROR }))
      assertEquals(result, { exitCode: 2, stderr: CANNOT_VERIFY_HUNK_ABSENT })
    })

    it('refuses a morph payload with an unrecognized content shape', async () => {
      const raw = payload('morph_mcp_edit-file', { file_path: 'oxlint.json', raw: 'not an edit shape' })
      const result = await runConfigGuard(raw, '/proj', diskDeps({ '/proj/oxlint.json': JSON_DISK_ERROR }))
      assertEquals(result, { exitCode: 2, stderr: CANNOT_VERIFY_MORPH_RAW })
    })
  })

  describe('ignores input outside its scope', () => {
    it('ignores an edit to a non-config target even when it adds off', async () => {
      const raw = payload('Edit', {
        file_path: 'src/index.ts',
        old_string: 'const x = 1',
        new_string: "rules: { 'no-debugger': 'off' }",
      })
      const result = await runConfigGuard(raw, '/proj', diskDeps({ '/proj/src/index.ts': 'const x = 1' }))
      assertEquals(result, { exitCode: 0, stderr: '' })
    })

    it('skips a contentless payload', async () => {
      const raw = payload('Edit', { file_path: MODULE_CONFIG })
      const result = await runConfigGuard(raw, '/proj', diskDeps({ [`/proj/${MODULE_CONFIG}`]: MODULE_DISK_WARN }))
      assertEquals(result, { exitCode: 0, stderr: '' })
    })

    it('skips stdin that is not JSON', async () => {
      const result = await runConfigGuard('not json', '/proj', diskDeps({}))
      assertEquals(result, { exitCode: 0, stderr: '' })
    })

    it('skips a payload from a non-edit tool', async () => {
      const raw = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'true' } })
      const result = await runConfigGuard(raw, '/proj', diskDeps({}))
      assertEquals(result, { exitCode: 0, stderr: '' })
    })

    it('exits 2 with the oversize message when the payload exceeds 1 MiB', async () => {
      const raw = 'x'.repeat(1024 * 1024 + 1)
      const result = await runConfigGuard(raw, '/proj', diskDeps({}))
      assertEquals(result, { exitCode: 2, stderr: OVERSIZE_STDERR })
    })
  })
})
