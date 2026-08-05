import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { detectConfigWeakening } from './oxlint-config-off-guard.ts'

Deno.test('detectConfigWeakening: skips non-edit tools', () => {
  const v = detectConfigWeakening({
    toolName: 'Read',
    filePath: 'oxlint.config.ts',
    content: 'rules: {}',
    oldString: null,
    newString: null,
  })
  assertEquals(v.weaken, false)
})

Deno.test('detectConfigWeakening: skips non-config paths', () => {
  const v = detectConfigWeakening({
    toolName: 'Edit',
    filePath: 'src/index.ts',
    content: 'rules: {}',
    oldString: null,
    newString: null,
  })
  assertEquals(v.weaken, false)
})

Deno.test('detectConfigWeakening: skips empty file_path', () => {
  const v = detectConfigWeakening({
    toolName: 'Edit',
    filePath: '',
    content: '',
    oldString: null,
    newString: null,
  })
  assertEquals(v.weaken, false)
})

Deno.test('detectConfigWeakening: Edit on ts module without defineConfig is fail-closed', () => {
  const v = detectConfigWeakening({
    toolName: 'Edit',
    filePath: 'oxlint.config.ts',
    content: 'export const x = 1;',
    oldString: null,
    newString: null,
  })
  assertEquals(v.weaken, true)
  if (v.weaken) assertStringIncludes(v.reason, 'defineConfig')
})

Deno.test('detectConfigWeakening: Edit on ts module with valid defineConfig allows', () => {
  const v = detectConfigWeakening({
    toolName: 'Edit',
    filePath: 'oxlint.config.ts',
    content:
      "import { defineConfig } from 'oxlint'; export default defineConfig({ categories: { correctness: 'error' }, rules: { 'no-debugger': 'warn' } });",
    oldString: null,
    newString: null,
  })
  assertEquals(v.weaken, false)
})

Deno.test('detectConfigWeakening: Edit on ts module with off directive blocks', () => {
  const v = detectConfigWeakening({
    toolName: 'Edit',
    filePath: 'oxlint.config.ts',
    content: "export default defineConfig({ rules: { 'no-debugger': 'off' } });",
    oldString: null,
    newString: null,
  })
  assertEquals(v.weaken, true)
})

Deno.test('detectConfigWeakening: Edit on ts module with oxlint-disable-next-line blocks', () => {
  const v = detectConfigWeakening({
    toolName: 'Edit',
    filePath: 'oxlint.config.ts',
    content: "export default defineConfig({\n  // oxlint-disable-next-line\n  rules: { 'no-debugger': 'warn' },\n});",
    oldString: null,
    newString: null,
  })
  assertEquals(v.weaken, true)
})

Deno.test('detectConfigWeakening: Edit on json config without categories/rules is fail-closed', () => {
  const v = detectConfigWeakening({
    toolName: 'Edit',
    filePath: 'oxlint.json',
    content: '{}',
    oldString: null,
    newString: null,
  })
  assertEquals(v.weaken, true)
})

Deno.test('detectConfigWeakening: Edit on json config disabling a rule blocks', () => {
  const v = detectConfigWeakening({
    toolName: 'Edit',
    filePath: 'oxlint.json',
    content: JSON.stringify({ categories: {}, rules: { 'no-debugger': 'off' } }),
    oldString: null,
    newString: null,
  })
  assertEquals(v.weaken, true)
})

Deno.test('detectConfigWeakening: Edit on .oxlintrc.json with non-object content blocks', () => {
  const v = detectConfigWeakening({
    toolName: 'Edit',
    filePath: '.oxlintrc.json',
    content: '[1, 2, 3]',
    oldString: null,
    newString: null,
  })
  assertEquals(v.weaken, true)
})

Deno.test('detectConfigWeakening: Write-create on json config with valid content allows', () => {
  const v = detectConfigWeakening({
    toolName: 'Write',
    filePath: 'oxlint.json',
    content: JSON.stringify({ categories: { correctness: 'error' }, rules: { 'no-debugger': 'warn' } }),
    oldString: null,
    newString: null,
  })
  assertEquals(v.weaken, false)
})

Deno.test('detectConfigWeakening: Edit patch that adds an off directive blocks', () => {
  const v = detectConfigWeakening({
    toolName: 'Edit',
    filePath: 'oxlint.config.ts',
    content: '',
    oldString: "  rules: { 'no-debugger': 'warn' },",
    newString: "  rules: { 'no-debugger': 'off' },",
  })
  assertEquals(v.weaken, true)
})

Deno.test('detectConfigWeakening: Edit patch that removes an off directive allows', () => {
  const v = detectConfigWeakening({
    toolName: 'Edit',
    filePath: 'oxlint.config.ts',
    content: '',
    oldString: "  rules: { 'no-debugger': 'off' },",
    newString: "  rules: { 'no-debugger': 'warn' },",
  })
  assertEquals(v.weaken, false)
})

Deno.test('detectConfigWeakening: Edit on unrecognized config extension is silent allow', () => {
  const v = detectConfigWeakening({
    toolName: 'Edit',
    filePath: 'oxlint.config.yaml',
    content: 'rules: {}',
    oldString: null,
    newString: null,
  })
  assertEquals(v.weaken, false)
})
