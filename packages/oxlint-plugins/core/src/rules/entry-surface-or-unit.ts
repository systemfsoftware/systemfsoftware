import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'
import {
  ENTRY_MIX_ACTUAL,
  ENTRY_MIX_EXPECTED,
  ENTRY_MIX_FIX,
  meta,
  NON_ENTRY_REEXPORT_ACTUAL,
  NON_ENTRY_REEXPORT_EXPECTED,
  NON_ENTRY_REEXPORT_FIX,
  Options,
} from './entry-surface-or-unit.config.js'

export type MessageIds = 'entrySurfaceAndUnit' | 'nonEntryForeignReexport'

type Mark = 'surface' | 'unit' | null

type DeclaredKind = 'behaviour' | 'type'

const EFFECT_INVOCATION_PROPERTIES: Readonly<Record<string, boolean>> = {
  run: true,
  runSync: true,
  runSyncExit: true,
  runPromise: true,
  runPromiseExit: true,
  runFork: true,
  runCallback: true,
}

interface InvocationCandidate {
  readonly start: number
  readonly end: number
  readonly base: string
}

const unwrapTypeWrappers = (node: ESTree.Expression): ESTree.Expression => {
  let current = node
  while (
    current.type === 'TSAsExpression' ||
    current.type === 'TSTypeAssertion' ||
    current.type === 'TSSatisfiesExpression'
  ) {
    current = current.expression
  }
  return current
}

const isLayerConstructorCall = (init: ESTree.Expression, importedNames: ReadonlySet<string>): boolean => {
  if (init.type !== 'CallExpression') return false
  const callee = init.callee
  if (callee.type !== 'MemberExpression' || callee.computed) return false
  const object = callee.object
  if (object.type !== 'Identifier' || object.name !== 'Layer') return false
  if (!importedNames.has(object.name)) return false
  return callee.property.type === 'Identifier'
}

const invocationBase = (callee: ESTree.CallExpression['callee']): string | null => {
  if (callee.type === 'Identifier') return callee.name === 'runMain' ? callee.name : null
  if (callee.type !== 'MemberExpression' || callee.computed) return null
  const object = callee.object
  const property = callee.property
  if (object.type !== 'Identifier' || property.type !== 'Identifier') return null
  if (object.name === 'Effect') {
    return EFFECT_INVOCATION_PROPERTIES[property.name] === true ? object.name : null
  }
  if (object.name === 'ManagedRuntime') {
    return property.name === 'make' ? object.name : null
  }
  return null
}

const isNamespaceObject = (init: ESTree.Expression, importedNames: ReadonlySet<string>): boolean => {
  if (init.type !== 'ObjectExpression') return false
  return init.properties.every((property) => {
    if (property.type === 'SpreadElement') return false
    if (property.kind !== 'init') return false
    const value = unwrapTypeWrappers(property.value)
    if (value.type !== 'Identifier') return false
    return importedNames.has(value.name)
  })
}

const valueMark = (
  init: ESTree.Expression,
  importedNames: ReadonlySet<string>,
  invokesAtModuleScope: (initStart: number, initEnd: number) => boolean,
): Mark => {
  const unwrapped = unwrapTypeWrappers(init)
  if (unwrapped.type === 'Identifier') return 'surface'
  if (isNamespaceObject(unwrapped, importedNames)) return 'surface'
  if (invokesAtModuleScope(init.start, init.end)) return 'unit'
  if (isLayerConstructorCall(unwrapped, importedNames)) return 'surface'
  return 'unit'
}

const declarationMark = (
  declaration: ESTree.Declaration,
  importedNames: ReadonlySet<string>,
  invokesAtModuleScope: (initStart: number, initEnd: number) => boolean,
): Mark => {
  switch (declaration.type) {
    case 'TSTypeAliasDeclaration':
    case 'TSInterfaceDeclaration':
    case 'TSDeclareFunction':
      return null
    case 'VariableDeclaration': {
      const declarator = declaration.declarations[0]
      if (declarator === undefined || declarator.init === null) return 'unit'
      return valueMark(declarator.init, importedNames, invokesAtModuleScope)
    }
    default:
      return 'unit'
  }
}

