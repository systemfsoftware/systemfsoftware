#!/usr/bin/env -S deno run --allow-run=git --allow-read --allow-write=/tmp --allow-env
/**
 * Pre-push gate: refuse when a pushed branch ref does not contain remote `main`.
 *
 * The mistake: a branch that lagged origin/main is pushed, so review and CI
 * run on a stale base. Local `main` is not consulted — it can lag too.
 *
 * `--selftest` proves the decision and a real-git sandwich. Git spawn count
 * must be non-zero or the composition path is a silent pass.
 */
import {
  AllowContainsRemoteMain,
  AllowNoRemoteMain,
  Behind,
  CommitSha,
  Contains,
  decide,
  DecodeFailure,
  decodeLsRemote,
  decodePushStdin,
  Delete,
  type GateOutput,
  Ignore,
  NoRemoteMain,
  type PushUpdate,
  type RefCheck,
  RefName,
  RefuseBehindRemoteMain,
  refuseDecode,
  refuseFetch,
  refuseQuery,
  RemoteMain,
  shape,
  Update,
  withRefs,
} from './remote-main-up-to-date.ts'

type Check = typeof RemoteMain.infer | typeof NoRemoteMain.infer

const dec = new TextDecoder()

type GitResult = { readonly success: boolean; readonly stdout: string; readonly stderr: string }

const gitAt = (cwd: string, tally?: { n: number }) => async (args: readonly string[]): Promise<GitResult> => {
  if (tally !== undefined) tally.n += 1
  const out = await new Deno.Command('git', {
    args: [...args],
    cwd,
    env: Deno.env.toObject(),
    stdout: 'piped',
    stderr: 'piped',
  }).output()
  return { success: out.success, stdout: dec.decode(out.stdout), stderr: dec.decode(out.stderr) }
}

const firstRemote = (stdout: string, pushRemote: string | undefined): string => {
  const names = stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
  if (names.includes('origin')) return 'origin'
  if (pushRemote !== undefined && pushRemote.length > 0) return pushRemote
  return names[0] ?? 'origin'
}

const ensureObject = async (
  git: (args: readonly string[]) => Promise<GitResult>,
  remote: string,
  sha: CommitSha,
): Promise<GateOutput | null> => {
  const has = await git(['cat-file', '-e', `${sha}^{commit}`])
  if (has.success) return null
  const bySha = await git(['fetch', '--quiet', remote, sha])
  if (bySha.success) return null
  const byRef = await git(['fetch', '--quiet', remote, 'refs/heads/main'])
  if (byRef.success) return null
  return refuseFetch(remote, (byRef.stderr || bySha.stderr).trim() || 'fetch failed')
}

const asRefCheck = async (
  git: (args: readonly string[]) => Promise<GitResult>,
  mainSha: typeof CommitSha.infer,
  update: PushUpdate,
): Promise<RefCheck> => {
  if (Delete.allows(update)) return Delete.assert({ kind: 'Delete' })
  if (Ignore.allows(update)) return Ignore.assert({ kind: 'Ignore' })
  const ancestor = await git(['merge-base', '--is-ancestor', mainSha, update.sha])
  return ancestor.success
    ? Contains.assert({ kind: 'Contains', name: update.name, sha: update.sha })
    : Behind.assert({ kind: 'Behind', name: update.name, sha: update.sha })
}

const headUpdate = async (
  git: (args: readonly string[]) => Promise<GitResult>,
): Promise<typeof Update.infer | DecodeFailure> => {
  const nameOut = await git(['rev-parse', '--abbrev-ref', 'HEAD'])
  const shaOut = await git(['rev-parse', 'HEAD'])
  const nameRaw = nameOut.stdout.trim()
  const shaRaw = shaOut.stdout.trim()
  if (!RefName.allows(nameRaw)) return DecodeFailure.assert({ kind: 'DecodeFailure', detail: 'not a ref' })
  if (!CommitSha.allows(shaRaw)) return DecodeFailure.assert({ kind: 'DecodeFailure', detail: 'not a sha' })
  return Update.assert({
    kind: 'Update',
    name: RefName.assert(nameRaw),
    sha: CommitSha.assert(shaRaw),
  })
}

