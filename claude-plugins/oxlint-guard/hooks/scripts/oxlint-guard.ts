import { isEditTool, isLintable, parseHookInput } from '../lib/input.ts'

type Verdict =
  | { kind: 'exit0' }
  | { kind: 'exit2'; message: string }

const RESOLVER_EXIT = 1

declare const Deno: {
  stdin: { readable: ReadableStream<Uint8Array> }
  exit(code: number): never
  stat(path: string): Promise<{ isFile: boolean; isSymlink: boolean }>
  readTextFile(path: string): Promise<string>
  Command: new(
    cmd: string,
    options: { args: string[]; cwd: string; stdout: 'piped'; stderr: 'piped' },
  ) => { output(): Promise<{ code: number; stdout: Uint8Array; stderr: Uint8Array }> }
}

function dirname(p: string): string {
  const slash = p.lastIndexOf('/')
  return slash > 0 ? p.slice(0, slash) : '/'
}

const PACKAGE_MANAGER_BY_LOCKFILE: Record<string, 'pnpm' | 'bun' | 'npm' | 'yarn'> = {
  'pnpm-lock.yaml': 'pnpm',
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
}

const BUN_LOCKFILES: ReadonlyArray<string> = ['bun.lockb', 'bun.lock']

export interface Resolver {
  detectPackageManager(cwd: string): Promise<'pnpm' | 'bun' | 'npm' | 'yarn' | null>
  findNearestOxlintConfig(fromDir: string): Promise<string | null>
  resolveLocalOxlintBinary(fromDir: string): Promise<string | null>
  readFile(path: string): Promise<string | null>
  fileExists(path: string): Promise<boolean>
  runCommand(cmd: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }>
}

export const defaultResolver: Resolver = {
  async detectPackageManager(cwd) {
    let dir = cwd
    while (true) {
      for (const lock of Object.keys(PACKAGE_MANAGER_BY_LOCKFILE)) {
        try {
          await Deno.stat(`${dir}/${lock}`)
          return PACKAGE_MANAGER_BY_LOCKFILE[lock]
        } catch {
          continue
        }
      }
      for (const lock of BUN_LOCKFILES) {
        try {
          await Deno.stat(`${dir}/${lock}`)
          return 'bun'
        } catch {
          continue
        }
      }
      const parent = dirname(dir)
      if (parent === dir) return null
      dir = parent
    }
  },

  async findNearestOxlintConfig(fromDir) {
    const NAMES = [
      'oxlint.config.ts',
      'oxlint.config.js',
      'oxlint.config.mjs',
      'oxlint.config.cjs',
      'oxlint.json',
      '.oxlintrc.json',
    ]
    let dir = fromDir
    while (true) {
      for (const name of NAMES) {
        const candidate = `${dir}/${name}`
        try {
          await Deno.stat(candidate)
          return candidate
        } catch {
          continue
        }
      }
      const parent = dirname(dir)
      if (parent === dir) return null
      dir = parent
    }
  },

  async resolveLocalOxlintBinary(fromDir) {
    let dir = fromDir
    while (true) {
      for (const bin of ['oxlint', 'oxlint.cmd']) {
        const candidate = `${dir}/node_modules/.bin/${bin}`
        try {
          const stat = await Deno.stat(candidate)
          if (stat.isFile || stat.isSymlink) return candidate
        } catch {
          continue
        }
      }
      const parent = dirname(dir)
      if (parent === dir) return null
      dir = parent
    }
  },

  async readFile(path) {
    try {
      return await Deno.readTextFile(path)
    } catch {
      return null
    }
  },

  async fileExists(path) {
    try {
      await Deno.stat(path)
      return true
    } catch {
      return false
    }
  },

  async runCommand(cmd, args, cwd) {
    const p = new Deno.Command(cmd, { args, cwd, stdout: 'piped', stderr: 'piped' })
    const out = await p.output()
    return {
      code: out.code,
      stdout: new TextDecoder().decode(out.stdout),
      stderr: new TextDecoder().decode(out.stderr),
    }
  },
}

interface DecideArgs {
  toolName: string
  filePath: string
  resolver: Resolver
}

