import type { ESTree } from '@oxlint/plugins'
import { SCHEMA_DECLARATION_MEMBERS, SCHEMA_USE_MEMBERS } from './workflow-file-export-topology.config.js'

export const basenameOf = (filename: string): string => {
  const segments = filename.split('/')
  return segments[segments.length - 1] ?? filename
}

export const unwrap = (node: ESTree.Node): ESTree.Node => {
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

export const schemaMemberOf = (node: ESTree.Node | null): string | null => {
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

export const isSchemaDeclaration = (node: ESTree.Node | null): boolean => {
  const name = schemaMemberOf(node)
  return name !== null && SCHEMA_DECLARATION_MEMBERS[name] === true
}

export const isCodecUse = (node: ESTree.Node | null): boolean => {
  const name = schemaMemberOf(node)
  return name !== null && SCHEMA_USE_MEMBERS[name] === true
}

export type BindingKind = 'schema' | 'vocabulary' | 'value'

export interface ExportWalkValue {
  readonly name: string | null
  readonly node: ESTree.Node
}

export const walkExportedValues = (
  program: ESTree.Program,
  handlers: {
    onValue: (value: ExportWalkValue) => void
    onReexport?: (target: ESTree.Node, source: string) => void
  },
): void => {
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
          handlers.onValue({ name: declaration.id?.name ?? null, node: declaration.id ?? declaration })
        }
        break
      case 'VariableDeclaration':
        for (const declarator of declaration.declarations) {
          if (declarator.id.type !== 'Identifier') {
            handlers.onValue({ name: null, node: declarator.id })
            continue
          }
          if (kindOfInit(declarator.init) !== 'schema') {
            handlers.onValue({ name: declarator.id.name, node: declarator.id })
          }
        }
        break
      case 'FunctionDeclaration':
        handlers.onValue({ name: declaration.id?.name ?? null, node: declaration.id ?? declaration })
        break
      case 'TSEnumDeclaration':
      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
        break
      default:
        if (declaration.type === 'Identifier') {
          const kind = bindings.get(declaration.name)
          if (kind === 'schema' || kind === 'vocabulary') break
          handlers.onValue({ name: declaration.name, node: declaration })
          break
        }
        if (kindOfInit(declaration) !== 'schema') handlers.onValue({ name: null, node: declaration })
    }
  }

  for (const statement of program.body) {
    switch (statement.type) {
      case 'ExportAllDeclaration':
        handlers.onReexport?.(statement, statement.source.value)
        break
      case 'ExportNamedDeclaration':
        if (statement.source !== null) {
          handlers.onReexport?.(statement, statement.source.value)
          break
        }
        if (statement.declaration !== null) {
          judgeDeclaration(statement.declaration)
          break
        }
        for (const specifier of statement.specifiers) {
          if (specifier.type !== 'ExportSpecifier' || specifier.local.type !== 'Identifier') continue
          const kind = bindings.get(specifier.local.name)
          if (kind === 'schema' || kind === 'vocabulary') continue
          if (handlers.onReexport !== undefined && importedBindings[specifier.local.name] === true) {
            handlers.onReexport(specifier, `the imported binding ${specifier.local.name}`)
            continue
          }
          if (importedBindings[specifier.local.name] === true) continue
          handlers.onValue({
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
}
