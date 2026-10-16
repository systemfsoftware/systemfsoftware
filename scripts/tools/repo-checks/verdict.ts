// The verdict every check returns, and the one way a check reads git. A check
// that cannot decide throws Undecided; the CLI maps it to exit 2 so a planted
// violation (exit 1) is never confused with a broken environment.

export type Verdict =
  | { readonly _tag: 'Holds'; readonly summary: string }
  | { readonly _tag: 'Violated'; readonly violations: readonly string[]; readonly why: string }

export const holds = (summary: string): Verdict => ({ _tag: 'Holds', summary })

export const violated = (violations: readonly string[], why: string): Verdict => ({
  _tag: 'Violated',
  violations,
  why,
})

export class Undecided extends Error {
  override readonly name = 'Undecided'
}

const decoder = new TextDecoder()

// Deno refuses a scoped --allow-run spawn while a loader variable (LD_*, DYLD_*)
// is set, and a dev shell sets some. The children (git, tsc) need none.
const childEnv = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(Deno.env.toObject()).filter(([key]) => !key.startsWith('LD_') && !key.startsWith('DYLD_')),
  )

export const run = async (command: string, args: readonly string[]): Promise<string> => {
  let out: Deno.CommandOutput
  try {
    out = await new Deno.Command(command, {
      args: [...args],
      clearEnv: true,
      env: childEnv(),
      stdout: 'piped',
      stderr: 'piped',
    }).output()
  } catch (cause) {
    throw new Undecided(`${command} could not start: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (!out.success) {
    const tail = decoder.decode(out.stderr).trim().split('\n').slice(-8).join('\n')
    throw new Undecided(`${command} ${args.join(' ')} failed (exit ${out.code}):\n${tail}`)
  }
  return decoder.decode(out.stdout)
}

export const git = (args: readonly string[]): Promise<string> => run('git', args)

/** The object at `<rev>:<path>`, or null when the path is absent there; any other git failure is Undecided. */
export const objectAt = async (
  rev: string,
  path: string,
): Promise<{ readonly type: string; readonly id: string } | null> => {
  const out = (await git(['ls-tree', '--format=%(objecttype) %(objectname)', rev, '--', path])).trim()
  if (out.length === 0) return null
  const [type = '', id = ''] = out.split(' ')
  return { type, id }
}

export const parseJsonObject = (text: string, label: string): Readonly<Record<string, unknown>> => {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (cause) {
    throw new Undecided(`${label}: unparseable JSON - ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Undecided(`${label}: not a JSON object`)
  }
  return value as Readonly<Record<string, unknown>>
}

export const exists = async (path: string): Promise<boolean> => {
  try {
    await Deno.stat(path)
    return true
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) return false
    throw cause
  }
}
