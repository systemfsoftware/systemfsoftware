// The shipped artifact's process seam: both hooks run exactly as hooks.json
// declares them, with a real payload on stdin, a real project tree on disk, and
// the exit code, stdout, and stderr a client observes. Four journeys is the
// ceiling — the flag, edit-shape, and key matrices are exercised one layer down
// in guard.integration.test.ts, and this file exists for what only the process
// can show: the stream contract, the exit codes, and the stdin cap.

import { assertEquals, assertStringIncludes } from '@std/assert'
import { join } from '@std/path'

const PLUGIN_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const AGE = 'minimumReleaseAge'
const QUARANTINE = String(1440)
const SHORT_QUARANTINE = String(0)
const OFF = 'false'
const STRICT_DEP = 'strictDepBuilds'
const DEFAULT_WORKSPACE = `${AGE}: ${QUARANTINE}\n`

interface HookEntry {
  readonly matcher?: string
  readonly hooks: readonly { readonly command: string }[]
}

const shippedCommands = async (): Promise<readonly string[]> => {
  const raw = await Deno.readTextFile(join(PLUGIN_ROOT, 'hooks/hooks.json'))
  const parsed = JSON.parse(raw) as { hooks: { PreToolUse: readonly HookEntry[] } }
  return parsed.hooks.PreToolUse.flatMap((entry) => entry.hooks.map((hook) => hook.command))
}

const shippedCommand = async (needle: string): Promise<string> => {
  const found = (await shippedCommands()).find((command) => command.includes(needle))
  if (found === undefined) {
    throw new Error(`hooks.json declares no command referencing ${needle}`)
  }
  return found.replaceAll('${CLAUDE_PLUGIN_ROOT}', PLUGIN_ROOT)
}

const withProject = async (files: Record<string, string>, body: (root: string) => Promise<void>): Promise<void> => {
  const root = await Deno.makeTempDir({ prefix: 'pnpm-guard-e2e-' })
  try {
    for (const [path, content] of Object.entries(files)) {
      await Deno.writeTextFile(join(root, path), content)
    }
    await body(root)
  } finally {
    await Deno.remove(root, { recursive: true })
  }
}

interface HookRun {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

const runHook = async (command: string, payload: string, cwd: string): Promise<HookRun> => {
  const child = new Deno.Command('sh', {
    args: ['-c', command],
    cwd,
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
    env: { PATH: Deno.env.get('PATH') ?? '', HOME: Deno.env.get('HOME') ?? '', CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
  }).spawn()
  const writer = child.stdin.getWriter()
  await writer.write(new TextEncoder().encode(payload))
  await writer.close()
  const { code, stdout, stderr } = await child.output()
  return { code, stdout: new TextDecoder().decode(stdout), stderr: new TextDecoder().decode(stderr) }
}

const editPayload = (root: string, oldString: string, newString: string): string =>
  JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: join(root, 'pnpm-workspace.yaml'), old_string: oldString, new_string: newString },
  })

const bashPayload = (command: string): string => JSON.stringify({ tool_name: 'Bash', tool_input: { command } })

Deno.test('the file guard refuses a weakening edit through its shipped command', async () => {
  await withProject({ 'pnpm-workspace.yaml': DEFAULT_WORKSPACE }, async (root) => {
    const command = await shippedCommand('guard-files.ts')
    const result = await runHook(
      command,
      editPayload(root, `${AGE}: ${QUARANTINE}`, `${AGE}: ${SHORT_QUARANTINE}`),
      root,
    )
    assertEquals(result.code, 2, `expected a refusal; stderr: ${result.stderr}`)
    assertStringIncludes(result.stderr, AGE)
    assertEquals(result.stdout, '', 'a block writes nothing to stdout')
  })
})

Deno.test('the file guard passes a benign edit and refuses what it cannot read, silently otherwise', async () => {
  await withProject({ 'pnpm-workspace.yaml': DEFAULT_WORKSPACE }, async (root) => {
    const command = await shippedCommand('guard-files.ts')
    const benign = await runHook(command, editPayload(root, 'x-not-present', 'x-not-present'), root)
    assertEquals(benign.code, 2, 'a hunk that is not on disk is unverifiable')
    assertEquals(benign.stdout, '')

    const oversize = await runHook(command, 'x'.repeat(1024 * 1024 + 1), root)
    assertEquals(oversize.code, 2, 'a payload past the stdin cap is refused')
    assertStringIncludes(oversize.stderr, 'input cap')
    assertEquals(oversize.stdout, '')

    const untouched = await runHook(
      command,
      JSON.stringify({ tool_name: 'Read', tool_input: { file_path: join(root, 'pnpm-workspace.yaml') } }),
      root,
    )
    assertEquals({ code: untouched.code, stdout: untouched.stdout, stderr: untouched.stderr }, {
      code: 0,
      stdout: '',
      stderr: '',
    })
  })
})

Deno.test('the command guard refuses a weakening command through its shipped command', async () => {
  await withProject({ 'pnpm-workspace.yaml': DEFAULT_WORKSPACE }, async (root) => {
    const command = await shippedCommand('guard-commands.ts')
    const result = await runHook(command, bashPayload(`pnpm config set ${AGE} ${SHORT_QUARANTINE}`), root)
    assertEquals(result.code, 2, `expected a refusal; stderr: ${result.stderr}`)
    assertStringIncludes(result.stderr, AGE)
    assertEquals(result.stdout, '', 'a block writes nothing to stdout')
  })
})

Deno.test('the command guard passes a benign command and a weakening flag silently', async () => {
  await withProject({ 'pnpm-workspace.yaml': DEFAULT_WORKSPACE }, async (root) => {
    const command = await shippedCommand('guard-commands.ts')
    const benign = await runHook(command, bashPayload('pnpm install --frozen-lockfile'), root)
    assertEquals({ code: benign.code, stdout: benign.stdout, stderr: benign.stderr }, {
      code: 0,
      stdout: '',
      stderr: '',
    })

    const flag = await runHook(command, bashPayload(`pnpm install --config.${STRICT_DEP}=${OFF}`), root)
    assertEquals(flag.code, 2, 'the flag route is part of the shipped contract')
    assertEquals(flag.stdout, '')
  })
})
