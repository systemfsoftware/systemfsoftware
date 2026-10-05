// snapshot-plan.ts — the snapshot release's decisions, alone.
//
// A module, never an entry point. Every function here is pure: plain data in,
// plain data out, no registry, git or filesystem. `snapshot.ts` is the shell
// that reads those and calls in.
//
// The set is the packages a PR's snapshot must publish so a starter branch can
// pin them as one consistent unit: every package with a pending releasing
// intent or a version npm does not serve, plus everything that depends on one
// at run time. Members are versioned `0.0.0-snapshot-<sha>` and every
// specifier between members is pinned exactly — `workspace:^` would pack to
// `^0.0.0-snapshot-<sha>`, a range other PRs' snapshots satisfy.

export type Manifest = {
  readonly name: string
  readonly version: string
  readonly private?: boolean
  readonly dependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly optionalDependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
}

export type Exclusion = { readonly name: string; readonly reason: string }

export type SetDecision =
  | { readonly kind: 'planned'; readonly members: readonly string[]; readonly exclusions: readonly Exclusion[] }
  | { readonly kind: 'refused'; readonly reason: string }

export type PlanMember = { readonly name: string; readonly version: string; readonly dir: string }

export type SnapshotPlan = {
  readonly sha: string
  readonly headSha: string
  readonly pr: number
  readonly distTag: string
  readonly members: readonly PlanMember[]
  readonly exclusions: readonly Exclusion[]
}

/** Runtime sections: the ones a consumer's install resolves. devDependencies never ship as a constraint. */
export const RUNTIME_SECTIONS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const
const ALL_SECTIONS = [...RUNTIME_SECTIONS, 'devDependencies'] as const

/** Published only by its own platform matrix; a snapshot launcher would pin platform packages that do not exist. */
export const EXCLUDED: Readonly<Record<string, string>> = {
  '@systemfsoftware/gritlint': 'platform binaries come from the release matrix; excluded from snapshots by ruling',
}

const runtimeDeps = (m: Manifest): readonly string[] =>
  RUNTIME_SECTIONS.flatMap((section) => Object.keys(m[section] ?? {}))

const SHA = /^[0-9a-f]{40}$/

export const snapshotVersion = (sha: string): string => {
  if (!SHA.test(sha)) throw new Error(`not a 40-hex commit sha: ${JSON.stringify(sha)}`)
  return `0.0.0-snapshot-${sha}`
}

export const distTag = (pr: number): string => {
  if (!Number.isInteger(pr) || pr <= 0) throw new Error(`not a pull request number: ${pr}`)
  return `pr-${pr}`
}

/** Public packages that depend at run time on any of `names`, transitively, including `names`. */
const closeOverDependents = (publics: readonly Manifest[], names: ReadonlySet<string>): Set<string> => {
  const closed = new Set(names)
  let grew = true
  while (grew) {
    const added = publics.filter((m) => !closed.has(m.name) && runtimeDeps(m).some((d) => closed.has(d)))
    for (const m of added) closed.add(m.name)
    grew = added.length > 0
  }
  return closed
}

/**
 * Dependencies before dependents; ties and cycle members in name order. A
 * cycle cannot be ordered, so its members keep a stable order rather than
 * failing the run.
 */
export const publishOrder = (manifests: readonly Manifest[]): string[] => {
  const names = new Set(manifests.map((m) => m.name))
  const deps = new Map(
    manifests.map((m) => [m.name, new Set(runtimeDeps(m).filter((d) => names.has(d) && d !== m.name))]),
  )
  const order: string[] = []
  const placed = new Set<string>()
  const sorted = [...names].sort()
  while (placed.size < names.size) {
    const ready = sorted.filter((n) => !placed.has(n) && [...deps.get(n)!].every((d) => placed.has(d)))
    const next = ready.length > 0 ? ready : sorted.filter((n) => !placed.has(n)).slice(0, 1)
    for (const n of next) {
      order.push(n)
      placed.add(n)
    }
  }
  return order
}

/**
 * The snapshot set. `seeds` are packages with a pending non-`none` bump or an
 * owed version. Private packages never join; an excluded seed is reported and
 * left out, and a public dependent of one refuses the plan — it would pin a
 * version of the excluded package that does not exist.
 */
export const planSet = (manifests: readonly Manifest[], seeds: ReadonlySet<string>): SetDecision => {
  const publics = manifests.filter((m) => m.private !== true)
  const publicNames = new Set(publics.map((m) => m.name))
  const exclusions = [...seeds].filter((s) => Object.hasOwn(EXCLUDED, s)).sort().map((name) => ({
    name,
    reason: EXCLUDED[name],
  }))
  const excludedSeeds = new Set(exclusions.map((e) => e.name))
  const strandedBy = [...excludedSeeds].flatMap((x) =>
    publics.filter((m) => runtimeDeps(m).includes(x)).map((m) => `${m.name} depends on ${x}`)
  )
  if (strandedBy.length > 0) {
    return { kind: 'refused', reason: `excluded package changed under a dependent: ${strandedBy.join('; ')}` }
  }
  const kept = new Set([...seeds].filter((s) => publicNames.has(s) && !excludedSeeds.has(s)))
  const closed = closeOverDependents(publics, kept)
  return {
    kind: 'planned',
    members: publishOrder(publics.filter((m) => closed.has(m.name))),
    exclusions,
  }
}

