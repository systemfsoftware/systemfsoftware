import type { types } from '@babel/core'

import { type NodeMutator } from '../mutators/node-mutator.js'

const WILDCARD = 'all'
const DEFAULT_REASON = 'Ignored using a comment'

const strykerCommentDirectiveRegex = /^\s?Stryker (disable|restore)(?: (next-line))? ([a-zA-Z, ]+)(?::(.+)?)?/

export type Rule =
  | { readonly kind: 'Root' }
  | {
    readonly kind: 'Ignore'
    readonly mutatorNames: readonly string[]
    readonly line: number | undefined
    readonly ignoreReason: string
    readonly previous: Rule
  }
  | {
    readonly kind: 'Restore'
    readonly mutatorNames: readonly string[]
    readonly line: number | undefined
    readonly previous: Rule
  }

export const rootRule: Rule = { kind: 'Root' }

export function findIgnoreReason(
  rule: Rule,
  mutatorName: string,
  line: number,
): string | undefined {
  const lower = mutatorName.toLowerCase()
  let current: Rule = rule
  while (true) {
    switch (current.kind) {
      case 'Root':
        return undefined
      case 'Ignore': {
        const lineMatches = current.line === undefined || current.line === line
        const mutatorMatches = current.mutatorNames.includes(lower) ||
          current.mutatorNames.includes(WILDCARD)
        if (lineMatches && mutatorMatches) {
          return current.ignoreReason
        }
        current = current.previous
        break
      }
      case 'Restore': {
        const lineMatches = current.line === undefined || current.line === line
        const mutatorMatches = current.mutatorNames.includes(lower) ||
          current.mutatorNames.includes(WILDCARD)
        if (lineMatches && mutatorMatches) {
          return undefined
        }
        current = current.previous
        break
      }
    }
  }
}

export function processStrykerDirectives(
  rule: Rule,
  node: types.Node,
  allMutatorNames: readonly string[],
  originFileName: string,
): { rule: Rule; warnings: readonly string[] } {
  const leadingComments = (node as { leadingComments?: readonly types.Comment[] | null }).leadingComments
  if (!leadingComments) {
    return { rule, warnings: [] }
  }
  let current: Rule = rule
  const warnings: string[] = []
  for (const comment of leadingComments) {
    const matchResult = strykerCommentDirectiveRegex.exec(comment.value)
    if (!matchResult) {
      continue
    }
    const directiveType = matchResult[1]
    const scope = matchResult[2]
    const mutators = matchResult[3]
    const optionalReason = matchResult[4]
    if (directiveType === undefined || mutators === undefined) {
      throw new Error('Stryker directive without directive type or mutators')
    }
    let mutatorNames = mutators.split(',').map((mutator) => mutator.trim())
    for (const mutator of mutatorNames) {
      if (mutator === WILDCARD) continue
      if (!allMutatorNames.includes(mutator.toLowerCase())) {
        const commentLoc = comment.loc
        if (
          commentLoc === undefined ||
          commentLoc === null ||
          commentLoc.start === null ||
          commentLoc.start === undefined
        ) {
          throw new Error('Comment without location')
        }
        warnings.push(
          `Unused 'Stryker ${
            scope ? directiveType + ' ' + scope : directiveType
          }' directive. Mutator with name '${mutator}' not found. Directive found at: ${originFileName}:${commentLoc.start.line}:${commentLoc.start.column}.`,
        )
      }
    }
    mutatorNames = mutatorNames.map((mutator) => mutator.toLowerCase())
    const reason = (optionalReason ?? DEFAULT_REASON).trim()
    current = applyDirective(current, directiveType, scope, mutatorNames, reason, node.loc)
  }
  return { rule: current, warnings }
}

function applyDirective(
  rule: Rule,
  directiveType: string,
  scope: string | undefined,
  mutatorNames: string[],
  reason: string,
  loc: types.SourceLocation | null | undefined,
): Rule {
  switch (directiveType) {
    case 'disable':
      return applyDisable(rule, scope, mutatorNames, reason, loc)
    case 'restore':
      return applyRestore(rule, scope, mutatorNames, loc)
    default:
      return rule
  }
}

function applyDisable(
  rule: Rule,
  scope: string | undefined,
  mutatorNames: string[],
  reason: string,
  loc: types.SourceLocation | null | undefined,
): Rule {
  switch (scope) {
    case 'next-line':
      return {
        kind: 'Ignore',
        mutatorNames,
        line: getLine(loc),
        ignoreReason: reason,
        previous: rule,
      }
    case undefined:
    default:
      return {
        kind: 'Ignore',
        mutatorNames,
        line: undefined,
        ignoreReason: reason,
        previous: rule,
      }
  }
}

function applyRestore(
  rule: Rule,
  scope: string | undefined,
  mutatorNames: string[],
  loc: types.SourceLocation | null | undefined,
): Rule {
  switch (scope) {
    case 'next-line':
      return {
        kind: 'Restore',
        mutatorNames,
        line: getLine(loc),
        previous: rule,
      }
    case undefined:
    default:
      return {
        kind: 'Restore',
        mutatorNames,
        line: undefined,
        previous: rule,
      }
  }
}

function getLine(loc: types.SourceLocation | null | undefined): number {
  if (loc === undefined || loc === null || loc.start === null || loc.start === undefined) {
    throw new Error('Babel node without location')
  }
  return loc.start.line
}
