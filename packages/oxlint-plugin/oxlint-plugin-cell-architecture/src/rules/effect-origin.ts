import type { ESTree } from '@oxlint/plugins'
import { originFinalMember, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import type { ImportOrigin } from '@systemfsoftware/oxlint-import-origin'

export type GetScope = (node: ESTree.Node) => unknown

export const isEffectSource = (source: string): boolean => source === 'effect' || source.startsWith('effect/')

const effectOriginOf = (node: ESTree.Node, getScope: GetScope): ImportOrigin | null => {
  const origin = resolveImportOrigin(node, getScope)
  if (origin === null || isEffectSource(origin.source) === false) return null
  return origin
}

export const effectMemberOf = (node: ESTree.Node, getScope: GetScope): string | null => {
  const origin = effectOriginOf(node, getScope)
  return origin === null ? null : originFinalMember(origin)
}

export const effectMemberIs = (
  node: ESTree.Node,
  getScope: GetScope,
  members: Readonly<Record<string, true>>,
): boolean => {
  const member = effectMemberOf(node, getScope)
  return member !== null && members[member] === true
}