/** The manifest as it must pack: members carry `version`, and every specifier to a member is that exact version. */
export const stampManifest = <M extends Manifest>(manifest: M, versions: ReadonlyMap<string, string>): M => {
  const pinned = (section: Readonly<Record<string, string>> | undefined) =>
    section === undefined
      ? undefined
      : Object.fromEntries(Object.entries(section).map(([dep, spec]) => [dep, versions.get(dep) ?? spec]))
  const sections = Object.fromEntries(
    ALL_SECTIONS.filter((s) => manifest[s] !== undefined).map((s) => [s, pinned(manifest[s])]),
  )
  return { ...manifest, ...sections, version: versions.get(manifest.name) ?? manifest.version }
}

/** Every reason the packed tarballs disagree with the plan; empty means they match. */
export const verifyTarballs = (plan: SnapshotPlan, packed: readonly Manifest[]): string[] => {
  const wanted = new Map(plan.members.map((m) => [m.name, m.version]))
  const seen = packed.map((m) => m.name)
  const problems: string[] = [
    ...plan.members.filter((m) => !seen.includes(m.name)).map((m) => `missing tarball for ${m.name}`),
    ...seen.filter((n) => !wanted.has(n)).map((n) => `tarball ${n} is not in the plan`),
    ...seen.filter((n, i) => seen.indexOf(n) !== i).map((n) => `more than one tarball for ${n}`),
  ]
  for (const m of packed.filter((p) => wanted.has(p.name))) {
    if (m.version !== wanted.get(m.name)) {
      problems.push(`${m.name} packed ${m.version}, plan says ${wanted.get(m.name)}`)
    }
    for (const section of ALL_SECTIONS) {
      for (const [dep, spec] of Object.entries(m[section] ?? {})) {
        if (/^(workspace|catalog):/.test(spec)) problems.push(`${m.name} ${section}.${dep} kept ${spec}`)
        const isRuntime = (RUNTIME_SECTIONS as readonly string[]).includes(section)
        if (isRuntime && wanted.has(dep) && spec !== wanted.get(dep)) {
          problems.push(`${m.name} ${section}.${dep} is ${spec}, not exactly ${wanted.get(dep)}`)
        }
      }
    }
  }
  return problems
}

export type Registration = 'served' | 'never-published' | 'unreadable'

/** The never-published preflight: nothing uploads unless npm already knows every name. */
export const preflight = (
  registrations: readonly { readonly name: string; readonly status: Registration }[],
): { readonly kind: 'clear' } | { readonly kind: 'blocked'; readonly reason: string } => {
  const of = (s: Registration) => registrations.filter((r) => r.status === s).map((r) => r.name)
  const unreadable = of('unreadable')
  const fresh = of('never-published')
  if (unreadable.length > 0) {
    return { kind: 'blocked', reason: `registry unreadable for ${unreadable.join(', ')}; nothing was published` }
  }
  if (fresh.length > 0) {
    const debuts = fresh.map((n) => `  pnpm publish:unpublished --only ${n} --tag <pr-tag>`).join('\n')
    return {
      kind: 'blocked',
      reason: `OIDC cannot debut a package; npm has never served ${
        fresh.join(', ')
      }. A maintainer debuts each first:\n${debuts}\nNothing was published.`,
    }
  }
  return { kind: 'clear' }
}

/** The pins a starter branch adopts: exact manifest entries and exact release-age exclusions. */
export const pinBlock = (members: readonly PlanMember[]): string => {
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name))
  return [
    'package.json:',
    ...sorted.map((m) => `  "${m.name}": "${m.version}",`),
    '',
    'pnpm-workspace.yaml minimumReleaseAgeExclude:',
    ...sorted.map((m) => `  - "${m.name}@${m.version}"`),
  ].join('\n')
}

/** One property of an untrusted value, or undefined when the value has none. */
const field = (value: unknown, key: string): unknown =>
  value !== null && typeof value === 'object' && key in value ? Reflect.get(value, key) : undefined

/** The named string fields of an untrusted value, or null when any is missing or not a string. */
const strings = <K extends string>(value: unknown, keys: readonly K[]): Record<K, string> | null => {
  const read = keys.map((k) => [k, field(value, k)] as const)
  // Every entry was just checked to be a string, which is what the record type says.
  const checked = Object.fromEntries(read) as Record<K, string>
  return read.every(([, v]) => typeof v === 'string') ? checked : null
}

