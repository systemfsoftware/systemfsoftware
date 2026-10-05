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
//
// Pure core under CONST-P2: one path per function. Choice is exhaustive
// dispatch over a closed type (`match` on a tagged union, `on` on a boolean),
// iteration is map/filter/flatMap/reduce, and closure is a bounded fixed-point
// fold. No `if`, `switch`, `?:`, `&&`, `||`, `??`, `for` or `while`. The
// dispatch is plain TypeScript, not effect's `Match`: the publish path imports
// no npm package.

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

/** A value derived from untrusted input, or why it could not be. */
export type Checked<T> = { readonly kind: 'ok'; readonly value: T } | {
  readonly kind: 'refused'
  readonly reason: string
}

type Tagged = { readonly kind: string }
type Handlers<U extends Tagged, R> = { readonly [K in U['kind']]: (u: Extract<U, { readonly kind: K }>) => R }

/** Exhaustive dispatch on a tagged union: a handler record missing a tag does not compile. */
export const match = <U extends Tagged, R>(u: U, handlers: Handlers<U, R>): R =>
  // The record is keyed by U's tags and each handler accepts its own variant,
  // so the handler selected by `u.kind` accepts `u`; TS cannot correlate the two.
  (handlers[u.kind as U['kind']] as (u: U) => R)(u)

/** Exhaustive dispatch on a boolean. */
const on = <R>(cond: boolean, handlers: { readonly true: () => R; readonly false: () => R }): R =>
  [handlers.false, handlers.true][Number(cond)]()

const onlyIf = <T>(cond: boolean, xs: () => readonly T[]): readonly T[] => on(cond, { true: xs, false: () => [] })

const all = (...conds: readonly boolean[]): boolean => conds.every(Boolean)
const any = (...conds: readonly boolean[]): boolean => conds.some(Boolean)

const isString = (v: unknown): v is string => typeof v === 'string'
const present = <T>(v: T | null): v is T => v !== null

/** The first of `xs`, or `fallback` when `xs` is empty. */
const firstOr = <T, F>(xs: readonly T[], fallback: F): T | F => [...xs, fallback][0]

/** Runtime sections: the ones a consumer's install resolves. devDependencies never ship as a constraint. */
export const RUNTIME_SECTIONS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const
const ALL_SECTIONS = [...RUNTIME_SECTIONS, 'devDependencies'] as const

/** Published only by its own platform matrix; a snapshot launcher would pin platform packages that do not exist. */
export const EXCLUDED: Readonly<Record<string, string>> = {
  '@systemfsoftware/gritlint': 'platform binaries come from the release matrix; excluded from snapshots by ruling',
}

const isExcluded = (name: string): boolean => Object.hasOwn(EXCLUDED, name)

const runtimeDeps = (m: Manifest): readonly string[] =>
  RUNTIME_SECTIONS.flatMap((section) => Object.keys({ ...m[section] }))

const SHA = /^[0-9a-f]{40}$/

export const snapshotVersion = (sha: string): Checked<string> =>
  on<Checked<string>>(SHA.test(sha), {
    true: () => ({ kind: 'ok', value: `0.0.0-snapshot-${sha}` }),
    false: () => ({ kind: 'refused', reason: `not a 40-hex commit sha: ${JSON.stringify(sha)}` }),
  })

export const distTag = (pr: number): Checked<string> =>
  on<Checked<string>>(all(Number.isInteger(pr), pr > 0), {
    true: () => ({ kind: 'ok', value: `pr-${pr}` }),
    false: () => ({ kind: 'refused', reason: `not a pull request number: ${pr}` }),
  })

const values = <T>(c: Checked<T>): readonly T[] => match(c, { ok: (x) => [x.value], refused: () => [] })
const reasons = <T>(c: Checked<T>): readonly string[] => match(c, { ok: () => [], refused: (x) => [x.reason] })

/**
 * Public packages that depend at run time on any of `names`, transitively,
 * including `names`. A fold of `publics.length` steps reaches the fixed point:
 * each step either adds a package or changes nothing.
 */
const closeOverDependents = (publics: readonly Manifest[], names: ReadonlySet<string>): ReadonlySet<string> =>
  publics.reduce<ReadonlySet<string>>(
    (closed) =>
      new Set([...closed, ...publics.filter((m) => runtimeDeps(m).some((d) => closed.has(d))).map((m) => m.name)]),
    names,
  )

