#!/usr/bin/env -S deno run --allow-run=git --allow-read=.,/tmp --allow-write=/tmp
/**
 * Pre-push gate: refuse when a pushed branch ref does not contain remote `main`.
 *
 * Local `main` is not consulted — it can lag. Query the remote tip; require
 * it to be an ancestor of each refs/heads/* SHA. Tags and deletes are ignored.
 * A failed query refuses.
 *
 * Permissions: git only; read cwd (the repo) and /tmp (test trees); write
 * /tmp for tests. No --allow-env (git inherits). No --allow-net (git speaks).
 */
import { type } from 'arktype'

declare global {
  interface ImportMeta {
    readonly vitest?: {
      readonly it: (name: string, fn: () => void | Promise<void>) => void
      readonly expect: (actual: unknown) => { readonly toBe: (expected: unknown) => void }
    }
  }
}
const CommitSha = type('/^[0-9a-f]{40}([0-9a-f]{24})?$/#CommitSha')
const RefName = type('/^\\S+$/#RefName')
const ZeroSha = type('/^0+$/')

const Delete = type({ kind: "'Delete'" })
const Ignore = type({ kind: "'Ignore'" })
const Contains = type({ kind: "'Contains'", name: RefName, sha: CommitSha })
const Behind = type({ kind: "'Behind'", name: RefName, sha: CommitSha })
const RefCheck = Delete.or(Ignore).or(Contains).or(Behind)
type RefCheck = typeof RefCheck.infer

const NoRemoteMain = type({ kind: "'NoRemoteMain'" })
const RemoteMain = type({
  kind: "'RemoteMain'",
  sha: CommitSha,
  refs: RefCheck.array(),
})
const Check = NoRemoteMain.or(RemoteMain)
type Check = typeof Check.infer

const AllowNoRemoteMain = type({ kind: "'AllowNoRemoteMain'" })
const AllowContainsRemoteMain = type({ kind: "'AllowContainsRemoteMain'" })
const RefuseBehindRemoteMain = type({
  kind: "'RefuseBehindRemoteMain'",
  sha: CommitSha,
  offenders: Behind.array().atLeastLength(1),
})
const Verdict = AllowNoRemoteMain.or(AllowContainsRemoteMain).or(RefuseBehindRemoteMain)
type Verdict = typeof Verdict.infer

const Update = type({ kind: "'Update'", name: RefName, sha: CommitSha })
const PushUpdate = Delete.or(Ignore).or(Update)
type PushUpdate = typeof PushUpdate.infer

const DecodeFailure = type({ kind: "'DecodeFailure'", detail: 'string' })
type DecodeFailure = typeof DecodeFailure.infer

type GateOutput = {
  readonly code: 0 | 1
  readonly lines: readonly string[]
}

const fail = (detail: string): DecodeFailure => DecodeFailure.assert({ kind: 'DecodeFailure', detail })

const decodeLsRemote = (stdout: string): Check | DecodeFailure => {
  const line = stdout.trim()
  if (line.length === 0) return NoRemoteMain.assert({ kind: 'NoRemoteMain' })
  const shaRaw = line.split(/[\t ]/)[0] ?? ''
  if (!CommitSha.allows(shaRaw)) return fail('malformed ls-remote')
  return RemoteMain.assert({ kind: 'RemoteMain', sha: CommitSha.assert(shaRaw), refs: [] })
}

const decodePushLine = (raw: string): PushUpdate | DecodeFailure => {
  const fields = raw.trim().split(/[ \t]+/)
  if (fields.length < 4) return fail('malformed push line')
  const localRef = fields[0] ?? ''
  const localSha = fields[1] ?? ''
  if (ZeroSha.allows(localSha)) return Delete.assert({ kind: 'Delete' })
  if (!localRef.startsWith('refs/heads/')) return Ignore.assert({ kind: 'Ignore' })
  if (!RefName.allows(localRef)) return fail('not a ref')
  if (!CommitSha.allows(localSha)) return fail('not a sha')
  return Update.assert({
    kind: 'Update',
    name: RefName.assert(localRef),
    sha: CommitSha.assert(localSha),
  })
}

const decodePushStdin = (stdin: string): readonly PushUpdate[] | DecodeFailure => {
  const decoded: PushUpdate[] = []
  for (const line of stdin.split('\n').map((row) => row.trim()).filter((row) => row.length > 0)) {
    const one = decodePushLine(line)
    if (DecodeFailure.allows(one)) return one
    decoded.push(one)
  }
  return decoded
}

