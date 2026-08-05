import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { isEditTool, isLintable, isOxlintConfig, parseHookInput } from './input.ts'

Deno.test('parseHookInput: extracts tool name and file_path from a Claude Code payload', () => {
  const raw = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: 'packages/foo/src/index.ts', old_string: 'x', new_string: 'y' },
  })
  const got = parseHookInput(raw)
  assertEquals(got.toolName, 'Edit')
  assertEquals(got.filePath, 'packages/foo/src/index.ts')
})

Deno.test('parseHookInput: reads `path` as a fallback for OMP bridge payloads', () => {
  const raw = JSON.stringify({
    tool_name: 'Write',
    tool_input: { path: 'src/index.ts', content: 'export {}' },
  })
  const got = parseHookInput(raw)
  assertEquals(got.toolName, 'Write')
  assertEquals(got.filePath, 'src/index.ts')
})

Deno.test('parseHookInput: returns empty strings for malformed JSON (never throws)', () => {
  const got = parseHookInput('{not json')
  assertEquals(got, { toolName: '', filePath: '' })
})

Deno.test('parseHookInput: returns empty strings when fields are absent', () => {
  const got = parseHookInput(JSON.stringify({ tool_name: 'Read' }))
  assertEquals(got, { toolName: 'Read', filePath: '' })
  const got2 = parseHookInput(JSON.stringify({ tool_input: { file_path: 'a.ts' } }))
  assertEquals(got2, { toolName: '', filePath: 'a.ts' })
})

Deno.test('parseHookInput: empty input is safe', () => {
  const got = parseHookInput('')
  assertEquals(got, { toolName: '', filePath: '' })
})

Deno.test('isEditTool: accepts every tool in the R2 set', () => {
  for (const name of ['Write', 'Edit', 'Update', 'MultiEdit', 'Create', 'morph_edit', 'morph_mcp_edit-file']) {
    assertEquals(isEditTool(name), true, `expected ${name} to be an edit tool`)
  }
})

Deno.test('isEditTool: rejects Read, Bash, Grep, and unknown tools', () => {
  for (const name of ['Read', 'Bash', 'Grep', 'Glob', 'Unknown', '']) {
    assertEquals(isEditTool(name), false, `expected ${name} to be rejected`)
  }
})

Deno.test('isLintable: accepts JS/TS family extensions', () => {
  for (
    const path of [
      'a.ts',
      'a.tsx',
      'a.js',
      'a.jsx',
      'a.mts',
      'a.cts',
      'a.mjs',
      'a.cjs',
      'deep/dir/a.ts',
      'deep/dir/a.jsx',
    ]
  ) {
    assertEquals(isLintable(path), true, `expected ${path} to be lintable`)
  }
})

Deno.test('isLintable: rejects non-lintable extensions and empty input', () => {
  for (const path of ['README.md', 'package.json', 'style.css', 'no-ext', '', 'a.rs']) {
    assertEquals(isLintable(path), false, `expected ${path} to be rejected`)
  }
})

Deno.test('isOxlintConfig: matches every standard config basename at any depth', () => {
  for (
    const path of [
      'oxlint.config.ts',
      'packages/foo/oxlint.config.ts',
      'oxlint.config.js',
      'packages/foo/oxlint.config.js',
      'oxlint.config.mjs',
      'oxlint.config.cjs',
      '.oxlintrc.json',
      'packages/foo/.oxlintrc.json',
      'oxlint.json',
    ]
  ) {
    assertEquals(isOxlintConfig(path), true, `expected ${path} to be an oxlint config`)
  }
})

Deno.test('isOxlintConfig: rejects non-config paths', () => {
  for (const path of ['other.config.ts', 'oxlint.config.txt', 'oxlint.config.tsx', 'src/oxlint.config.ts.bak', '']) {
    assertEquals(isOxlintConfig(path), false, `expected ${path} to be rejected`)
  }
})

Deno.test('parseHookInput: returns a plain { toolName, filePath } object', () => {
  const got = parseHookInput('{"tool_name":"Write","tool_input":{"file_path":"x.ts"}}')
  assertStrictEquals(typeof got.toolName, 'string')
  assertStrictEquals(typeof got.filePath, 'string')
})