export async function decideLint({ toolName, filePath, resolver }: DecideArgs): Promise<Verdict> {
  if (!isEditTool(toolName)) return { kind: 'exit0' }
  if (filePath === '') return { kind: 'exit0' }
  if (!isLintable(filePath)) return { kind: 'exit0' }
  if (!(await resolver.fileExists(filePath))) return { kind: 'exit0' }

  const head = (await resolver.readFile(filePath)) ?? ''
  const firstLine = head.split(/\r?\n/, 1)[0] ?? ''
  if (/^#!.*\bdeno\b/.test(firstLine)) {
    const check = await resolver.runCommand('deno', ['check', filePath], dirname(filePath))
    if (check.code !== 0) {
      return {
        kind: 'exit2',
        message: `deno check failed for ${filePath}:\n${check.stderr || check.stdout}`,
      }
    }
    const lint = await resolver.runCommand('deno', ['lint', filePath], dirname(filePath))
    if (lint.code !== 0) {
      return {
        kind: 'exit2',
        message: `deno lint failed for ${filePath}:\n${lint.stderr || lint.stdout}`,
      }
    }
    return { kind: 'exit0' }
  }

  const configPath = await resolver.findNearestOxlintConfig(dirname(filePath))
  if (configPath === null) {
    return {
      kind: 'exit2',
      message:
        `oxlint config not found near ${filePath}. Create an oxlint.config.ts (or oxlint.config.{js,mjs,cjs}, oxlint.json, .oxlintrc.json) before linting runs.`,
    }
  }

  const oxlintBin = await resolver.resolveLocalOxlintBinary(dirname(filePath))
  if (oxlintBin === null) {
    return {
      kind: 'exit2',
      message:
        `oxlint not found locally for ${filePath} — install it as a dev dependency (e.g. pnpm add -D oxlint) so the lint guard never relies on PATH lookup or a network-fetched binary.`,
    }
  }

  const configDir = configPath.slice(0, configPath.lastIndexOf('/'))
  const cmdName = oxlintBin.endsWith('.cmd') ? 'cmd.exe' : oxlintBin
  const cmdArgs = oxlintBin.endsWith('.cmd')
    ? ['/c', oxlintBin, '--type-aware', '--type-check', '-f', 'unix', '-c', configPath, filePath]
    : ['--type-aware', '--type-check', '-f', 'unix', '-c', configPath, filePath]
  const result = await resolver.runCommand(cmdName, cmdArgs, configDir)

  if (result.code === 0) return { kind: 'exit0' }

  if (/No files found to lint/i.test(result.stdout + result.stderr)) {
    return { kind: 'exit0' }
  }
  if (/path is expected to be under the root/i.test(result.stdout + result.stderr)) {
    return { kind: 'exit0' }
  }

  const combined = result.stderr || result.stdout
  if (/tsgolint|oxlint-tsgolint/i.test(combined)) {
    const fallback = await resolver.runCommand(
      cmdName,
      oxlintBin.endsWith('.cmd')
        ? ['/c', oxlintBin, '-f', 'unix', '-c', configPath, filePath]
        : ['-f', 'unix', '-c', configPath, filePath],
      configDir,
    )
    if (fallback.code === 0) return { kind: 'exit0' }
    return {
      kind: 'exit2',
      message: `oxlint failed for ${filePath} (type-aware backend unavailable):\n${fallback.stderr || fallback.stdout}`,
    }
  }

  return {
    kind: 'exit2',
    message: `oxlint failed for ${filePath}:\n${combined}`,
  }
}

if ((import.meta as { main?: boolean }).main) {
  const raw = await new Response(Deno.stdin.readable).text()
  const { toolName, filePath } = parseHookInput(raw)
  try {
    const verdict = await decideLint({ toolName, filePath, resolver: defaultResolver })
    if (verdict.kind === 'exit2') {
      console.error(verdict.message)
      Deno.exit(RESOLVER_EXIT)
    }
  } catch (err) {
    console.error(`oxlint-guard: unexpected error: ${(err as Error).message}`)
    Deno.exit(RESOLVER_EXIT)
  }
}
