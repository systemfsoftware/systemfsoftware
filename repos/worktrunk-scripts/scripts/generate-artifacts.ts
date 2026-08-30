#!/usr/bin/env -S deno run --allow-read --allow-run
import { exists } from '@std/fs'

async function generateArtifacts(worktreePath: string): Promise<void> {
  console.log('generate-artifacts: generating build artifacts...')
  let cmd: Deno.Command
  if (await exists(`${worktreePath}/pnpm-lock.yaml`)) {
    cmd = new Deno.Command('corepack', { args: ['pnpm', 'build'], cwd: worktreePath })
  } else if (await exists(`${worktreePath}/package-lock.json`)) {
    cmd = new Deno.Command('npm', { args: ['run', 'build'], cwd: worktreePath })
  } else if (await exists(`${worktreePath}/yarn.lock`)) {
    cmd = new Deno.Command('yarn', { args: ['build'], cwd: worktreePath })
  } else if (await exists(`${worktreePath}/bun.lock`)) {
    cmd = new Deno.Command('bun', { args: ['run', 'build'], cwd: worktreePath })
  } else if (await exists(`${worktreePath}/Cargo.toml`)) {
    cmd = new Deno.Command('cargo', { args: ['build'], cwd: worktreePath })
  } else if (await exists(`${worktreePath}/go.mod`)) {
    cmd = new Deno.Command('go', { args: ['build', './...'], cwd: worktreePath })
  } else {
    console.log('generate-artifacts: no recognized build system, skipping')
    console.log('generate-artifacts: done')
    return
  }
  const { code } = await cmd.output()
  if (code !== 0) {
    console.error(`generate-artifacts: build exited ${code}`)
    Deno.exit(code)
  }
  console.log('generate-artifacts: done')
}

if (import.meta.main) {
  const p = Deno.args[0]
  if (!p) {
    console.error('worktree_path required')
    Deno.exit(1)
  }
  await generateArtifacts(p!)
}
