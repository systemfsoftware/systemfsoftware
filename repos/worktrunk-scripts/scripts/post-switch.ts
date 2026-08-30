#!/usr/bin/env -S deno run --allow-run
async function postSwitch(worktreePath: string): Promise<void> {
  const cmd = new Deno.Command('git', {
    args: ['-C', worktreePath, 'config', '--unset', 'extensions.relativeWorktrees'],
    stdout: 'null',
    stderr: 'null',
  })
  await cmd.output()
  console.log(`post-switch: done (${worktreePath})`)
}

if (import.meta.main) {
  const p = Deno.args[0]
  if (!p) {
    console.error('worktree_path required')
    Deno.exit(1)
  }
  await postSwitch(p!)
}