const exportedName = (
  declaration: ESTree.Declaration | null,
  specifiers: readonly ESTree.ExportSpecifier[],
  source: ESTree.StringLiteral | null,
  allExportedLabel: string | null,
): string => {
  if (declaration !== null) {
    if (declaration.type === 'VariableDeclaration') {
      const declarator = declaration.declarations[0]
      if (declarator !== undefined && declarator.id.type === 'Identifier') return declarator.id.name
    }
    if ('id' in declaration && declaration.id !== null && declaration.id.type === 'Identifier') {
      return declaration.id.name
    }
    return declaration.type
  }
  if (allExportedLabel !== null || source !== null) {
    const from = source === null ? '' : ` from '${source.value}'`
    if (allExportedLabel !== null) return `re-export of ${allExportedLabel}${from}`
    const names = specifiers.map(localNameOf).join(', ')
    return `re-export of ${names}${from}`
  }
  const names = specifiers.map(localNameOf).join(', ')
  return `re-export of ${names}`
}

const isNamedExport = (
  value: ESTree.ModuleExportName,
): value is Extract<ESTree.ModuleExportName, { readonly name: string }> => 'name' in value

const localNameOf = (specifier: ESTree.ExportSpecifier): string => {
  const local = specifier.local
  return isNamedExport(local) ? local.name : String(local.value)
}

const allExportedLabel = (exported: ESTree.ModuleExportName | null): string => {
  if (exported === null) return '*'
  const name = exported
  return isNamedExport(name) ? name.name : String(name.value)
}

const within = (innerStart: number, innerEnd: number, outerStart: number, outerEnd: number): boolean =>
  outerStart <= innerStart && innerEnd <= outerEnd

