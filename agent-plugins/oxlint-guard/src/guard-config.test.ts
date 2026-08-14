// Behaviour tests for the PreToolUse config guard, ported from the original
// plugin's integration tests (formerly claude-plugins/oxlint-guard) with
// the same scenarios and assertions. The in-memory fs replaces effect-memfs.

import { assertEquals, assertStringIncludes } from '@std/assert'
import { runConfigGuard } from './guard-config.ts'
import type { Fs } from './guard-config.ts'

type Tree = Readonly<Record<string, string>>

const memFs = (tree: Tree): Fs => {
  // Directory markers carry a trailing slash (e.g. '/project/dir/': null);
  // lookups are normalized so the guard's slashless candidates match.
  const keyOf = (target: string): string => target.replace(/\/+$/, '')
  return {
    exists: (target) => Promise.resolve(keyOf(target) in tree),
    readTextFile: (target) => {
      const content = tree[keyOf(target)]
      return content === undefined
        ? Promise.reject(new Error(`no such file: ${target}`))
        : Promise.resolve(content)
    },
  }
}

const payload = (toolName: string, toolInput: Record<string, unknown>): string =>
  JSON.stringify({ tool_name: toolName, tool_input: toolInput })

const runWithFs = (raw: string, tree: Tree): Promise<{ exitCode: number; stderr: string }> =>
  runConfigGuard(raw, '/', memFs(tree))

const assertBlocked = async (raw: string, tree: Tree, ...needles: string[]): Promise<void> => {
  const result = await runWithFs(raw, tree)
  assertEquals(result.exitCode, 2)
  for (const needle of needles) {
    assertStringIncludes(result.stderr, needle)
  }
}

const assertAllowed = async (raw: string, tree: Tree): Promise<void> => {
  const result = await runWithFs(raw, tree)
  assertEquals(result.exitCode, 0)
  assertEquals(result.stderr, '')
}

const MODULE_CONFIG = 'oxlint.config.ts'
const PRESERVE_OFF_CONTENT = "export default { rules: { 'no-debugger': 'off' } }"
const PRESERVE_JSON = '{"rules":{"no-debugger":"off"}}'
const JSON_DISK_ERROR = '{"rules":{"no-debugger":"error"}}'
const MODULE_DISK_WARN = "export default { rules: { eqeqeq: 'warn' } }"

const EDIT_ADD_OFF = payload('Edit', {
  file_path: MODULE_CONFIG,
  old_string: "rules: { 'no-debugger': 'warn' }",
  new_string: "rules: { 'no-debugger': 'off' }",
})

const EDIT_JSON_ADD_OFF = payload('Edit', {
  file_path: 'oxlint.json',
  old_string: '{"rules":{"no-debugger":"error"}}',
  new_string: '{"rules":{"no-debugger":"off"}}',
})

const EDIT_JSON_BENIGN = payload('Edit', {
  file_path: 'oxlint.json',
  old_string: '"no-debugger":"error"',
  new_string: '"no-debugger":"warn"',
})

const EDIT_JSON_TO_ZERO = payload('Edit', {
  file_path: 'oxlint.json',
  old_string: '"no-debugger":"error"',
  new_string: '"no-debugger":0',
})

const EDIT_JSON_TO_ALLOW = payload('Edit', {
  file_path: 'oxlint.json',
  old_string: '"no-debugger":"error"',
  new_string: '"no-debugger":"allow"',
})

const MULTI_EDIT_ONE_HUNK_OFF = payload('MultiEdit', {
  file_path: MODULE_CONFIG,
  edits: [
    { old_string: "'no-console': 'warn'", new_string: "'no-console': 'error'" },
    { old_string: "'no-debugger': 'warn'", new_string: "'no-debugger': 'off'" },
  ],
})

const MULTI_EDIT_SEQUENTIAL_OFF = payload('MultiEdit', {
  file_path: 'oxlint.json',
  edits: [
    { old_string: '"error"', new_string: '"warn"' },
    { old_string: '"warn"', new_string: '"off"' },
  ],
})

