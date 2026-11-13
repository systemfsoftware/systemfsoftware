#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env
import { exists } from '@std/fs'

type Runner = { lockfile: string; cmd: string; args: string[] }

const runners: Runner[] = [
  { lockfile: 'pnpm-lock.yaml', cmd: 'corepack', args: ['pnpm', 'run'] },
  { lockfile: 'package-lock.json', cmd: 'npm', args: ['run'] },
  { lockfile: 'yarn.lock', cmd: 'yarn', args: [] },
  { lockfile: 'bun.lock', cmd: 'bun', args: ['run'] },
]

async function declaresScript(worktreePath: string, script: string): Promise<boolean> {
  const pkgPath = `${worktreePath}/package.json`
  if (!(await exists(pkgPath))) return false
  const pkg = JSON.parse(await Deno.readTextFile(pkgPath))
  return typeof pkg?.scripts?.[script] === 'string'
}

async function pickRunner(worktreePath: string): Promise<Runner | null> {
  for (const runner of runners) {
    if (await exists(`${worktreePath}/${runner.lockfile}`)) return runner
  }
  return null
}

async function runPackageScript(
  worktreePath: string,
  script: string,
  bestEffort: boolean,
): Promise<number> {
  if (!(await declaresScript(worktreePath, script))) {
    console.log(`run-package-script: no "${script}" script in package.json, skipping`)
    return 0
  }
  const runner = await pickRunner(worktreePath)
  if (!runner) {
    console.log(`run-package-script: no recognized lockfile for "${script}", skipping`)
    return 0
  }
  console.log(`run-package-script: ${runner.cmd} ${[...runner.args, script].join(' ')}`)
  const { code } = await new Deno.Command(runner.cmd, {
    args: [...runner.args, script],
    cwd: worktreePath,
    stdout: 'inherit',
    stderr: 'inherit',
  }).output()
  if (code === 0) return 0
  if (bestEffort) {
    console.log(`run-package-script: "${script}" exited ${code}, ignored (--best-effort)`)
    return 0
  }
  console.error(`run-package-script: "${script}" exited ${code}`)
  return code
}

if (import.meta.main) {
  const args = Deno.args.filter((arg) => arg !== '--best-effort')
  const bestEffort = Deno.args.includes('--best-effort')
  const [worktreePath, script] = args
  if (!worktreePath || !script) {
    console.error('usage: run-package-script.ts <worktree_path> <script> [--best-effort]')
    Deno.exit(1)
  }
  Deno.exit(await runPackageScript(worktreePath, script, bestEffort))
}
