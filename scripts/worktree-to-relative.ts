#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
import { dirname, relative } from '@std/path'
import { resolvePrimaryRepo } from './lib/git.ts'

/**
 * Convert all .git/worktrees/<name>/gitdir paths to relative.
 * Uses Deno APIs directly, idempotent, reports count.
 * CLI product output.
 */
async function worktreeToRelative(worktreePath = Deno.cwd()): Promise<number> {
  const primaryPath = await resolvePrimaryRepo(worktreePath)
  if (!primaryPath) {
    console.error(`error: not a git repo at ${worktreePath}`)
    Deno.exit(1)
  }
  const worktreesDir = `${primaryPath}/.git/worktrees`
  try {
    await Deno.stat(worktreesDir)
  } catch {
    console.log('no worktrees')
    return 0
  }
  let count = 0
  for await (const entry of Deno.readDir(worktreesDir)) {
    const gitdirFile = `${worktreesDir}/${entry.name}/gitdir`
    let target: string
    try {
      target = (await Deno.readTextFile(gitdirFile)).trim()
    } catch {
      continue
    }
    if (!target.startsWith('/')) continue
    const baseDir = dirname(gitdirFile)
    let rel: string
    try {
      rel = relative(baseDir, target)
    } catch {
      continue
    }
    await Deno.writeTextFile(gitdirFile, rel + '\n')
    console.log(`  gitdir: ${entry.name} -> ${rel}`)
    count++
  }
  console.log(`converted ${count} worktree gitdir files`)
  return count
}

if (import.meta.main) {
  const p = Deno.args[0] ?? Deno.cwd()
  await worktreeToRelative(p)
}