const present = <T>(v: T | null): v is T => v !== null

/**
 * `plan.json` as data, or why it is not a plan. Every field is read and
 * type-checked, because the file crosses from a job running PR code. A hand
 * decoder, not arktype: the publish path imports no npm package.
 */
export const decodePlan = (raw: unknown): SnapshotPlan | string => {
  const head = strings(raw, ['sha', 'headSha', 'distTag'])
  const pr = field(raw, 'pr')
  if (head === null || typeof pr !== 'number') return 'plan sha, headSha, distTag or pr has the wrong type'
  const rawMembers = field(raw, 'members')
  const rawExclusions = field(raw, 'exclusions')
  if (!Array.isArray(rawMembers) || !Array.isArray(rawExclusions)) return 'plan members or exclusions is not an array'
  const members = rawMembers.map((m) => strings(m, ['name', 'version', 'dir'])).filter(present)
  const exclusions = rawExclusions.map((e) => strings(e, ['name', 'reason'])).filter(present)
  if (members.length !== rawMembers.length || exclusions.length !== rawExclusions.length) {
    return 'plan has a malformed member or exclusion'
  }
  if (new Set(members.map((m) => m.name)).size !== members.length) return 'plan names a member twice'
  return { ...head, pr, members, exclusions }
}

/**
 * The OIDC job's refusal of a plan it did not compute. `plan.json` comes from
 * a job that runs pull request code, so every field that steers a publish is
 * checked against values the publishing job derives itself: the dist-tag and
 * version from the event context, the member names from the default branch's
 * own workspace. Empty means admitted.
 */
export const admitPlan = (
  plan: SnapshotPlan,
  trusted: { readonly pr: number; readonly sha: string; readonly workspace: ReadonlySet<string> },
): string[] => {
  const tag = distTag(trusted.pr)
  const version = snapshotVersion(trusted.sha)
  return [
    ...(plan.distTag === tag ? [] : [`plan dist-tag ${JSON.stringify(plan.distTag)} is not ${tag}`]),
    ...(plan.sha === trusted.sha ? [] : [`plan sha ${JSON.stringify(plan.sha)} is not ${trusted.sha}`]),
    ...(plan.pr === trusted.pr ? [] : [`plan pr ${JSON.stringify(plan.pr)} is not ${trusted.pr}`]),
    ...plan.members.filter((m) => m.version !== version).map((m) =>
      `${m.name} has version ${m.version}, not ${version}`
    ),
    ...plan.members.filter((m) => !trusted.workspace.has(m.name)).map((m) =>
      `${m.name} is not a public package of the default branch's workspace`
    ),
    ...plan.members.filter((m) => Object.hasOwn(EXCLUDED, m.name)).map((m) => `${m.name} is excluded from snapshots`),
  ]
}

/** Names whose dist-tags body (`GET /-/package/<name>/dist-tags`, null on 404) maps `tag` to a version. */
export const taggedPackages = (distTagsByName: ReadonlyMap<string, unknown>, tag: string): string[] =>
  [...distTagsByName].filter(([, tags]) => typeof field(tags, tag) === 'string').map(([n]) => n).sort()

/**
 * Package names from npm's org listing (`GET /-/org/<org>/package`, a
 * name → access map served without auth). The search API is not used: its
 * index lags a fresh debut, which is the package this listing exists to find.
 */
export const orgPackageNames = (listing: unknown, scope: string): string[] | null =>
  listing === null || typeof listing !== 'object' || Array.isArray(listing)
    ? null
    : Object.keys(listing).filter((n) => n.startsWith(`${scope}/`)).sort()

export type MemberOutcome =
  | { readonly name: string; readonly version: string; readonly kind: 'accepted' | 'held' }
  | { readonly name: string; readonly version: string; readonly kind: 'failed'; readonly error: string }

/** The job summary: pins only for versions npm now serves, failures listed apart with their error. */
export const publishSummary = (plan: SnapshotPlan, outcomes: readonly MemberOutcome[]): string => {
  const served = outcomes.filter((o) => o.kind !== 'failed')
  const failed = outcomes.flatMap((o) => (o.kind === 'failed' ? [o] : []))
  const exclusions = plan.exclusions.map((e) => `- excluded \`${e.name}\`: ${e.reason}`)
  return [
    `## Snapshot \`${plan.distTag}\``,
    '',
    `Built at \`${plan.sha}\` (PR head \`${plan.headSha}\`).`,
    ...(exclusions.length > 0 ? ['', ...exclusions] : []),
    ...(served.length > 0
      ? ['', '```text', pinBlock(served.map((o) => ({ name: o.name, version: o.version, dir: '' }))), '```']
      : []),
    ...(failed.length > 0
      ? [
        '',
        '### Not published',
        '',
        ...failed.flatMap((f) => [`- \`${f.name}@${f.version}\`:`, '', '```text', f.error, '```']),
      ]
      : []),
    '',
  ].join('\n')
}