const WRITE_NEW_WITH_OFF = payload('Write', { file_path: MODULE_CONFIG, content: PRESERVE_OFF_CONTENT })
const WRITE_NEW_JSON_WITH_OFF = payload('Write', { file_path: 'oxlint.json', content: PRESERVE_JSON })
const CREATE_NEW_WITH_OFF = payload('Create', { file_path: MODULE_CONFIG, content: PRESERVE_OFF_CONTENT })

const EDIT_JSON_UNPARSEABLE = payload('Edit', {
  file_path: 'oxlint.json',
  old_string: '{"rules":{}}',
  new_string: 'not json at all',
})

const MORPH_RAW = payload('morph_mcp_edit-file', {
  file_path: 'oxlint.json',
  file_edits: [{ find: 'a', replace: 'b' }],
})

const MORPH_FILE_EDITS_OFF = payload('morph_mcp_edit-file', {
  file_path: 'oxlint.json',
  file_edits: [{ find: '"error"', replace: '"off"' }],
})

const WRITE_PRESERVES_OFF = payload('Write', { file_path: MODULE_CONFIG, content: PRESERVE_OFF_CONTENT })
const WRITE_PRESERVES_JSON = payload('Write', { file_path: 'oxlint.json', content: PRESERVE_JSON })

const RELATIVE_WRITE = payload('Write', { file_path: 'src/oxlint.json', content: PRESERVE_JSON })

const EDIT_IGNOREPATTERNS = payload('Edit', {
  file_path: MODULE_CONFIG,
  old_string: "ignorePatterns: ['dist']",
  new_string: "ignorePatterns: ['dist', 'build']",
})

const EDIT_HUNK_ABSENT = payload('Edit', {
  file_path: 'oxlint.json',
  old_string: '"no-restricted-globals": "error"',
  new_string: '"no-restricted-globals": "off"',
})

const OVERRIDES_DISK = '{"rules":{},"overrides":[{"files":["*.ts"],"rules":{"no-debugger":"error"}}]}'

const EDIT_OVERRIDES_OFF = payload('Edit', {
  file_path: 'oxlint.json',
  old_string: '"no-debugger":"error"',
  new_string: '"no-debugger":"off"',
})

const EDIT_MODULE_NONRULE_OFF = payload('Edit', {
  file_path: MODULE_CONFIG,
  old_string: 'export default',
  new_string: "const defaults = { telemetry: 'off' }\nexport default",
})

const EDIT_NON_CONFIG_TARGET = payload('Edit', {
  file_path: 'src/index.ts',
  old_string: 'const x = 1',
  new_string: "rules: { 'no-debugger': 'off' }",
})

const EDIT_CONTENTLESS = payload('Edit', { file_path: MODULE_CONFIG })

Deno.test('an Edit hunk that turns a rule off in a module config is refused, naming the rule', async () => {
  await assertBlocked(EDIT_ADD_OFF, { '/oxlint.config.ts': "rules: { 'no-debugger': 'warn' }" }, 'no-debugger')
})

Deno.test('an Edit hunk that turns a rule off in a JSON config is refused, naming the rule', async () => {
  await assertBlocked(EDIT_JSON_ADD_OFF, { '/oxlint.json': JSON_DISK_ERROR }, 'no-debugger')
})

Deno.test('a benign Edit hunk on a JSON config is allowed', async () => {
  await assertAllowed(EDIT_JSON_BENIGN, { '/oxlint.json': JSON_DISK_ERROR })
})

Deno.test('an Edit that disables a rule with the numeric severity 0 is refused, naming the rule', async () => {
  await assertBlocked(EDIT_JSON_TO_ZERO, { '/oxlint.json': JSON_DISK_ERROR }, 'no-debugger')
})

Deno.test('an Edit that disables a rule with the severity allow is refused, naming the rule', async () => {
  await assertBlocked(EDIT_JSON_TO_ALLOW, { '/oxlint.json': JSON_DISK_ERROR }, 'no-debugger')
})

Deno.test('an Edit hunk whose old_string is absent from the on-disk config fails closed, naming the hunk', async () => {
  const result = await runWithFs(EDIT_HUNK_ABSENT, { '/oxlint.json': JSON_DISK_ERROR })
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, 'cannot verify')
  assertStringIncludes(result.stderr, 'no-restricted-globals')
})

