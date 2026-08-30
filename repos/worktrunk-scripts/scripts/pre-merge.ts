#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
import { join } from '@std/path'
import { isSymlink } from './lib/fs.ts'
import { runGit } from './lib/git.ts'

const ISSUE_PATTERNS = [/^[0-9].*-.*\.md$/, /^T[0-9a-fA-F].*-.*\.md$/]

async function preMerge(worktreePath: string): Promise<void> {
  for await (const entry of Deno.readDir(worktreePath)) {
    if (!ISSUE_PATTERNS.some((re) => re.test(entry.name))) continue
    const full = join(worktreePath, entry.name)
    if (!(await isSymlink(full))) continue
    try {
      await Deno.remove(full)
      console.log(`pre-merge: removed symlinked issue ${entry.name}`)
    } catch (err) {
      console.error(`pre-merge: failed to remove ${entry.name}: ${err}`)
    }
  }
  const { code } = await runGit(['add', '-A'], worktreePath)
  if (code !== 0) {
    console.error(`pre-merge: git add -A failed (exit ${code})`)
    Deno.exit(code)
  }
}

if (import.meta.main) {
  const p = Deno.args[0]
  if (!p) {
    console.error('worktree_path required')
    Deno.exit(1)
  }
  await preMerge(p)
}
