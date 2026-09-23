import { HashSet } from 'effect'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'

export type NamespaceMemberKind = 'namespace' | 'both' | 'type' | 'value'

export interface NamespaceMember {
  readonly memberName: string
  readonly targetName: string
  readonly kind: NamespaceMemberKind
}

export interface NamespaceAlias extends NamespaceMember {
  readonly aliasName: string
}

const aliasBase = (namespaceName: string, memberName: string): string => `${namespaceName}_${memberName}`

const aliasCandidateOf = (base: string, suffix: number): string =>
  Match.value(suffix <= 1).pipe(
    Match.when(true, () => base),
    Match.when(false, () => `${base}_${suffix}`),
    Match.exhaustive,
  )

const firstFreeAliasOf = (taken: HashSet.HashSet<string>, base: string, suffix: number): string =>
  Match.value(HashSet.has(taken, aliasCandidateOf(base, suffix))).pipe(
    Match.when(true, () => firstFreeAliasOf(taken, base, suffix + 1)),
    Match.when(false, () => aliasCandidateOf(base, suffix)),
    Match.exhaustive,
  )

interface AliasWalk {
  readonly taken: HashSet.HashSet<string>
  readonly aliases: ReadonlyArray<NamespaceAlias>
}

const aliasWalkOf = (namespaceName: string) => (walk: AliasWalk, member: NamespaceMember): AliasWalk => {
  const base = aliasBase(namespaceName, member.memberName)
  const aliasName = firstFreeAliasOf(walk.taken, base, 1)
  return {
    taken: HashSet.add(walk.taken, aliasName),
    aliases: Arr.append(walk.aliases, {
      aliasName,
      memberName: member.memberName,
      targetName: member.targetName,
      kind: member.kind,
    }),
  }
}

export const planNamespaceAliases = (
  namespaceName: string,
  members: readonly NamespaceMember[],
  reservedNames: HashSet.HashSet<string>,
): readonly NamespaceAlias[] =>
  Arr.reduce(members, { taken: reservedNames, aliases: [] } satisfies AliasWalk, aliasWalkOf(namespaceName)).aliases

export const formatAliasDeclarations = (alias: NamespaceAlias): readonly string[] =>
  Match.value(alias.kind).pipe(
    Match.when('namespace', () => [`import ${alias.aliasName} = ${alias.targetName};`]),
    Match.when('both', () => [
      `type ${alias.aliasName} = ${alias.targetName};`,
      `declare const ${alias.aliasName}: typeof ${alias.targetName};`,
    ]),
    Match.when('type', () => [`type ${alias.aliasName} = ${alias.targetName};`]),
    Match.when('value', () => [`declare const ${alias.aliasName}: typeof ${alias.targetName};`]),
    Match.exhaustive,
  )

export const formatAliasExportClause = (alias: NamespaceAlias, isSafeName: (name: string) => boolean): string =>
  `${alias.aliasName} as ${
    Match.value(isSafeName(alias.memberName)).pipe(
      Match.when(true, () => alias.memberName),
      Match.when(false, () => JSON.stringify(alias.memberName)),
      Match.exhaustive,
    )
  }`