Deno.test('writing a brand-new module config with Write that turns a rule off is refused', async () => {
  await assertBlocked(WRITE_NEW_WITH_OFF, {}, 'no-debugger')
})

Deno.test('writing a brand-new JSON config with Write that turns a rule off is refused', async () => {
  await assertBlocked(WRITE_NEW_JSON_WITH_OFF, {}, 'no-debugger')
})

Deno.test('writing a brand-new config with Create that turns a rule off is refused', async () => {
  await assertBlocked(CREATE_NEW_WITH_OFF, {}, 'no-debugger')
})

Deno.test('a multi-hunk edit where one hunk turns a rule off is refused', async () => {
  await assertBlocked(
    MULTI_EDIT_ONE_HUNK_OFF,
    { '/oxlint.config.ts': "export default { rules: { 'no-console': 'warn', 'no-debugger': 'warn' } }" },
    'no-debugger',
  )
})

Deno.test('a MultiEdit whose hunks apply sequentially and end by turning a rule off is refused', async () => {
  await assertBlocked(MULTI_EDIT_SEQUENTIAL_OFF, { '/oxlint.json': JSON_DISK_ERROR }, 'no-debugger')
})

Deno.test('an unparseable JSON replacement is refused because it cannot be verified', async () => {
  const result = await runWithFs(EDIT_JSON_UNPARSEABLE, { '/oxlint.json': '{"rules":{}}' })
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, 'cannot verify')
})

Deno.test('a raw morph edit with hunks is refused because it cannot be verified', async () => {
  const result = await runWithFs(MORPH_RAW, {})
  assertEquals(result.exitCode, 2)
  assertStringIncludes(result.stderr, 'cannot verify')
})

Deno.test('a morph file_edits edit that turns a rule off on a JSON config is refused, naming the rule', async () => {
  await assertBlocked(MORPH_FILE_EDITS_OFF, { '/oxlint.json': JSON_DISK_ERROR }, 'no-debugger')
})

Deno.test('rewriting a module config while keeping the off severities is allowed silently', async () => {
  await assertAllowed(WRITE_PRESERVES_OFF, { '/oxlint.config.ts': PRESERVE_OFF_CONTENT })
})

Deno.test('rewriting a JSON config while keeping the off severities is allowed silently', async () => {
  await assertAllowed(WRITE_PRESERVES_JSON, { '/oxlint.json': PRESERVE_JSON })
})

Deno.test('a relative path to a config is read from the working directory once', async () => {
  const result = await runWithFs(RELATIVE_WRITE, { '/src/oxlint.json': PRESERVE_JSON })
  assertEquals(result.exitCode, 0)
  assertEquals(result.stderr, '')
})

Deno.test('an edit that only changes the ignored folders is allowed', async () => {
  await assertAllowed(EDIT_IGNOREPATTERNS, { '/oxlint.config.ts': "export default { ignorePatterns: ['dist'] }" })
})

Deno.test('an overrides[].rules disable on a JSON config is refused, naming the rule', async () => {
  await assertBlocked(EDIT_OVERRIDES_OFF, { '/oxlint.json': OVERRIDES_DISK }, 'no-debugger')
})

Deno.test('a module config whose non-rule key outside the rules map is off is allowed', async () => {
  await assertAllowed(EDIT_MODULE_NONRULE_OFF, { '/oxlint.config.ts': MODULE_DISK_WARN })
})

Deno.test('an edit to a source file is allowed even when its new content mentions an off rule', async () => {
  await assertAllowed(EDIT_NON_CONFIG_TARGET, {})
})

Deno.test('an edit payload that carries no content is allowed', async () => {
  await assertAllowed(EDIT_CONTENTLESS, {})
})

Deno.test('a non-edit tool payload is ignored', async () => {
  await assertAllowed(payload('Read', { file_path: 'oxlint.json' }), {})
})

Deno.test('input that is not a hook payload is ignored', async () => {
  await assertAllowed('this is not json', {})
})
