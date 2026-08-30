#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env
import { dirname, relative } from '@std/path'
import { resolvePrimaryRepo } from './lib/git.ts'

async function convertMainRepoGitdirToRelative(
  worktreePath: string,
  primaryPath: string,
): Promise<number> {
  const worktreesDir = `${primaryPath}/.git/worktrees`
  try {
    await Deno.stat(worktreesDir)
  } catch {
    return 0
  }
  const expected = `${worktreePath}/.git`
  let converted = 0
  for await (const entry of Deno.readDir(worktreesDir)) {
    if (!entry.isDirectory) continue
    const gitdirFile = `${worktreesDir}/${entry.name}/gitdir`
    let target: string
    try {
      target = (await Deno.readTextFile(gitdirFile)).trim()
    } catch {
      continue
    }
    if (target !== expected || !target.startsWith('/')) continue
    const baseDir = dirname(gitdirFile)
    let rel: string
    try {
      rel = relative(baseDir, target)
    } catch {
      continue
    }
    await Deno.writeTextFile(gitdirFile, rel + '\n')
    console.log(`  gitdir: ${entry.name} -> ${rel}`)
    converted++
  }
  return converted
}

async function convertWorktreeGitfileToRelative(worktreePath: string): Promise<boolean> {
  const gitFile = `${worktreePath}/.git`
  let stat: Deno.FileInfo
  try {
    stat = await Deno.stat(gitFile)
  } catch {
    return false
  }
  if (!stat.isFile) return false
  const line = (await Deno.readTextFile(gitFile)).split('\n')[0] ?? ''
  if (!line.startsWith('gitdir:')) return false
  const absPath = line.slice('gitdir:'.length).trim()
  if (!absPath.startsWith('/')) return false
  let rel: string
  try {
    rel = relative(worktreePath, absPath)
  } catch {
    return false
  }
  await Deno.writeTextFile(gitFile, `gitdir: ${rel}\n`)
  console.log(`  .git -> ${rel}`)
  return true
}

async function linkSharedDir(
  name: string,
  worktreePath: string,
  primaryPath: string,
): Promise<boolean> {
  const src = `${primaryPath}/${name}`
  try {
    const s = await Deno.stat(src)
    if (!s.isDirectory) {
      console.log(`pre-start: no ${name} in primary, skipping symlink`)
      return false
    }
  } catch {
    console.log(`pre-start: no ${name} in primary, skipping symlink`)
    return false
  }
  const target = `${worktreePath}/${name}`
  try {
    const t = await Deno.lstat(target)
    if (!t.isSymlink) {
      console.log(`pre-start: ${target} is a real directory, leaving it`)
      return false
    }
  } catch {
    // missing — create
  }
  try {
    await Deno.remove(target)
  } catch {
    // ignore
  }
  const rel = relative(worktreePath, src)
  await Deno.symlink(rel, target)
  console.log(`pre-start: ${name} -> ${rel}`)
  return true
}

async function main(args: string[] = Deno.args): Promise<void> {
  const worktreePath = args[0]
  if (!worktreePath) {
    console.error('worktree_path required')
    Deno.exit(1)
  }
  let primaryPath: string | null = args[1] ?? null
  if (!primaryPath) {
    try {
      primaryPath = await resolvePrimaryRepo(worktreePath)
    } catch {
      primaryPath = null
    }
  }
  if (primaryPath) {
    await convertMainRepoGitdirToRelative(worktreePath, primaryPath)
    await convertWorktreeGitfileToRelative(worktreePath)
  }
  const cmd = new Deno.Command('git', {
    args: ['-C', worktreePath, 'config', '--unset', 'extensions.relativeWorktrees'],
    stdout: 'null',
    stderr: 'null',
  })
  await cmd.output()

  if (!primaryPath) {
    console.log('pre-start: running in primary repo (not a worktree) — done')
    return
  }
  await linkSharedDir('.repos', worktreePath, primaryPath)
  await linkSharedDir('.issues', worktreePath, primaryPath)
  await linkSharedDir('wiki', worktreePath, primaryPath)
}

if (import.meta.main) await main()