const decide = (check: Check): Verdict => {
  if (NoRemoteMain.allows(check)) return AllowNoRemoteMain.assert({ kind: 'AllowNoRemoteMain' })
  const offenders = check.refs.filter((ref: RefCheck): ref is typeof Behind.infer => Behind.allows(ref))
  if (offenders.length === 0) return AllowContainsRemoteMain.assert({ kind: 'AllowContainsRemoteMain' })
  return RefuseBehindRemoteMain.assert({
    kind: 'RefuseBehindRemoteMain',
    sha: check.sha,
    offenders,
  })
}

const shape = (verdict: Verdict): GateOutput => {
  if (!RefuseBehindRemoteMain.allows(verdict)) return { code: 0, lines: [] }
  return {
    code: 1,
    lines: [
      `pre-push: behind remote main (${verdict.sha}).`,
      ...verdict.offenders.map((ref: typeof Behind.infer) => `  ${ref.name} ${ref.sha}`),
      'Fetch and rebase onto remote main before pushing.',
    ],
  }
}

const refuseQuery = (remote: string, detail: string): GateOutput => ({
  code: 1,
  lines: [`pre-push: could not query ${remote} main — ${detail}`],
})

const refuseFetch = (remote: string, detail: string): GateOutput => ({
  code: 1,
  lines: [`pre-push: could not fetch ${remote} main — ${detail}`],
})

const refuseDecode = (failure: DecodeFailure): GateOutput => ({
  code: 1,
  lines: [`pre-push: ${failure.detail}`],
})

const dec = new TextDecoder()

type GitResult = { readonly success: boolean; readonly stdout: string; readonly stderr: string }

const gitAt = (cwd: string, tally?: { n: number }) => async (args: readonly string[]): Promise<GitResult> => {
  if (tally !== undefined) tally.n += 1
  const out = await new Deno.Command('git', {
    args: [...args],
    cwd,
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
  sha: typeof CommitSha.infer,
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
  if (!RefName.allows(nameRaw)) return fail('not a ref')
  if (!CommitSha.allows(shaRaw)) return fail('not a sha')
  return Update.assert({
    kind: 'Update',
    name: RefName.assert(nameRaw),
    sha: CommitSha.assert(shaRaw),
  })
}

const run = async (
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
  return shape(decide(RemoteMain.assert({ kind: 'RemoteMain', sha: listed.sha, refs })))
}
const readStdin = async (): Promise<string> => {
  if (Deno.stdin.isTerminal()) return ''
  return new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer())
}
if (import.meta.main) {
  try {
    const output = await run(gitAt(Deno.cwd()), Deno.args[0], await readStdin())
    for (const line of output.lines) console.error(line)
    Deno.exitCode = output.code
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    Deno.exitCode = 1
  }
}

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest

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

  it('decide refuses iff a Behind ref exists', () => {
    for (const check of allChecks()) {
      expect(decideHolds(check)).toBe(true)
    }
  })

  it('empty ls-remote is NoRemoteMain', () => {
    expect(NoRemoteMain.allows(decodeLsRemote(''))).toBe(true)
  })

  it('zero SHA push line is Delete', () => {
    const decoded = decodePushStdin(`refs/heads/gone ${ALL_ZERO} refs/heads/gone ${ALL_ZERO}`)
    if (DecodeFailure.allows(decoded)) throw new Error(decoded.detail)
    expect(Delete.allows(decoded[0])).toBe(true)
  })

  it('current allows, stale refuses, tag allows, rebase allows', async () => {
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

      expect((await run(gitAt(behind, tally), 'origin', '')).code).toBe(0)

      await Deno.writeTextFile(`${ahead}/trunk`, 'trunk')
      requireOk(await gitIn(ahead, ['add', 'trunk']), 'add-trunk')
      requireOk(await gitIn(ahead, ['commit', '-m', 'trunk']), 'commit-trunk')
      requireOk(await gitIn(ahead, ['push', 'origin', 'main']), 'push-trunk')

      expect((await run(gitAt(behind, tally), 'origin', '')).code).toBe(1)
      expect(
        (await run(
          gitAt(behind, tally),
          'origin',
          `refs/tags/v0 ${SHA_A} refs/tags/v0 ${ALL_ZERO}`,
        )).code,
      ).toBe(0)

      requireOk(await gitIn(behind, ['fetch', 'origin', 'main']), 'fetch-main')
      requireOk(await gitIn(behind, ['rebase', 'origin/main']), 'rebase')
      expect((await run(gitAt(behind, tally), 'origin', '')).code).toBe(0)

      expect(
        (await run(
          gitAt(behind, tally),
          'origin',
          `refs/heads/gone ${ALL_ZERO} refs/heads/gone ${SHA_A}`,
        )).code,
      ).toBe(0)
      expect(tally.n >= 8).toBe(true)
    } finally {
      await Deno.remove(root, { recursive: true }).catch(() => {})
    }
  })
}