export const entrySurfaceOrUnit = defineRule({
  meta,
  create(context: Context) {
    const options = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const entryPattern = new RegExp(options.entryPattern, 'u')
    const isEntry = entryPattern.test(context.filename)

    const invocationCandidates: InvocationCandidate[] = []
    const functionRanges: Array<{ readonly start: number; readonly end: number }> = []

    const recordCandidate = (node: ESTree.CallExpression): void => {
      const base = invocationBase(node.callee)
      if (base !== null) {
        invocationCandidates.push({ base, start: node.start, end: node.end })
      }
    }

    return {
      CallExpression: recordCandidate,
      FunctionExpression(node: ESTree.Function) {
        functionRanges.push({ start: node.start, end: node.end })
      },
      ArrowFunctionExpression(node: ESTree.ArrowFunctionExpression) {
        functionRanges.push({ start: node.start, end: node.end })
      },

      'Program:exit'(node: ESTree.Program) {
        const importedNames = new Set<string>()
        const declaredKinds = new Map<string, DeclaredKind>()
        for (const statement of node.body) {
          if (statement.type === 'ImportDeclaration') {
            for (const specifier of statement.specifiers) {
              if (specifier.local.type === 'Identifier') importedNames.add(specifier.local.name)
            }
            continue
          }
          if (statement.type === 'VariableDeclaration') {
            for (const declarator of statement.declarations) {
              if (declarator.id.type === 'Identifier') declaredKinds.set(declarator.id.name, 'behaviour')
            }
            continue
          }
          if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
            if (statement.id !== null) declaredKinds.set(statement.id.name, 'behaviour')
            continue
          }
          if (statement.type === 'TSEnumDeclaration') {
            if (statement.id.type === 'Identifier') declaredKinds.set(statement.id.name, 'behaviour')
            continue
          }
          if (statement.type === 'TSTypeAliasDeclaration' || statement.type === 'TSInterfaceDeclaration') {
            if (statement.id.type === 'Identifier') declaredKinds.set(statement.id.name, 'type')
          }
        }

        const invokesEffectAtModuleScope = (initStart: number, initEnd: number): boolean =>
          invocationCandidates.some(
            (candidate) =>
              importedNames.has(candidate.base) &&
              within(candidate.start, candidate.end, initStart, initEnd) &&
              !functionRanges.some((fn) => within(candidate.start, candidate.end, fn.start, fn.end)),
          )

        if (isEntry) {
          let seen: 'none' | 'surface' | 'unit' | 'both' = 'none'
          for (const statement of node.body) {
            let mark: Mark = null
            if (statement.type === 'ExportAllDeclaration') {
              mark = 'surface'
            } else if (statement.type === 'ExportDefaultDeclaration') {
              mark = 'unit'
            } else if (statement.type === 'ExportNamedDeclaration') {
              if (statement.declaration !== null) {
                mark = declarationMark(statement.declaration, importedNames, invokesEffectAtModuleScope)
              } else if (statement.source !== null) {
                mark = 'surface'
              } else {
                for (const specifier of statement.specifiers) {
                  const localName = localNameOf(specifier)
                  if (importedNames.has(localName)) {
                    mark = 'surface'
                    break
                  }
                  const declared = declaredKinds.get(localName)
                  if (declared === 'behaviour' || declared === undefined) {
                    mark = 'unit'
                    break
                  }
                }
              }
            }
            if (mark === null || seen === 'both') continue

            const report = (): void => {
              const defaultExportName = (): string => {
                if (statement.type !== 'ExportDefaultDeclaration') return ''
                const declaration = statement.declaration
                if (
                  (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') &&
                  declaration.id !== null
                ) {
                  return declaration.id.name
                }
                return 'default export'
              }
              const name = statement.type === 'ExportDefaultDeclaration'
                ? defaultExportName()
                : exportedName(
                  statement.type === 'ExportNamedDeclaration' ? statement.declaration : null,
                  statement.type === 'ExportNamedDeclaration' ? statement.specifiers : [],
                  statement.type === 'ExportNamedDeclaration' ? statement.source : null,
                  statement.type === 'ExportAllDeclaration' ? allExportedLabel(statement.exported) : null,
                )
              context.report({
                node: statement,
                messageId: 'entrySurfaceAndUnit',
                data: {
                  name,
                  expected: ENTRY_MIX_EXPECTED,
                  actual: ENTRY_MIX_ACTUAL,
                  fix: ENTRY_MIX_FIX,
                },
              })
            }

            if (mark === 'surface') {
              if (seen === 'unit') {
                report()
                seen = 'both'
              } else {
                seen = 'surface'
              }
            } else if (seen === 'surface') {
              report()
              seen = 'both'
            } else {
              seen = 'unit'
            }
          }
          return
        }

        for (const statement of node.body) {
          if (statement.type === 'ExportAllDeclaration') {
            context.report({
              node: statement,
              messageId: 'nonEntryForeignReexport',
              data: {
                name: exportedName(null, [], statement.source, allExportedLabel(statement.exported)),
                expected: NON_ENTRY_REEXPORT_EXPECTED,
                actual: NON_ENTRY_REEXPORT_ACTUAL,
                fix: NON_ENTRY_REEXPORT_FIX,
              },
            })
            continue
          }
          if (statement.type !== 'ExportNamedDeclaration') continue
          if (statement.source !== null) {
            context.report({
              node: statement,
              messageId: 'nonEntryForeignReexport',
              data: {
                name: exportedName(null, statement.specifiers, statement.source, null),
                expected: NON_ENTRY_REEXPORT_EXPECTED,
                actual: NON_ENTRY_REEXPORT_ACTUAL,
                fix: NON_ENTRY_REEXPORT_FIX,
              },
            })
            continue
          }
          const foreignSpecifier = statement.specifiers.find(
            (specifier) => !declaredKinds.has(localNameOf(specifier)),
          )
          if (foreignSpecifier !== undefined) {
            context.report({
              node: statement,
              messageId: 'nonEntryForeignReexport',
              data: {
                name: exportedName(null, statement.specifiers, null, null),
                expected: NON_ENTRY_REEXPORT_EXPECTED,
                actual: NON_ENTRY_REEXPORT_ACTUAL,
                fix: NON_ENTRY_REEXPORT_FIX,
              },
            })
          }
        }
      },
    }
  },
})