/**
 * Dependencies before dependents; ties and cycle members in name order. A
 * cycle cannot be ordered, so its members keep a stable order rather than
 * failing the run. Each fold step places at least one pending name, so
 * `names.length` steps place them all.
 */
export const publishOrder = (manifests: readonly Manifest[]): string[] => {
  const names = new Set(manifests.map((m) => m.name))
  const deps = new Map(manifests.map((m) => [m.name, runtimeDeps(m).filter((d) => all(names.has(d), d !== m.name))]))
  const sorted = [...names].sort()
  return sorted.reduce<string[]>((order) => {
    const placed = new Set(order)
    const pending = sorted.filter((n) => !placed.has(n))
    const ready = pending.filter((n) => [...deps.get(n)!].every((d) => placed.has(d)))
    return [...order, ...on(ready.length > 0, { true: () => ready, false: () => pending.slice(0, 1) })]
  }, [])
}

/**
 * The snapshot set. `seeds` are packages with a pending non-`none` bump or an
 * owed version. Private packages never join; an excluded seed is reported and
 * left out. The plan is refused when a seed names no workspace package (a
 * misspelled intent would otherwise publish nothing for it), or when a public
 * package depends on an excluded seed — it would pin a version of the excluded
 * package that does not exist.
 */
export const planSet = (manifests: readonly Manifest[], seeds: ReadonlySet<string>): SetDecision => {
  const known = new Set(manifests.map((m) => m.name))
  const publics = manifests.filter((m) => m.private !== true)
  const publicNames = new Set(publics.map((m) => m.name))
  const exclusions = [...seeds].filter(isExcluded).sort().map((name) => ({ name, reason: EXCLUDED[name] }))
  const excludedSeeds = new Set(exclusions.map((e) => e.name))
  const unknown = [...seeds].filter((s) => !known.has(s)).sort()
  const stranded = [...excludedSeeds].flatMap((x) =>
    publics.filter((m) => runtimeDeps(m).includes(x)).map((m) => `${m.name} depends on ${x}`)
  )
  const refusals = [
    ...onlyIf(unknown.length > 0, () => [`a pending intent names no workspace package: ${unknown.join(', ')}`]),
    ...onlyIf(stranded.length > 0, () => [`excluded package changed under a dependent: ${stranded.join('; ')}`]),
  ]
  const kept = new Set([...seeds].filter((s) => all(publicNames.has(s), !excludedSeeds.has(s))))
  const closed = closeOverDependents(publics, kept)
  return on(refusals.length > 0, {
    true: (): SetDecision => ({ kind: 'refused', reason: refusals.join('; ') }),
    false: (): SetDecision => ({
      kind: 'planned',
      members: publishOrder(publics.filter((m) => closed.has(m.name))),
      exclusions,
    }),
  })
}

/** `versions.get(key)`, or `fallback` when the map has no entry. */
const lookupOr = (versions: ReadonlyMap<string, string>, key: string, fallback: string): string =>
  firstOr([versions.get(key)].filter(isString), fallback)

/** The manifest as it must pack: members carry `version`, and every specifier to a member is that exact version. */
export const stampManifest = <M extends Manifest>(manifest: M, versions: ReadonlyMap<string, string>): M => {
  const sections = Object.fromEntries(
    ALL_SECTIONS.filter((s) => manifest[s] !== undefined).map((s) => [
      s,
      Object.fromEntries(Object.entries({ ...manifest[s] }).map(([dep, spec]) => [dep, lookupOr(versions, dep, spec)])),
    ]),
  )
  return { ...manifest, ...sections, version: lookupOr(versions, manifest.name, manifest.version) }
}

/** Every reason the packed tarballs disagree with the plan; empty means they match. */
export const verifyTarballs = (plan: SnapshotPlan, packed: readonly Manifest[]): string[] => {
  const wanted = new Map(plan.members.map((m) => [m.name, m.version]))
  const seen = packed.map((m) => m.name)
  const specProblems = (m: Manifest) =>
    ALL_SECTIONS.flatMap((section) =>
      Object.entries({ ...m[section] }).flatMap(([dep, spec]) => [
        ...onlyIf(/^(workspace|catalog):/.test(spec), () => [`${m.name} ${section}.${dep} kept ${spec}`]),
        ...onlyIf(
          all((RUNTIME_SECTIONS as readonly string[]).includes(section), wanted.has(dep), spec !== wanted.get(dep)),
          () => [`${m.name} ${section}.${dep} is ${spec}, not exactly ${wanted.get(dep)}`],
        ),
      ])
    )
  return [
    ...plan.members.filter((m) => !seen.includes(m.name)).map((m) => `missing tarball for ${m.name}`),
    ...seen.filter((n) => !wanted.has(n)).map((n) => `tarball ${n} is not in the plan`),
    ...seen.filter((n, i) => seen.indexOf(n) !== i).map((n) => `more than one tarball for ${n}`),
    ...packed.filter((p) => wanted.has(p.name)).flatMap((m) => [
      ...onlyIf(
        m.version !== wanted.get(m.name),
        () => [`${m.name} packed ${m.version}, plan says ${wanted.get(m.name)}`],
      ),
      ...specProblems(m),
    ]),
  ]
}

