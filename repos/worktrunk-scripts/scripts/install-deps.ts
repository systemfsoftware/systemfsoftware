#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env
import { exists } from '@std/fs'

type Manager = { check: string; cmd: string[] }

async function pickManager(worktreePath: string): Promise<Manager | null> {
  if (await exists(`${worktreePath}/pnpm-lock.yaml`)) {
    return { check: 'pnpm-lock.yaml', cmd: ['corepack', 'pnpm', 'install', '--frozen-lockfile'] }
  }
  if (await exists(`${worktreePath}/package-lock.json`)) {
    return { check: 'package-lock.json', cmd: ['npm', 'ci'] }
  }
  if (await exists(`${worktreePath}/yarn.lock`)) {
    return { check: 'yarn.lock', cmd: ['yarn', 'install', '--frozen-lockfile'] }
  }
  if (await exists(`${worktreePath}/bun.lock`)) {
    return { check: 'bun.lock', cmd: ['bun', 'install', '--frozen-lockfile'] }
  }
  if (await exists(`${worktreePath}/Cargo.toml`)) {
    return { check: 'Cargo.toml', cmd: ['cargo', 'build'] }
  }
  if (await exists(`${worktreePath}/go.mod`)) {
    return { check: 'go.mod', cmd: ['go', 'mod', 'download'] }
  }
  if (await exists(`${worktreePath}/Gemfile`)) {
    return { check: 'Gemfile', cmd: ['bundle', 'install'] }
  }
  if (
    (await exists(`${worktreePath}/pyproject.toml`)) ||
    (await exists(`${worktreePath}/requirements.txt`))
  ) {
    return { check: 'pyproject/requirements', cmd: ['pip-install'] }
  }
  return null
}

async function installDeps(worktreePath: string): Promise<void> {
  console.log('install-deps: installing dependencies in worktree...')
  const mgr = await pickManager(worktreePath)
  if (!mgr) {
    console.log('install-deps: no recognized package manager, skipping')
    console.log('install-deps: done')
    return
  }
  if (mgr.cmd[0] === 'pip-install') {
    let cmd = new Deno.Command('pip', { args: ['install', '-e', '.'], cwd: worktreePath })
    let { code } = await cmd.output()
    if (code !== 0) {
      cmd = new Deno.Command('pip', {
        args: ['install', '-r', 'requirements.txt'],
        cwd: worktreePath,
      })
      ;({ code } = await cmd.output())
      if (code !== 0) {
        console.error(`install-deps: pip install exited ${code}`)
        Deno.exit(code)
      }
    }
    console.log('install-deps: done')
    return
  }
  const cmd = new Deno.Command(mgr.cmd[0], { args: mgr.cmd.slice(1), cwd: worktreePath })
  const { code } = await cmd.output()
  if (code !== 0) {
    console.error(`install-deps: ${mgr.cmd.join(' ')} exited ${code}`)
    Deno.exit(code)
  }
  console.log('install-deps: done')
}

if (import.meta.main) {
  const p = Deno.args[0]
  if (!p) {
    console.error('worktree_path required')
    Deno.exit(1)
  }
  await installDeps(p!)
}
