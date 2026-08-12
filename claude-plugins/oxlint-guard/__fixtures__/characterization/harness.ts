import * as path from '@std/path'

export type OxlintPresence = 'exec' | 'noexec' | 'dir' | 'absent'

export interface TreeSpec {
  readonly files?: Readonly<Record<string, string>>
  readonly oxlint?: OxlintPresence
  readonly ancestorOxlint?: boolean
  readonly denoOnPath?: boolean
  readonly oxlintOnPath?: boolean
}

export interface CharacterizationCase {
  readonly id: string
  readonly hook: 'lint' | 'config'
  readonly tree: TreeSpec
  readonly cwd?: string
  readonly stdin: string
}

export interface Observation {
  readonly exitCode: number
  readonly stderr: string
}

export interface Runner {
  readonly bin: string
  readonly args: readonly string[]
}

const HERE = path.dirname(path.fromFileUrl(import.meta.url))
const FAKE_OXLINT = path.join(HERE, 'bin', 'oxlint.sh')
const FAKE_DENO = path.join(HERE, 'bin', 'deno.sh')

const installExecutable = async (source: string, target: string): Promise<void> => {
  await Deno.mkdir(path.dirname(target), { recursive: true })
  await Deno.copyFile(source, target)
  await Deno.chmod(target, 0o755)
}

const installOxlint = async (target: string, presence: OxlintPresence): Promise<void> => {
  switch (presence) {
    case 'exec':
      return installExecutable(FAKE_OXLINT, target)
    case 'noexec':
      await installExecutable(FAKE_OXLINT, target)
      return Deno.chmod(target, 0o000)
    case 'dir':
      return Deno.mkdir(target, { recursive: true })
    case 'absent':
      return
  }
}

// PATH is exclusive: the only reachable binaries are the fakes planted here, so
// a real deno or oxlint on the developer's machine can never leak into an
// observation and make a fixture irreproducible on another machine. The fake
// binaries are therefore builtin-only, except for the one external they cannot
// express, which is planted alongside them.
const materialize = async (spec: TreeSpec): Promise<{ readonly root: string; readonly pathEnv: string }> => {
  const base = await Deno.makeTempDir({ prefix: 'oxlint-guard-char-' })
  const root = path.join(base, 'project')
  const fakeBin = path.join(base, 'fakebin')
  await Deno.mkdir(root, { recursive: true })
  await Deno.mkdir(fakeBin, { recursive: true })
  await Deno.symlink(await resolveBinary('sleep'), path.join(fakeBin, 'sleep'))

  for (const [relative, contents] of Object.entries(spec.files ?? {})) {
    const target = path.join(root, relative)
    await Deno.mkdir(path.dirname(target), { recursive: true })
    await Deno.writeTextFile(target, contents)
  }

  await installOxlint(path.join(root, 'node_modules', '.bin', 'oxlint'), spec.oxlint ?? 'exec')

  if (spec.ancestorOxlint === true) {
    await installExecutable(FAKE_OXLINT, path.join(base, 'node_modules', '.bin', 'oxlint'))
  }
  if (spec.denoOnPath !== false) {
    await installExecutable(FAKE_DENO, path.join(fakeBin, 'deno'))
  }
  if (spec.oxlintOnPath === true) {
    await installExecutable(FAKE_OXLINT, path.join(fakeBin, 'oxlint'))
  }

  return { root, pathEnv: fakeBin }
}

const decoder = new TextDecoder()

export const observe = async (runner: Runner, testCase: CharacterizationCase): Promise<Observation> => {
  const { root, pathEnv } = await materialize(testCase.tree)
  const cwd = testCase.cwd === undefined ? root : path.join(root, testCase.cwd)

  const child = new Deno.Command(runner.bin, {
    args: [...runner.args],
    cwd,
    clearEnv: true,
    env: {
      PATH: pathEnv,
      HOME: root,
      CLAUDE_PROJECT_DIR: root,
      // A leak into a linter subprocess is observable rather than theoretical:
      // no fixture may ever surface this value.
      OXLINT_GUARD_TEST_SECRET: 'must-not-reach-a-subprocess',
    },
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
  }).spawn()

  const writer = child.stdin.getWriter()
  await writer.write(new TextEncoder().encode(testCase.stdin))
  await writer.close()

  const { code, stderr } = await child.output()

  return { exitCode: code, stderr: decoder.decode(stderr).replaceAll(root, '{{ROOT}}') }
}

// Resolves through the parent's PATH, which the harness clears for the child.
export const resolveBinary = async (name: string): Promise<string> => {
  const output = await new Deno.Command('sh', {
    args: ['-c', `command -v ${name}`],
    stdout: 'piped',
    stderr: 'null',
  }).output()
  const resolved = decoder.decode(output.stdout).trim()
  if (resolved === '') {
    throw new Error(`characterization harness: ${name} is not on PATH`)
  }
  return resolved
}