export type Registration = 'served' | 'never-published' | 'unreadable'

export type Preflight = { readonly kind: 'clear' } | { readonly kind: 'blocked'; readonly reason: string }

/** The never-published preflight: nothing uploads unless npm already knows every name. Unreadable outranks unpublished. */
export const preflight = (
  registrations: readonly { readonly name: string; readonly status: Registration }[],
): Preflight => {
  const of = (s: Registration) => registrations.filter((r) => r.status === s).map((r) => r.name)
  const blockers = (['unreadable', 'never-published'] as const).filter((s) => of(s).length > 0)
  const outcome: Record<'unreadable' | 'never-published' | 'clear', () => Preflight> = {
    unreadable: () => ({
      kind: 'blocked',
      reason: `registry unreadable for ${of('unreadable').join(', ')}; nothing was published`,
    }),
    'never-published': () => ({
      kind: 'blocked',
      reason: `OIDC cannot debut a package; npm has never served ${
        of('never-published').join(', ')
      }. A maintainer debuts each first:\n${
        of('never-published').map((n) => `  pnpm publish:unpublished --only ${n} --tag <pr-tag>`).join('\n')
      }\nNothing was published.`,
    }),
    clear: () => ({ kind: 'clear' }),
  }
  return outcome[firstOr(blockers, 'clear' as const)]()
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

/** One own property of an untrusted value, or undefined when it has none. */
const field = (value: unknown, key: string): unknown =>
  [Object(value)].filter((o) => Object.hasOwn(o, key)).map((o) => Reflect.get(o, key))[0]

/** The named string fields of an untrusted value, or null when any is missing or not a string. */
const strings = <K extends string>(value: unknown, keys: readonly K[]): Record<K, string> | null => {
  const read = keys.map((k) => [k, field(value, k)] as const)
  // Every entry is checked to be a string before this record is returned, which is what its type says.
  const checked = Object.fromEntries(read) as Record<K, string>
  return firstOr([checked].filter(() => read.every(([, v]) => isString(v))), null)
}

const arrayOf = (v: unknown): readonly unknown[] => [v].filter(Array.isArray).flat()

/**
 * `plan.json` as data, or why it is not a plan. Every field is read and
 * type-checked, because the file crosses from a job running PR code. A hand
 * decoder, not arktype: the publish path imports no npm package. The first
 * failing check, in table order, is the reason.
 */
export const decodePlan = (raw: unknown): SnapshotPlan | string => {
  const head = strings(raw, ['sha', 'headSha', 'distTag'])
  const pr = [field(raw, 'pr')].filter((x): x is number => typeof x === 'number')
  const rawMembers = field(raw, 'members')
  const rawExclusions = field(raw, 'exclusions')
  const members = arrayOf(rawMembers).map((m) => strings(m, ['name', 'version', 'dir'])).filter(present)
  const exclusions = arrayOf(rawExclusions).map((e) => strings(e, ['name', 'reason'])).filter(present)
  const checks: readonly (readonly [boolean, string])[] = [
    [any(head === null, pr.length === 0), 'plan sha, headSha, distTag or pr has the wrong type'],
    [any(!Array.isArray(rawMembers), !Array.isArray(rawExclusions)), 'plan members or exclusions is not an array'],
    [
      any(members.length !== arrayOf(rawMembers).length, exclusions.length !== arrayOf(rawExclusions).length),
      'plan has a malformed member or exclusion',
    ],
    [new Set(members.map((m) => m.name)).size !== members.length, 'plan names a member twice'],
  ]
  const plans = [head].filter(present).flatMap((h) => pr.map((n) => ({ ...h, pr: n, members, exclusions })))
  return [...checks.filter(([failed]) => failed).map(([, reason]) => reason), ...plans][0]
}

type Trusted = { readonly pr: number; readonly sha: string; readonly workspace: ReadonlySet<string> }

/**
 * The OIDC job's refusal of a plan it did not compute. `plan.json` comes from
 * a job that runs pull request code, so every field that steers a publish is
 * checked against values the publishing job derives itself: the dist-tag and
 * version from the event context, the member names from the default branch's
 * own workspace. Each rule is a predicate with its message; every rule that
 * fails reports. Empty means admitted.
 */
export const admitPlan = (plan: SnapshotPlan, trusted: Trusted): string[] => {
  const tag = distTag(trusted.pr)
  const version = snapshotVersion(trusted.sha)
  const planRules: readonly { readonly refuses: boolean; readonly message: () => string }[] = [
    ...values(tag).map((t) => ({
      refuses: plan.distTag !== t,
      message: () => `plan dist-tag ${JSON.stringify(plan.distTag)} is not ${t}`,
    })),
    { refuses: plan.sha !== trusted.sha, message: () => `plan sha ${JSON.stringify(plan.sha)} is not ${trusted.sha}` },
    { refuses: plan.pr !== trusted.pr, message: () => `plan pr ${JSON.stringify(plan.pr)} is not ${trusted.pr}` },
  ]
  const memberRules: readonly {
    readonly refuses: (m: PlanMember) => boolean
    readonly message: (m: PlanMember) => string
  }[] = [
    ...values(version).map((v) => ({
      refuses: (m: PlanMember) => m.version !== v,
      message: (m: PlanMember) => `${m.name} has version ${m.version}, not ${v}`,
    })),
    {
      refuses: (m) => !trusted.workspace.has(m.name),
      message: (m) => `${m.name} is not a public package of the default branch's workspace`,
    },
    { refuses: (m) => isExcluded(m.name), message: (m) => `${m.name} is excluded from snapshots` },
  ]
  return [
    ...reasons(tag),
    ...reasons(version),
    ...planRules.filter((r) => r.refuses).map((r) => r.message()),
    ...memberRules.flatMap((r) => plan.members.filter(r.refuses).map(r.message)),
  ]
}

/** Names whose dist-tags body (`GET /-/package/<name>/dist-tags`, null on 404) maps `tag` to a version. */
export const taggedPackages = (distTagsByName: ReadonlyMap<string, unknown>, tag: string): string[] =>
  [...distTagsByName].filter(([, tags]) => isString(field(tags, tag))).map(([n]) => n).sort()

const isNameMap = (v: unknown): v is object => all(typeof v === 'object', v !== null, !Array.isArray(v))

/**
 * Package names from npm's org listing (`GET /-/org/<org>/package`, a
 * name → access map served without auth), or null when the body is not one.
 * The search API is not used: its index lags a fresh debut, which is the
 * package this listing exists to find.
 */
export const orgPackageNames = (listing: unknown, scope: string): string[] | null =>
  firstOr([listing].filter(isNameMap).map((o) => Object.keys(o).filter((n) => n.startsWith(`${scope}/`)).sort()), null)

export type MemberOutcome =
  | { readonly name: string; readonly version: string; readonly kind: 'accepted' | 'held' }
  | { readonly name: string; readonly version: string; readonly kind: 'failed'; readonly error: string }

/** The job summary: pins only for versions npm now serves, failures listed apart with their error. */
export const publishSummary = (plan: SnapshotPlan, outcomes: readonly MemberOutcome[]): string => {
  const served = outcomes.filter((o) => o.kind !== 'failed')
  const failed = outcomes.filter((o): o is Extract<MemberOutcome, { readonly kind: 'failed' }> => o.kind === 'failed')
  const exclusions = plan.exclusions.map((e) => `- excluded \`${e.name}\`: ${e.reason}`)
  return [
    `## Snapshot \`${plan.distTag}\``,
    '',
    `Built at \`${plan.sha}\` (PR head \`${plan.headSha}\`).`,
    ...onlyIf(exclusions.length > 0, () => ['', ...exclusions]),
    ...onlyIf(served.length > 0, () => [
      '',
      '```text',
      pinBlock(served.map((o) => ({ name: o.name, version: o.version, dir: '' }))),
      '```',
    ]),
    ...onlyIf(failed.length > 0, () => [
      '',
      '### Not published',
      '',
      ...failed.flatMap((f) => [`- \`${f.name}@${f.version}\`:`, '', '```text', f.error, '```']),
    ]),
    '',
  ].join('\n')
}
