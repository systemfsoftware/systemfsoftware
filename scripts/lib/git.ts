import { dirname, resolve } from '@std/path'

async function gitRevParse(worktreeRoot: string, arg: string): Promise<string> {
  const cmd = new Deno.Command('git', {
    args: ['rev-parse', arg],
    cwd: worktreeRoot,
    stdout: 'piped',
    stderr: 'piped',
  })
  const { code, stdout, stderr } = await cmd.output()
  if (code !== 0) {
    const msg = new TextDecoder().decode(stderr).trim()
    throw new Error(`git rev-parse ${arg} failed in ${worktreeRoot}: ${msg}`)
  }
  return new TextDecoder().decode(stdout).trim()
}

export async function getGitDir(worktreeRoot: string): Promise<string> {
  return await gitRevParse(worktreeRoot, '--git-dir')
}

export async function getGitCommonDir(worktreeRoot: string): Promise<string> {
  return await gitRevParse(worktreeRoot, '--git-common-dir')
}

/** Returns primary repo path if worktreeRoot is a worktree, else null. */
export async function resolvePrimaryRepo(worktreeRoot: string): Promise<string | null> {
  const gitDir = await getGitDir(worktreeRoot)
  const gitCommonDir = await getGitCommonDir(worktreeRoot)
  if (gitDir === gitCommonDir) return null
  const absCommon = gitCommonDir.startsWith('/')
    ? gitCommonDir
    : resolve(worktreeRoot, gitCommonDir)
  return dirname(absCommon)
}

export async function runGit(args: string[], cwd: string): Promise<{ code: number }> {
  const cmd = new Deno.Command('git', { args, cwd, stdout: 'null', stderr: 'null' })
  const { code } = await cmd.output()
  return { code }
}
