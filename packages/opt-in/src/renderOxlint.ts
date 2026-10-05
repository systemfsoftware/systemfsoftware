import { Array as Arr, Match } from 'effect'
import { dual } from 'effect/Function'
import type { Raw } from './json.js'
import type { OptIns, OxlintRule } from './OptIn.schema.js'

export interface OxlintOverride {
  readonly files: ReadonlyArray<string>
  readonly rules: Readonly<Record<string, readonly ['error', ...ReadonlyArray<Raw>]>>
}

const errorWith = <A>(options: ReadonlyArray<A>): readonly ['error', ...ReadonlyArray<A>] => {
  const head = 'error' as const
  return [head, ...options]
}

const overrideOf = (grant: OxlintRule): OxlintOverride => ({
  files: [...grant.files],
  rules: { [grant.rule]: errorWith(grant.options) },
})

export const oxlintOverrides = (optIns: OptIns): ReadonlyArray<OxlintOverride> =>
  Arr.flatMap(
    optIns,
    (optIn) =>
      Match.value(optIn.grant).pipe(
        Match.tag('OxlintRule', (grant) => [overrideOf(grant)]),
        Match.orElse(() => []),
      ),
  )

const filesIf = (included: boolean, files: ReadonlyArray<string>): ReadonlyArray<string> => included ? files : []

export const oxlintExcludeFiles = dual<
  (rule: string) => (optIns: OptIns) => ReadonlyArray<string>,
  (optIns: OptIns, rule: string) => ReadonlyArray<string>
>(
  2,
  (optIns, rule) =>
    Arr.dedupe(
      Arr.flatMap(
        optIns,
        (optIn) =>
          Match.value(optIn.grant).pipe(
            Match.tag('OxlintExclusion', (grant) => filesIf(grant.rule === rule, grant.files)),
            Match.orElse(() => []),
          ),
      ),
    ),
)
