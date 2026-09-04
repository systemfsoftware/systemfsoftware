import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  ANONYMOUS_EXPORT_ACTUAL,
  MAX_STEM_TOKENS,
  MECHANISM_STEM_ACTUAL,
  MECHANISM_STEM_EXPECTED,
  MECHANISM_STEM_FIX,
  MECHANISM_TOKENS,
  meta,
  STEM_EXPORT_MISMATCH_ACTUAL,
  STEM_EXPORT_MISMATCH_EXPECTED,
  STEM_EXPORT_MISMATCH_FIX,
  STEM_NOT_KEBAB_ACTUAL,
  STEM_NOT_KEBAB_EXPECTED,
  STEM_NOT_KEBAB_FIX,
  STEM_PATTERN,
  STEM_TOO_SHORT_ACTUAL,
  STEM_TOO_SHORT_EXPECTED,
  STEM_TOO_SHORT_FIX,
  VACANT_FIRST_TOKEN_ACTUAL,
  VACANT_FIRST_TOKEN_EXPECTED,
  VACANT_FIRST_TOKEN_FIX,
  VACANT_FIRST_TOKENS,
  WORKFLOW_SUFFIX,
} from './damp-workflow-stem.config.js'
import { WORKFLOW_FILE_BASENAME } from './make-file-location.config.js'
import { SCHEMA_DECLARATION_MEMBERS, SCHEMA_USE_MEMBERS } from './workflow-file-export-topology.config.js'

export type MessageIds =
  | 'stemNotKebab'
  | 'stemTooShort'
  | 'vacantFirstToken'
  | 'mechanismStem'
  | 'stemExportMismatch'

type BindingKind = 'schema' | 'vocabulary' | 'value'

interface ValueExport {
  readonly name: string | null
  readonly node: ESTree.Node
}

const basenameOf = (filename: string): string => {
  const segments = filename.split('/')
  return segments[segments.length - 1] ?? filename
}

const camelCaseOf = (tokens: readonly string[]): string =>
  (tokens[0] ?? '') + tokens.slice(1).map((token) => token.slice(0, 1).toUpperCase() + token.slice(1)).join('')

const unwrap = (node: ESTree.Node): ESTree.Node => {
  switch (node.type) {
    case 'TSAsExpression':
    case 'TSTypeAssertion':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSInstantiationExpression':
      return unwrap(node.expression)
    case 'ChainExpression':
      return unwrap(node.expression)
    default:
      return node
  }
}

const schemaMemberOf = (node: ESTree.Node | null): string | null => {
  if (node === null) return null
  const inner = unwrap(node)
  if (inner.type === 'CallExpression') return schemaMemberOf(inner.callee)
  if (
    inner.type === 'MemberExpression' &&
    !inner.computed &&
    inner.property.type === 'Identifier' &&
    inner.object.type === 'Identifier' &&
    (inner.object.name === 'S' || inner.object.name === 'Schema')
  ) {
    return inner.property.name
  }
  return null
}

const isSchemaDeclaration = (node: ESTree.Node | null): boolean => {
  const name = schemaMemberOf(node)
  return name !== null && SCHEMA_DECLARATION_MEMBERS[name] === true
}

const isCodecUse = (node: ESTree.Node | null): boolean => {
  const name = schemaMemberOf(node)
  return name !== null && SCHEMA_USE_MEMBERS[name] === true
}

