import { defineRule } from '@oxlint/plugins'
import type { Comment, Context, ESTree } from '@oxlint/plugins'
import { originMemberSequence, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import type { ImportOrigin } from '@systemfsoftware/oxlint-import-origin'

import {
  EFFECT_ATOM_SOURCE,
  effectBanDirectiveVerdict,
  HYDRATE_MEMBER_SEQUENCE,
  IMPORT_BAN_DIRECTIVE_IDS,
  meta,
  REACT_EFFECT_DIRECTIVE_ID,
  REACT_EFFECT_EXPECTED,
  REACT_EFFECT_NAME,
  REACT_IMPORT_BAN_NAMES,
  REACT_MODULE,
  reactEffectCallVerdict,
  reactEffectReexportVerdict,
  reactEffectReferenceVerdict,
  reactModuleLoadVerdict,
} from './no-react-effect.config.js'
import type { ReactEffectVerdict } from './no-react-effect.config.js'

export type MessageIds = 'reactEffect'

type GetScope = (node: ESTree.Node) => unknown

type IdentifierNode = ESTree.Node & { readonly type: 'Identifier'; readonly name: string }

type CallbackNode = ESTree.Function | ESTree.ArrowFunctionExpression

interface DisableDirective {
  readonly type: 'disable' | 'enable' | 'disable-line' | 'disable-next-line'
  readonly value: string
  readonly node: Comment
}

const REFUSED_REACT_NAMES: Record<string, true> = Object.fromEntries(
  [...REACT_IMPORT_BAN_NAMES, 'default'].map((name) => [name, true] as const),
)

const IMPORT_SPECIFIER_TYPES: Record<string, true> = {
  ImportSpecifier: true,
  ImportDefaultSpecifier: true,
  ImportNamespaceSpecifier: true,
}

const isIdentifierNode = (node: ESTree.Node): node is IdentifierNode => node.type === 'Identifier'

const isCallbackNode = (node: ESTree.Node): node is CallbackNode =>
  node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression'

const isImportBindingIdentifier = (node: IdentifierNode): boolean => {
  const parent: ESTree.Node | null = node.parent
  return parent !== null && IMPORT_SPECIFIER_TYPES[parent.type] === true
}

interface ReferenceLike {
  readonly identifier: ESTree.Node
  readonly isWriteOnly: () => boolean
}

interface ScopeLike {
  readonly upper: ScopeLike | null
  readonly references: readonly ReferenceLike[]
}

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'references' in value && 'upper' in value

const isReadReference = (node: IdentifierNode, getScope: GetScope): boolean => {
  const scopeValue: unknown = getScope(node)
  if (!isScopeLike(scopeValue)) return false
  for (let scope: ScopeLike | null = scopeValue; scope !== null; scope = scope.upper) {
    const found = scope.references.find((reference) => reference.identifier === node)
    if (found !== undefined) return !found.isWriteOnly()
  }
  return false
}

const isReexportedName = (node: IdentifierNode): boolean => {
  const parent: ESTree.Node | null = node.parent
  if (parent === null || parent.type !== 'ExportSpecifier') return false
  const declaration: ESTree.Node | null = parent.parent
  return declaration !== null && declaration.type === 'ExportNamedDeclaration' && declaration.source !== null
}

const isReactEffectOrigin = (origin: ImportOrigin): boolean =>
  origin.source === REACT_MODULE && origin.importedName === REACT_EFFECT_NAME && origin.path.length === 0

const isHydrateCall = (node: ESTree.Node, getScope: GetScope): boolean => {
  if (node.type !== 'CallExpression') return false
  if (node.arguments.length !== 2) return false
  const origin = resolveImportOrigin(node.callee, getScope)
  if (origin === null) return false
  if (origin.source !== EFFECT_ATOM_SOURCE) return false
  const sequence = originMemberSequence(origin)
  return (
    sequence.length === HYDRATE_MEMBER_SEQUENCE.length &&
    HYDRATE_MEMBER_SEQUENCE.every((segment, index) => sequence[index] === segment)
  )
}

const blockBodyStatementsOf = (callback: CallbackNode): readonly ESTree.Node[] | null => {
  const body = callback.body
  if (body === null) return null
  if (body.type !== 'BlockStatement') return null
  return body.body
}

const isAdmittedEffectCall = (call: ESTree.CallExpression, getScope: GetScope): boolean => {
  if (call.arguments.length !== 2) return false
  const callback = call.arguments[0]
  const dependencies = call.arguments[1]
  if (callback === undefined || dependencies === undefined) return false
  if (!isCallbackNode(callback)) return false
  if (dependencies.type !== 'ArrayExpression') return false
  const statements = blockBodyStatementsOf(callback)
  if (statements === null || statements.length !== 1) return false
  const statement = statements[0]
  if (statement === undefined || statement.type !== 'ExpressionStatement') return false
  return isHydrateCall(statement.expression, getScope)
}

const staticStringOf = (node: ESTree.Node | undefined): string | null => {
  if (node === undefined) return null
  if (node.type === 'Literal') return typeof node.value === 'string' ? node.value : null
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? null
  return null
}

interface VariableLike {
  readonly name: string
}

interface BindingScopeLike {
  readonly upper: BindingScopeLike | null
  readonly variables: readonly VariableLike[]
}

const isBindingScopeLike = (value: unknown): value is BindingScopeLike =>
  typeof value === 'object' && value !== null && 'variables' in value && 'upper' in value

const isLocallyBound = (node: IdentifierNode, getScope: GetScope): boolean => {
  const scopeValue: unknown = getScope(node)
  if (!isBindingScopeLike(scopeValue)) return false
  for (let scope: BindingScopeLike | null = scopeValue; scope !== null; scope = scope.upper) {
    if (scope.variables.some((variable) => variable.name === node.name)) return true
  }
  return false
}

const isGlobalRequire = (callee: ESTree.Node, getScope: GetScope): boolean =>
  isIdentifierNode(callee) && callee.name === 'require' && !isLocallyBound(callee, getScope)

const moduleExportNameOf = (node: ESTree.Node): string | null => {
  if (node.type === 'Identifier') return node.name
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  return null
}

const isRefusedName = (node: ESTree.Node): boolean => {
  const name = moduleExportNameOf(node)
  return name !== null && REFUSED_REACT_NAMES[name] === true
}

const isRefusedReactSpecifier = (specifier: ESTree.Node): boolean => {
  if (specifier.type === 'ImportDefaultSpecifier' || specifier.type === 'ImportNamespaceSpecifier') return true
  if (specifier.type === 'ImportSpecifier') return isRefusedName(specifier.imported)
  if (specifier.type === 'ExportSpecifier') return isRefusedName(specifier.local)
  return false
}

const isRefusedReactDeclaration = (statement: ESTree.Node): boolean => {
  if (statement.type === 'ExportAllDeclaration') return statement.source.value === REACT_MODULE
  if (statement.type === 'ImportDeclaration') {
    return statement.source.value === REACT_MODULE && statement.specifiers.some(isRefusedReactSpecifier)
  }
  if (statement.type === 'ExportNamedDeclaration') {
    return statement.source !== null && statement.source.value === REACT_MODULE &&
      statement.specifiers.some(isRefusedReactSpecifier)
  }
  return false
}

interface LineRange {
  readonly first: number
  readonly last: number
}

const coversAny = (range: LineRange, lines: ReadonlySet<number>): boolean => {
  for (const line of lines) {
    if (line >= range.first && line <= range.last) return true
  }
  return false
}

const namedRulesOf = (value: string): readonly string[] =>
  value.split(',').map((name) => name.trim()).filter((name) => name.length > 0)

const directiveFormOf = (directive: DisableDirective): string =>
  `${/^\s*eslint-/.test(directive.node.value) ? 'eslint' : 'oxlint'}-${directive.type}`

const enables = (directive: DisableDirective, name: string | null): boolean => {
  if (directive.type !== 'enable') return false
  const names = namedRulesOf(directive.value)
  return names.length === 0 || (name !== null && names.includes(name))
}

const rangeOf = (directive: DisableDirective, all: readonly DisableDirective[], name: string | null): LineRange => {
  const loc = directive.node.loc
  if (directive.type === 'disable-line') return { first: loc.start.line, last: loc.end.line }
  if (directive.type === 'disable-next-line') return { first: loc.end.line + 1, last: loc.end.line + 1 }
  const closing = all.find((other) => other.node.start > directive.node.end && enables(other, name))
  return { first: loc.start.line, last: closing === undefined ? Number.POSITIVE_INFINITY : closing.node.loc.start.line }
}

const turnsBanOff = (
  directive: DisableDirective,
  all: readonly DisableDirective[],
  reachLines: ReadonlySet<number>,
  importBanLines: ReadonlySet<number>,
): boolean => {
  if (directive.type === 'enable') return false
  const names = namedRulesOf(directive.value)
  if (names.includes(REACT_EFFECT_DIRECTIVE_ID)) return true
  if (names.length === 0) {
    const range = rangeOf(directive, all, null)
    return coversAny(range, reachLines) || coversAny(range, importBanLines)
  }
  return IMPORT_BAN_DIRECTIVE_IDS.some((id) =>
    names.includes(id) && coversAny(rangeOf(directive, all, id), importBanLines)
  )
}

export const noReactEffect = defineRule({
  meta,
  create(context: Context) {
    const getScope: GetScope = context.sourceCode.getScope

    const reachLines = new Set<number>()

    const report = (verdict: ReactEffectVerdict, node: ESTree.Node): void => {
      reachLines.add(node.loc.start.line)
      context.report({
        node,
        messageId: 'reactEffect',
        data: { ...verdict, expected: REACT_EFFECT_EXPECTED },
      })
    }

    const reportDirective = (directive: DisableDirective): void => {
      context.report({
        loc: { line: 1, column: 0 },
        messageId: 'reactEffect',
        data: {
          ...effectBanDirectiveVerdict(directiveFormOf(directive), directive.node.loc.start.line),
          expected: REACT_EFFECT_EXPECTED,
        },
      })
    }

    return {
      'Program:exit'(program: ESTree.Program) {
        const importBanLines = new Set<number>()
        for (const statement of program.body) {
          if (!isRefusedReactDeclaration(statement)) continue
          for (let line = statement.loc.start.line; line <= statement.loc.end.line; line++) importBanLines.add(line)
        }
        const { directives } = context.sourceCode.getDisableDirectives()
        for (const directive of directives) {
          if (turnsBanOff(directive, directives, reachLines, importBanLines)) reportDirective(directive)
        }
      },

      ImportExpression(node: ESTree.ImportExpression) {
        if (staticStringOf(node.source) !== REACT_MODULE) return
        report(reactModuleLoadVerdict(`import('${REACT_MODULE}')`), node)
      },

      CallExpression(node: ESTree.CallExpression) {
        if (!isGlobalRequire(node.callee, getScope)) return
        if (staticStringOf(node.arguments[0]) !== REACT_MODULE) return
        report(reactModuleLoadVerdict(`require('${REACT_MODULE}')`), node)
      },

      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source === null) return
        if (node.source.value !== REACT_MODULE) return
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ExportSpecifier') continue
          const local = specifier.local
          if (local.type === 'Identifier' && local.name === REACT_EFFECT_NAME) {
            report(reactEffectReexportVerdict(), specifier)
          }
        }
      },

      Identifier(node: ESTree.Node) {
        if (!isIdentifierNode(node)) return
        if (isImportBindingIdentifier(node)) return
        if (isReexportedName(node)) return
        if (!isReadReference(node, getScope)) return
        const origin = resolveImportOrigin(node, getScope)
        if (origin === null || !isReactEffectOrigin(origin)) return

        const parent: ESTree.Node | null = node.parent
        if (parent !== null && parent.type === 'CallExpression' && parent.callee === node) {
          if (isAdmittedEffectCall(parent, getScope)) return
          report(reactEffectCallVerdict(), node)
          return
        }

        report(reactEffectReferenceVerdict(), node)
      },
    }
  },
})