export const run = async (
  git: (args: readonly string[]) => Promise<GitResult>,
  pushRemote: string | undefined,
  stdin: string,
): Promise<GateOutput> => {
  const remotes = await git(['remote'])
  const remote = firstRemote(remotes.stdout, pushRemote)
  const ls = await git(['ls-remote', remote, 'refs/heads/main'])
  if (!ls.success) return refuseQuery(remote, ls.stderr.trim() || 'ls-remote failed')

  const listed = decodeLsRemote(ls.stdout)
  if (DecodeFailure.allows(listed)) return refuseDecode(listed)
  if (NoRemoteMain.allows(listed)) return shape(decide(listed))

  const missing = await ensureObject(git, remote, listed.sha)
  if (missing !== null) return missing

  const parsed = decodePushStdin(stdin)
  if (DecodeFailure.allows(parsed)) return refuseDecode(parsed)

  const updates: PushUpdate[] = [...parsed]
  if (updates.length === 0) {
    const head = await headUpdate(git)
    if (DecodeFailure.allows(head)) return refuseDecode(head)
    updates.push(head)
  }

  const refs: RefCheck[] = []
  for (const update of updates) {
    refs.push(await asRefCheck(git, listed.sha, update))
  }
  return shape(decide(withRefs(listed, refs)))
}

const writeGate = (output: GateOutput): number => {
  for (const line of output.lines) console.error(line)
  return output.code
}

const ALL_ZERO = '0000000000000000000000000000000000000000'
const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const decideHolds = (check: Check): boolean => {
  const verdict = decide(check)
  if (NoRemoteMain.allows(check)) return AllowNoRemoteMain.allows(verdict)
  const behind = check.refs.filter((ref: RefCheck): ref is typeof Behind.infer => Behind.allows(ref))
  if (behind.length === 0) return AllowContainsRemoteMain.allows(verdict)
  return RefuseBehindRemoteMain.allows(verdict) &&
    verdict.offenders.length === behind.length &&
    verdict.sha === check.sha
}

const refKinds = ['Delete', 'Ignore', 'Contains', 'Behind'] as const

const allChecks = (): readonly Check[] => {
  const sha = CommitSha.assert(SHA_A)
  const name = RefName.assert('refs/heads/feat')
  const kinds: RefCheck[][] = [[]]
  for (const kind of refKinds) {
    const next: RefCheck[][] = []
    for (const prefix of kinds) {
      next.push(prefix)
      next.push([
        ...prefix,
        kind === 'Delete' || kind === 'Ignore'
          ? { kind }
          : { kind, name, sha: CommitSha.assert(SHA_B) },
      ])
    }
    kinds.splice(0, kinds.length, ...next)
  }
  return [
    NoRemoteMain.assert({ kind: 'NoRemoteMain' }),
    ...kinds.map((refs) => RemoteMain.assert({ kind: 'RemoteMain', sha, refs })),
  ]
}

const gitIn = (cwd: string, args: readonly string[]): Promise<GitResult> => gitAt(cwd)(args)

const requireOk = (result: GitResult, step: string): void => {
  if (!result.success) throw new Error(`${step}: ${result.stderr.trim()}`)
}

const configIdentity = async (dir: string): Promise<void> => {
  requireOk(await gitIn(dir, ['config', 'user.email', 'hook@example.test']), 'email')
  requireOk(await gitIn(dir, ['config', 'user.name', 'hook']), 'name')
  requireOk(await gitIn(dir, ['config', 'commit.gpgsign', 'false']), 'gpgsign')
}

