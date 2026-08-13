import { ExtractionCommand, extractPairs } from './extraction.ts'
import type { Result } from './result.ts'
import { decodeEditCommand, HOOK_STDIN_CAP_BYTES } from './schemas.ts'
import { type CannotVerify, decide, DecideCommand, type Verdict } from './verdict.ts'

// `file_path` arrives relative to the hook's process cwd. Resolve it against
// cwd exactly once (absolute inputs pass through untouched); joining it onto a
// base that already contains it was the old implementation's double-join bug.
const resolveAgainstCwd = (cwd: string, filePath: string): string =>
  filePath.startsWith('/') ? filePath : `${cwd.replace(/\/$/, '')}/${filePath}`

// The on-disk file is the pre-edit state for every edit tool: Write/Create use
// it as the old side, and the hunk tools (Edit/MultiEdit/Update/morph) rebuild
// the whole edited document from it. A file that is absent OR unreadable yields
// undefined — indistinguishable by design, so an unreadable target is treated
// exactly like a new file instead of as an empty string that would fail JSON
// parsing or look like every off-rule was newly added.
export interface ConfigGuardDeps {
  readonly readTextFile: (path: string) => Promise<string | undefined>
}

const defaultDeps = (): ConfigGuardDeps => ({
  readTextFile: async (path: string): Promise<string | undefined> => {
    try {
      return await Deno.readTextFile(path)
    } catch {
      return undefined
    }
  },
})

export const blockMessage = (verdict: Extract<Verdict, { readonly _tag: 'Block' }>): string =>
  `Blocked: this edit disables the oxlint rule(s) ${verdict.rules.join(', ')} in an oxlint config. ` +
  'Fix the underlying violation instead of disabling the rule.'

export const cannotVerifyMessage = (reason: string): string =>
  `Blocked: cannot verify this edit to an oxlint config file (${reason}). ` +
  'Re-express the change as Edit, Write, or MultiEdit so the before/after content can be checked.'

export const oversizeMessage =
  'Blocked: cannot verify this edit to an oxlint config file (the hook payload exceeded the 1 MiB input cap).'

const render = (outcome: Result<Verdict, CannotVerify>): { readonly exitCode: number; readonly stderr: string } => {
  if (!outcome.ok) {
    return { exitCode: 2, stderr: cannotVerifyMessage(outcome.error.reason) + '\n' }
  }
  switch (outcome.value._tag) {
    case 'Block':
      return { exitCode: 2, stderr: blockMessage(outcome.value) + '\n' }
    case 'Allow':
      return { exitCode: 0, stderr: '' }
  }
}

export const runConfigGuard = async (
  raw: string,
  cwd: string,
  deps: ConfigGuardDeps,
): Promise<{ exitCode: number; stderr: string }> => {
  if (raw.length > HOOK_STDIN_CAP_BYTES) {
    return { exitCode: 2, stderr: oversizeMessage + '\n' }
  }
  const command = decodeEditCommand(raw)
  if (command === undefined) {
    return { exitCode: 0, stderr: '' }
  }
  const diskContent = await deps.readTextFile(resolveAgainstCwd(cwd, command.filePath))
  const extraction = extractPairs(ExtractionCommand({ command, diskContent }))
  const outcome = decide(DecideCommand({ targetPath: command.filePath, extraction }))
  return render(outcome)
}

// A defect in the guard itself must exit 2, never 0: a crashing PreToolUse hook
// must not silently permit an edit.
const crashMessage = 'Blocked: the oxlint config guard crashed while verifying this edit.'

const readStdin = async (): Promise<string | 'too-large'> => {
  let data = ''
  const decoder = new TextDecoder()
  for await (const chunk of Deno.stdin.readable) {
    data += decoder.decode(chunk, { stream: true })
    if (data.length > HOOK_STDIN_CAP_BYTES) {
      return 'too-large'
    }
  }
  return data + decoder.decode()
}

const writeStderr = async (text: string): Promise<void> => {
  await Deno.stderr.write(new TextEncoder().encode(text))
}

if (import.meta.main) {
  const raw = await readStdin()
  if (raw === 'too-large') {
    await writeStderr(oversizeMessage + '\n')
    Deno.exit(2)
  }
  try {
    const result = await runConfigGuard(raw, Deno.cwd(), defaultDeps())
    if (result.stderr !== '') {
      await writeStderr(result.stderr)
    }
    Deno.exit(result.exitCode)
  } catch {
    await writeStderr(crashMessage + '\n')
    Deno.exit(2)
  }
}