const valueExportsOf = (program: ESTree.Program): readonly ValueExport[] => {
  const importedBindings: Record<string, true> = {}
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') continue
    for (const specifier of statement.specifiers) {
      importedBindings[specifier.local.name] = true
    }
  }

  const bindings = new Map<string, BindingKind>()
  const recordDeclaration = (declaration: ESTree.Node | null): void => {
    if (declaration === null) return
    switch (declaration.type) {
      case 'ClassDeclaration':
        if (declaration.id !== null) {
          bindings.set(declaration.id.name, isSchemaDeclaration(declaration.superClass) ? 'schema' : 'value')
        }
        break
      case 'VariableDeclaration':
        for (const declarator of declaration.declarations) {
          if (declarator.id.type !== 'Identifier') continue
          bindings.set(
            declarator.id.name,
            isSchemaDeclaration(declarator.init) && !isCodecUse(declarator.init) ? 'schema' : 'value',
          )
        }
        break
      case 'FunctionDeclaration':
        if (declaration.id !== null) bindings.set(declaration.id.name, 'value')
        break
      case 'TSEnumDeclaration':
      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
        bindings.set(declaration.id.name, 'vocabulary')
        break
      default:
        break
    }
  }

  for (const statement of program.body) {
    if (statement.type === 'ExportNamedDeclaration') recordDeclaration(statement.declaration)
    else if (statement.type === 'ExportDefaultDeclaration') recordDeclaration(statement.declaration)
    else recordDeclaration(statement)
  }

  const values: ValueExport[] = []

  const kindOfInit = (init: ESTree.Node | null): BindingKind => {
    if (init !== null && init.type === 'Identifier') {
      const kind = bindings.get(init.name)
      if (kind !== undefined) return kind
    }
    if (isCodecUse(init)) return 'value'
    if (isSchemaDeclaration(init)) return 'schema'
    return 'value'
  }

  const judgeDeclaration = (declaration: ESTree.Node): void => {
    switch (declaration.type) {
      case 'ClassDeclaration':
        if (!isSchemaDeclaration(declaration.superClass)) {
          values.push({ name: declaration.id?.name ?? null, node: declaration.id ?? declaration })
        }
        break
      case 'VariableDeclaration':
        for (const declarator of declaration.declarations) {
          if (declarator.id.type !== 'Identifier') {
            values.push({ name: null, node: declarator.id })
            continue
          }
          if (kindOfInit(declarator.init) !== 'schema') {
            values.push({ name: declarator.id.name, node: declarator.id })
          }
        }
        break
      case 'FunctionDeclaration':
        values.push({ name: declaration.id?.name ?? null, node: declaration.id ?? declaration })
        break
      case 'TSEnumDeclaration':
      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
        break
      default:
        if (declaration.type === 'Identifier') {
          const kind = bindings.get(declaration.name)
          if (kind === 'schema' || kind === 'vocabulary') break
          values.push({ name: declaration.name, node: declaration })
          break
        }
        if (kindOfInit(declaration) !== 'schema') values.push({ name: null, node: declaration })
    }
  }

  for (const statement of program.body) {
    switch (statement.type) {
      case 'ExportAllDeclaration':
        break
      case 'ExportNamedDeclaration':
        if (statement.source !== null) break
        if (statement.declaration !== null) {
          judgeDeclaration(statement.declaration)
          break
        }
        for (const specifier of statement.specifiers) {
          if (specifier.type !== 'ExportSpecifier' || specifier.local.type !== 'Identifier') continue
          const kind = bindings.get(specifier.local.name)
          if (kind === 'schema' || kind === 'vocabulary') continue
          if (importedBindings[specifier.local.name] === true) continue
          values.push({
            name: specifier.exported.type === 'Identifier' ? specifier.exported.name : specifier.local.name,
            node: specifier,
          })
        }
        break
      case 'ExportDefaultDeclaration':
        judgeDeclaration(statement.declaration)
        break
      default:
        break
    }
  }

  return values
}

export const dampWorkflowStem = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    if (!WORKFLOW_FILE_BASENAME.test(basename)) return {}
    const stem = basename.slice(0, -WORKFLOW_SUFFIX.length)
    return {
      Program(program: ESTree.Program) {
        const tokens = stem.split('-')
        if (!STEM_PATTERN.test(stem) || tokens.length > MAX_STEM_TOKENS) {
          context.report({
            node: program,
            messageId: 'stemNotKebab',
            data: {
              name: basename,
              expected: STEM_NOT_KEBAB_EXPECTED,
              actual: STEM_NOT_KEBAB_ACTUAL,
              fix: STEM_NOT_KEBAB_FIX,
            },
          })
          return
        }
        if (tokens.length === 1) {
          context.report({
            node: program,
            messageId: 'stemTooShort',
            data: {
              name: basename,
              expected: STEM_TOO_SHORT_EXPECTED,
              actual: STEM_TOO_SHORT_ACTUAL,
              fix: STEM_TOO_SHORT_FIX,
            },
          })
          return
        }
        const first = tokens[0] ?? ''
        if (VACANT_FIRST_TOKENS[first] === true) {
          context.report({
            node: program,
            messageId: 'vacantFirstToken',
            data: {
              name: basename,
              expected: VACANT_FIRST_TOKEN_EXPECTED,
              actual: VACANT_FIRST_TOKEN_ACTUAL,
              fix: VACANT_FIRST_TOKEN_FIX,
            },
          })
          return
        }
        if (MECHANISM_TOKENS[first] === true || (tokens.length === 1 && MECHANISM_TOKENS[stem] === true)) {
          context.report({
            node: program,
            messageId: 'mechanismStem',
            data: {
              name: basename,
              expected: MECHANISM_STEM_EXPECTED,
              actual: MECHANISM_STEM_ACTUAL,
              fix: MECHANISM_STEM_FIX,
            },
          })
          return
        }
        const values = valueExportsOf(program)
        if (values.length !== 1) return
        const single = values[0]
        if (single === undefined) return
        if (single.name === null) {
          context.report({
            node: single.node,
            messageId: 'stemExportMismatch',
            data: {
              name: basename,
              expected: STEM_EXPORT_MISMATCH_EXPECTED,
              actual: ANONYMOUS_EXPORT_ACTUAL,
              fix: STEM_EXPORT_MISMATCH_FIX,
            },
          })
          return
        }
        if (camelCaseOf(tokens) !== single.name) {
          context.report({
            node: single.node,
            messageId: 'stemExportMismatch',
            data: {
              name: basename,
              expected: STEM_EXPORT_MISMATCH_EXPECTED,
              actual: STEM_EXPORT_MISMATCH_ACTUAL,
              fix: STEM_EXPORT_MISMATCH_FIX,
            },
          })
        }
      },
    }
  },
})