const composition = async (): Promise<boolean> => {
  const root = await Deno.makeTempDir({ dir: '/tmp', prefix: 'prepush-main-' })
  const tally = { n: 0 }
  try {
    const bare = `${root}/remote.git`
    const ahead = `${root}/ahead`
    const behind = `${root}/behind`
    requireOk(await gitIn(root, ['init', '--bare', '-b', 'main', bare]), 'bare')
    requireOk(await gitIn(root, ['clone', bare, ahead]), 'clone-ahead')
    await configIdentity(ahead)
    await Deno.writeTextFile(`${ahead}/base`, 'base')
    requireOk(await gitIn(ahead, ['add', 'base']), 'add-base')
    requireOk(await gitIn(ahead, ['commit', '-m', 'base']), 'commit-base')
    requireOk(await gitIn(ahead, ['push', 'origin', 'main']), 'push-base')
    requireOk(await gitIn(root, ['clone', bare, behind]), 'clone-behind')
    await configIdentity(behind)
    requireOk(await gitIn(behind, ['checkout', '-b', 'feat']), 'branch')
    await Deno.writeTextFile(`${behind}/feat`, 'feat')
    requireOk(await gitIn(behind, ['add', 'feat']), 'add-feat')
    requireOk(await gitIn(behind, ['commit', '-m', 'feat']), 'commit-feat')

    const current = await run(gitAt(behind, tally), 'origin', '')
    if (current.code !== 0) return false

    await Deno.writeTextFile(`${ahead}/trunk`, 'trunk')
    requireOk(await gitIn(ahead, ['add', 'trunk']), 'add-trunk')
    requireOk(await gitIn(ahead, ['commit', '-m', 'trunk']), 'commit-trunk')
    requireOk(await gitIn(ahead, ['push', 'origin', 'main']), 'push-trunk')

    const stale = await run(gitAt(behind, tally), 'origin', '')
    if (stale.code !== 1) return false
    const tagOnly = await run(
      gitAt(behind, tally),
      'origin',
      `refs/tags/v0 ${SHA_A} refs/tags/v0 ${ALL_ZERO}`,
    )
    if (tagOnly.code !== 0) return false

    requireOk(await gitIn(behind, ['fetch', 'origin', 'main']), 'fetch-main')
    requireOk(await gitIn(behind, ['rebase', 'origin/main']), 'rebase')
    const rebased = await run(gitAt(behind, tally), 'origin', '')
    if (rebased.code !== 0) return false

    const deleted = await run(
      gitAt(behind, tally),
      'origin',
      `refs/heads/gone ${ALL_ZERO} refs/heads/gone ${SHA_A}`,
    )
    return deleted.code === 0 && tally.n >= 8
  } finally {
    await Deno.remove(root, { recursive: true }).catch(() => {})
  }
}

const selftest = async (): Promise<number> => {
  const failed = allChecks().filter((check) => !decideHolds(check))
  if (failed.length > 0) {
    console.error(`decide: ${failed.length} check(s) broke the refuse-iff-behind invariant`)
    return 1
  }
  const lsEmpty = decodeLsRemote('')
  if (!NoRemoteMain.allows(lsEmpty)) {
    console.error('decode: empty ls-remote is not NoRemoteMain')
    return 1
  }
  const pushDelete = decodePushStdin(`refs/heads/gone ${ALL_ZERO} refs/heads/gone ${ALL_ZERO}`)
  if (DecodeFailure.allows(pushDelete) || !Delete.allows(pushDelete[0])) {
    console.error('decode: delete line failed')
    return 1
  }
  if (!await composition()) {
    console.error('composition: real-git sandwich failed or spawned too few git processes')
    return 1
  }
  return 0
}

const readStdin = async (): Promise<string> => {
  if (Deno.stdin.isTerminal()) return ''
  return new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer())
}

try {
  Deno.exitCode = Deno.args.includes('--selftest')
    ? await selftest()
    : writeGate(await run(gitAt(Deno.cwd()), Deno.args[0], await readStdin()))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  Deno.exitCode = 1
}
