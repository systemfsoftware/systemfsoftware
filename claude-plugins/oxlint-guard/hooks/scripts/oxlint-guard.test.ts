import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { decideLint, type Resolver } from './oxlint-guard.ts'

function fakeResolver(overrides: Partial<Resolver> = {}): Resolver {
  return {
    async detectPackageManager() {
      return null
    },
    async findNearestOxlintConfig() {
      return '/proj/oxlint.config.ts'
    },
    async resolveLocalOxlintBinary() {
      return '/proj/node_modules/.bin/oxlint'
    },
    async readFile(path) {
      if (path.endsWith('.ts')) return 'export const x = 1;'
      return null
    },
    async fileExists(path) {
      return path.endsWith('.ts') && !path.endsWith('/missing.ts')
    },
    async runCommand(cmd, args) {
      return { code: 0, stdout: '', stderr: '' }
    },
    ...overrides,
  }
}

Deno.test('decideLint: returns exit0 when tool is not an edit tool', async () => {
  const v = await decideLint({ toolName: 'Read', filePath: 'a.ts', resolver: fakeResolver() })
  assertEquals(v.kind, 'exit0')
})

Deno.test('decideLint: returns exit0 when file_path is empty', async () => {
  const v = await decideLint({ toolName: 'Edit', filePath: '', resolver: fakeResolver() })
  assertEquals(v.kind, 'exit0')
})

Deno.test('decideLint: returns exit0 when file is not lintable (md/json)', async () => {
  const v = await decideLint({ toolName: 'Edit', filePath: 'README.md', resolver: fakeResolver() })
  assertEquals(v.kind, 'exit0')
})

Deno.test('decideLint: returns exit0 when the file is missing on disk', async () => {
  const v = await decideLint({
    toolName: 'Edit',
    filePath: '/missing.ts',
    resolver: fakeResolver({
      async fileExists() {
        return false
      },
    }),
  })
  assertEquals(v.kind, 'exit0')
})

Deno.test('decideLint: returns exit0 on a clean lint (oxlint exit 0)', async () => {
  const v = await decideLint({ toolName: 'Edit', filePath: 'a.ts', resolver: fakeResolver() })
  assertEquals(v.kind, 'exit0')
})

Deno.test('decideLint: returns exit2 with preamble on lint violation', async () => {
  const resolver = fakeResolver({
    async runCommand() {
      return { code: 1, stdout: '', stderr: 'error[no-unused-vars]: x is unused' }
    },
  })
  const v = await decideLint({ toolName: 'Edit', filePath: 'a.ts', resolver })
  assertEquals(v.kind, 'exit2')
  if (v.kind === 'exit2') {
    assertStringIncludes(v.message, 'oxlint failed')
    assertStringIncludes(v.message, 'no-unused-vars')
  }
})

Deno.test('decideLint: routes deno-shebang files to deno check + deno lint', async () => {
  let sawCheck = false
  let sawLint = false
  const resolver = fakeResolver({
    async readFile(path) {
      if (path.endsWith('a.ts')) return '#!/usr/bin/env -S deno run\nexport const x = 1;'
      return null
    },
    async runCommand(cmd, args) {
      if (cmd === 'deno' && args[0] === 'check') sawCheck = true
      if (cmd === 'deno' && args[0] === 'lint') sawLint = true
      return { code: 0, stdout: '', stderr: '' }
    },
  })
  const v = await decideLint({ toolName: 'Edit', filePath: 'a.ts', resolver })
  assertEquals(v.kind, 'exit0')
  assertEquals(sawCheck, true)
  assertEquals(sawLint, true)
})

Deno.test('decideLint: deno check failure short-circuits before deno lint', async () => {
  let sawLint = false
  const resolver = fakeResolver({
    async readFile(path) {
      if (path.endsWith('a.ts')) return "#!/usr/bin/env -S deno run\nconst x: number = 'oops';"
      return null
    },
    async runCommand(cmd, args) {
      if (cmd === 'deno' && args[0] === 'check') {
        return { code: 1, stdout: '', stderr: "Type 'string' is not assignable to 'number'" }
      }
      if (cmd === 'deno' && args[0] === 'lint') sawLint = true
      return { code: 0, stdout: '', stderr: '' }
    },
  })
  const v = await decideLint({ toolName: 'Edit', filePath: 'a.ts', resolver })
  assertEquals(v.kind, 'exit2')
  assertEquals(sawLint, false)
})

Deno.test("decideLint: treats 'No files found to lint' as a pass", async () => {
  const resolver = fakeResolver({
    async runCommand() {
      return { code: 1, stdout: 'No files found to lint', stderr: '' }
    },
  })
  const v = await decideLint({ toolName: 'Edit', filePath: 'a.ts', resolver })
  assertEquals(v.kind, 'exit0')
})

Deno.test('decideLint: treats the ignored-path panic as a pass', async () => {
  const resolver = fakeResolver({
    async runCommand() {
      return {
        code: 1,
        stdout: '',
        stderr: 'panicked at ... path is expected to be under the root',
      }
    },
  })
  const v = await decideLint({ toolName: 'Edit', filePath: 'a.ts', resolver })
  assertEquals(v.kind, 'exit0')
})

Deno.test('decideLint: hard fail (exit2) when no oxlint config is found', async () => {
  const resolver = fakeResolver({
    async findNearestOxlintConfig() {
      return null
    },
  })
  const v = await decideLint({ toolName: 'Edit', filePath: 'a.ts', resolver })
  assertEquals(v.kind, 'exit2')
  if (v.kind === 'exit2') {
    assertStringIncludes(v.message, 'oxlint config not found')
  }
})

Deno.test('decideLint: hard fail (exit2) when node_modules/.bin/oxlint is missing', async () => {
  const resolver = fakeResolver({
    async resolveLocalOxlintBinary() {
      return null
    },
  })
  const v = await decideLint({ toolName: 'Edit', filePath: 'a.ts', resolver })
  assertEquals(v.kind, 'exit2')
  if (v.kind === 'exit2') {
    assertStringIncludes(v.message, 'oxlint not found locally')
    assertStringIncludes(v.message, 'pnpm add -D oxlint')
  }
})

Deno.test('decideLint: ignores oxlint on PATH; only walks node_modules/.bin', async () => {
  let runCommandCalled = false
  const resolver = fakeResolver({
    async resolveLocalOxlintBinary() {
      return null
    },
    async runCommand() {
      runCommandCalled = true
      return { code: 0, stdout: '', stderr: '' }
    },
  })
  const v = await decideLint({ toolName: 'Edit', filePath: 'a.ts', resolver })
  assertEquals(v.kind, 'exit2')
  assertEquals(runCommandCalled, false)
})

Deno.test('decideLint: type-aware tsgolint missing falls back without type-aware flags', async () => {
  const seenArgs: string[][] = []
  const resolver = fakeResolver({
    async runCommand(_cmd, args) {
      seenArgs.push(args)
      if (seenArgs.length === 1) {
        return { code: 1, stdout: '', stderr: 'error: oxlint-tsgolint backend not installed' }
      }
      return { code: 0, stdout: '', stderr: '' }
    },
  })
  const v = await decideLint({ toolName: 'Edit', filePath: 'a.ts', resolver })
  assertEquals(v.kind, 'exit0')
  assertEquals(seenArgs.length, 2)
  assertEquals(seenArgs[0].includes('--type-aware'), true)
  assertEquals(seenArgs[1].includes('--type-aware'), false)
})
