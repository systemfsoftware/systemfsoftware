#!/usr/bin/env -S deno run --allow-read --allow-write
import { relative } from '@std/path'

async function convertToRelativePaths(sharedRoot: string): Promise<number> {
  let count = 0
  for await (const entry of Deno.readDir(sharedRoot)) {
    if (!entry.isDirectory) continue
    const gitFile = `${sharedRoot}/${entry.name}/.git`
    let stat: Deno.FileInfo
    try {
      stat = await Deno.stat(gitFile)
    } catch {
      continue
    }
    if (!stat.isFile) continue
    const line = (await Deno.readTextFile(gitFile)).split('\n')[0] ?? ''
    if (!line.startsWith('gitdir:')) continue
    const absPath = line.slice('gitdir:'.length).trim()
    if (!absPath.startsWith('/')) continue
    const worktreePath = `${sharedRoot}/${entry.name}`
    let rel: string
    try {
      rel = relative(worktreePath, absPath)
    } catch {
      continue
    }
    await Deno.writeTextFile(gitFile, `gitdir: ${rel}\n`)
    console.log(`  ${worktreePath}/.git -> ${rel}`)
    count++
  }
  console.log(`converted ${count} worktree .git files`)
  return count
}

if (import.meta.main) {
  const root = Deno.args[0] ?? Deno.cwd()
  try {
    await Deno.stat(root)
  } catch {
    console.error(`error: ${root} is not a directory`)
    Deno.exit(1)
  }
  await convertToRelativePaths(root)
}
