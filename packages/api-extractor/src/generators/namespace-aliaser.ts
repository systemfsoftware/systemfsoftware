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

export const planNamespaceAliases = (
  namespaceName: string,
  members: readonly NamespaceMember[],
  reservedNames: ReadonlySet<string>,
): readonly NamespaceAlias[] => {
  const taken = new Set(reservedNames)
  const aliases: NamespaceAlias[] = []
  for (const member of members) {
    const base = aliasBase(namespaceName, member.memberName)
    let aliasName = base
    let suffix = 1
    while (taken.has(aliasName)) {
      suffix += 1
      aliasName = `${base}_${suffix}`
    }
    taken.add(aliasName)
    aliases.push({
      aliasName,
      memberName: member.memberName,
      targetName: member.targetName,
      kind: member.kind,
    })
  }
  return aliases
}

export const formatAliasDeclarations = (alias: NamespaceAlias): readonly string[] => {
  switch (alias.kind) {
    case 'namespace':
      return [`import ${alias.aliasName} = ${alias.targetName};`]
    case 'both':
      return [
        `type ${alias.aliasName} = ${alias.targetName};`,
        `declare const ${alias.aliasName}: typeof ${alias.targetName};`,
      ]
    case 'type':
      return [`type ${alias.aliasName} = ${alias.targetName};`]
    case 'value':
      return [`declare const ${alias.aliasName}: typeof ${alias.targetName};`]
  }
}

export const formatAliasExportClause = (alias: NamespaceAlias, isSafeName: (name: string) => boolean): string => {
  const exportedName = isSafeName(alias.memberName) ? alias.memberName : JSON.stringify(alias.memberName)
  return `${alias.aliasName} as ${exportedName}`
}
