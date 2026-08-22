/**
 * Whether a set of local refs contains remote `main`.
 *
 * Local `main` is not an input — it can lag. The only trunk that counts is
 * the tip `ls-remote` reported. A branch that does not contain that tip is
 * behind, and a push of it reviews and CIs a stale base.
 *
 * Scripts use ArkType. Discriminate with `.allows` / fail closed with `.assert`.
 */
import { type } from 'arktype'

export const CommitSha = type('/^[0-9a-f]{40}([0-9a-f]{24})?$/#CommitSha')
export type CommitSha = typeof CommitSha.infer

export const RefName = type('/^\\S+$/#RefName')
export type RefName = typeof RefName.infer

export const ZeroSha = type('/^0+$/')

export const Delete = type({ kind: "'Delete'" })
export const Ignore = type({ kind: "'Ignore'" })
export const Contains = type({ kind: "'Contains'", name: RefName, sha: CommitSha })
export const Behind = type({ kind: "'Behind'", name: RefName, sha: CommitSha })
export const RefCheck = Delete.or(Ignore).or(Contains).or(Behind)
export type RefCheck = typeof RefCheck.infer

export const NoRemoteMain = type({ kind: "'NoRemoteMain'" })
export const RemoteMain = type({
  kind: "'RemoteMain'",
  sha: CommitSha,
  refs: RefCheck.array(),
})
export const Check = NoRemoteMain.or(RemoteMain)
export type Check = typeof Check.infer

export const AllowNoRemoteMain = type({ kind: "'AllowNoRemoteMain'" })
export const AllowContainsRemoteMain = type({ kind: "'AllowContainsRemoteMain'" })
export const RefuseBehindRemoteMain = type({
  kind: "'RefuseBehindRemoteMain'",
  sha: CommitSha,
  offenders: Behind.array().atLeastLength(1),
})
export const Verdict = AllowNoRemoteMain.or(AllowContainsRemoteMain).or(RefuseBehindRemoteMain)
export type Verdict = typeof Verdict.infer

export const Update = type({ kind: "'Update'", name: RefName, sha: CommitSha })
export const PushUpdate = Delete.or(Ignore).or(Update)
export type PushUpdate = typeof PushUpdate.infer

export const DecodeFailure = type({ kind: "'DecodeFailure'", detail: 'string' })
export type DecodeFailure = typeof DecodeFailure.infer

export type GateOutput = {
  readonly code: 0 | 1
  readonly lines: readonly string[]
}

const fail = (detail: string): DecodeFailure => DecodeFailure.assert({ kind: 'DecodeFailure', detail })

export const decodeLsRemote = (stdout: string): typeof Check.infer | DecodeFailure => {
  const line = stdout.trim()
  if (line.length === 0) return NoRemoteMain.assert({ kind: 'NoRemoteMain' })
  const shaRaw = line.split(/[\t ]/)[0] ?? ''
  if (!CommitSha.allows(shaRaw)) return fail('malformed ls-remote')
  return RemoteMain.assert({ kind: 'RemoteMain', sha: CommitSha.assert(shaRaw), refs: [] })
}

export const decodePushLine = (raw: string): PushUpdate | DecodeFailure => {
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

export const decodePushStdin = (stdin: string): readonly PushUpdate[] | DecodeFailure => {
  const decoded: PushUpdate[] = []
  for (const line of stdin.split('\n').map((row) => row.trim()).filter((row) => row.length > 0)) {
    const one = decodePushLine(line)
    if (DecodeFailure.allows(one)) return one
    decoded.push(one)
  }
  return decoded
}

export const withRefs = (check: typeof RemoteMain.infer, refs: readonly RefCheck[]): Check =>
  RemoteMain.assert({ kind: 'RemoteMain', sha: check.sha, refs: [...refs] })

export const decide = (check: Check): Verdict => {
  if (NoRemoteMain.allows(check)) return AllowNoRemoteMain.assert({ kind: 'AllowNoRemoteMain' })
  const offenders = check.refs.filter((ref: RefCheck): ref is typeof Behind.infer => Behind.allows(ref))
  if (offenders.length === 0) return AllowContainsRemoteMain.assert({ kind: 'AllowContainsRemoteMain' })
  return RefuseBehindRemoteMain.assert({
    kind: 'RefuseBehindRemoteMain',
    sha: check.sha,
    offenders,
  })
}

export const shape = (verdict: Verdict): GateOutput => {
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

export const refuseQuery = (remote: string, detail: string): GateOutput => ({
  code: 1,
  lines: [`pre-push: could not query ${remote} main — ${detail}`],
})

export const refuseFetch = (remote: string, detail: string): GateOutput => ({
  code: 1,
  lines: [`pre-push: could not fetch ${remote} main — ${detail}`],
})

export const refuseDecode = (failure: DecodeFailure): GateOutput => ({
  code: 1,
  lines: [`pre-push: ${failure.detail}`],
})
