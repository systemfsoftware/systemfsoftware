#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env
// Process-seam smoke, run with `deno task smoke`. The harness that feeds these
// hooks in production is the client, which this plugin cannot stand up: the
// decisions are covered in-process by the suites under tests/, and what is left
// for a real process is the stream contract and the exit codes.

import { join } from '@std/path'

const PLUGIN_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const AGE = 'minimumReleaseAge'
const QUARANTINE = String(1440)
const SHORT_QUARANTINE = String(0)
const STRICT_DEP = 'strictDepBuilds'
const OFF = 'false'

interface HookEntry {
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
    throw new Error(`hooks/hooks.json declares no command referencing ${needle}`)
  }
  return found.replaceAll('${CLAUDE_PLUGIN_ROOT}', PLUGIN_ROOT)
}

interface Observation {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

const runHook = async (command: string, payload: string, cwd: string): Promise<Observation> => {
  const child = new Deno.Command('sh', {
    args: ['-c', command],
    cwd,
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
    env: { PATH: Deno.env.get('PATH') ?? '', HOME: Deno.env.get('HOME') ?? '' },
  }).spawn()
  const writer = child.stdin.getWriter()
  await writer.write(new TextEncoder().encode(payload))
  await writer.close()
  const output = await child.output()
  return {
    code: output.code,
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
  }
}

interface Check {
  readonly label: string
  readonly expect: { readonly code: number; readonly stderr: string; readonly stdout: string }
  readonly observe: (root: string) => Promise<Observation>
}

const checks = async (): Promise<readonly Check[]> => {
  const fileGuard = await shippedCommand('file-guard.ts')
  const commandGuard = await shippedCommand('command-guard.ts')
  const edit = (oldString: string, newString: string): string =>
    JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: 'pnpm-workspace.yaml', old_string: oldString, new_string: newString },
    })
  const bash = (command: string): string => JSON.stringify({ tool_name: 'Bash', tool_input: { command } })
  return [
    {
      label: 'file guard refuses a weakening edit',
      expect: { code: 2, stderr: AGE, stdout: '' },
      observe: (root) => runHook(fileGuard, edit(`${AGE}: ${QUARANTINE}`, `${AGE}: ${SHORT_QUARANTINE}`), root),
    },
    {
      label: 'file guard passes an edit it cannot apply, as unverifiable',
      expect: { code: 2, stderr: 'cannot verify', stdout: '' },
      observe: (root) => runHook(fileGuard, edit('not-present-in-this-file', 'still-not-present'), root),
    },
    {
      label: 'file guard passes a non-edit tool silently',
      expect: { code: 0, stderr: '', stdout: '' },
      observe: (root) =>
        runHook(
          fileGuard,
          JSON.stringify({ tool_name: 'Read', tool_input: { file_path: join(root, 'pnpm-workspace.yaml') } }),
          root,
        ),
    },
    {
      label: 'command guard refuses a weakening command',
      expect: { code: 2, stderr: AGE, stdout: '' },
      observe: (root) => runHook(commandGuard, bash(`pnpm config set ${AGE} ${SHORT_QUARANTINE}`), root),
    },
    {
      label: 'command guard refuses a weakening flag',
      expect: { code: 2, stderr: STRICT_DEP, stdout: '' },
      observe: (root) => runHook(commandGuard, bash(`pnpm install --config.${STRICT_DEP}=${OFF}`), root),
    },
    {
      label: 'command guard passes a benign command silently',
      expect: { code: 0, stderr: '', stdout: '' },
      observe: (root) => runHook(commandGuard, bash('pnpm install --frozen-lockfile'), root),
    },
  ]
}

const root = await Deno.makeTempDir({ prefix: 'pnpm-guard-smoke-' })
let failures = 0
try {
  await Deno.writeTextFile(join(root, 'pnpm-workspace.yaml'), `${AGE}: ${QUARANTINE}\n`)
  for (const check of await checks()) {
    const observed = await check.observe(root)
    const ok = observed.code === check.expect.code &&
      observed.stdout === check.expect.stdout &&
      (check.expect.stderr === '' || observed.stderr.includes(check.expect.stderr))
    if (!ok) {
      failures += 1
      console.error(`FAIL ${check.label}`)
      console.error(
        `  expected exit ${check.expect.code}, stdout ${JSON.stringify(check.expect.stdout)}` +
          `, stderr containing ${JSON.stringify(check.expect.stderr)}`,
      )
      console.error(
        `  observed exit ${observed.code}, stdout ${JSON.stringify(observed.stdout)}` +
          `, stderr ${JSON.stringify(observed.stderr.split('\n')[0])}`,
      )
      continue
    }
    console.log(`ok   ${check.label}`)
  }
} finally {
  await Deno.remove(root, { recursive: true })
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  Deno.exit(1)
}
console.log('\nthe process contract holds')
