import { assertEquals, assertMatch, assertNotEquals } from '@std/assert'
import { join } from '@std/path'

const launcherPath = new URL('./bin/gritlint', import.meta.url).pathname
const platform = Deno.build.os === 'windows' ? 'win32' : Deno.build.os
const arch = Deno.build.arch === 'x86_64' ? 'x64' : Deno.build.arch
const packageName = `@systemfsoftware/gritlint-${platform}-${arch}`
const binaryName = platform === 'win32' ? 'gritlint.exe' : 'gritlint'

interface Fixture {
  root: string
  nodePath: string
}

async function makeFixture(exitCode: number): Promise<Fixture> {
  const root = await Deno.makeTempDir({ prefix: 'gritlint-launcher-' })
  const packageDir = join(root, 'node_modules', packageName)
  await Deno.mkdir(packageDir, { recursive: true })
  await Deno.writeTextFile(
    join(packageDir, 'package.json'),
    `${JSON.stringify({ name: packageName, version: '0.0.0' })}\n`,
  )
  if (platform !== 'win32') {
    const shim = `#!/bin/sh\nprintf '%s\\n' "$*"\nexit ${exitCode}\n`
    await Deno.writeTextFile(join(packageDir, binaryName), shim)
    await Deno.chmod(join(packageDir, binaryName), 0o755)
  }
  return { root, nodePath: join(root, 'node_modules') }
}

const runLauncher = async (fixture: Fixture, args: string[] = []) => {
  const command = new Deno.Command('node', {
    args: [launcherPath, ...args],
    env: { NODE_PATH: fixture.nodePath },
    stdout: 'piped',
    stderr: 'piped',
  })
  const result = await command.output()
  const decoder = new TextDecoder()
  return {
    code: result.code,
    stdout: decoder.decode(result.stdout),
    stderr: decoder.decode(result.stderr),
  }
}

const windows = platform === 'win32'

Deno.test({
  name: 'launcher executes the platform binary with the caller arguments',
  ignore: windows,
  fn: async () => {
    const fixture = await makeFixture(0)
    try {
      const result = await runLauncher(fixture, ['--version'])
      assertEquals(result.code, 0, result.stderr)
      assertMatch(result.stdout, /--version/)
    } finally {
      await Deno.remove(fixture.root, { recursive: true })
    }
  },
})

Deno.test({
  name: 'launcher propagates the platform binary exit code',
  ignore: windows,
  fn: async () => {
    const fixture = await makeFixture(42)
    try {
      const result = await runLauncher(fixture, ['scan', '.'])
      assertEquals(result.code, 42)
      assertMatch(result.stdout, /scan \./)
    } finally {
      await Deno.remove(fixture.root, { recursive: true })
    }
  },
})

Deno.test('launcher reports the missing platform package by name', async () => {
  const root = await Deno.makeTempDir({ prefix: 'gritlint-launcher-empty-' })
  try {
    const result = await runLauncher({ root, nodePath: join(root, 'node_modules') })
    assertNotEquals(result.code, 0)
    const output = `${result.stdout}${result.stderr}`
    assertMatch(output, new RegExp(packageName.replace(/[/@]/g, '\\$&')))
    assertMatch(output, new RegExp(`${platform}/${arch}`))
  } finally {
    await Deno.remove(root, { recursive: true })
  }
})
