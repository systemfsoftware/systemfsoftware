import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta, SCHEMA_SUFFIX } from './schema-exports-only-schemas.config.js'

export type MessageIds = 'nonSchemaExport'

const getMemberPropertyName = (node: ESTree.MemberExpression): string | undefined => {
  const { property } = node
  if (property.type === 'Identifier') return property.name
  if (property.type === 'Literal' && typeof property.value === 'string') return property.value
  return undefined
}

const isSchemaMemberExpression = (node: ESTree.Node): boolean => {
  if (node.type !== 'MemberExpression') return false
  let object: ESTree.Node = node.object
  while (object.type === 'MemberExpression') {
    object = object.object
  }
  return object.type === 'Identifier' && (object.name === 'S' || object.name === 'Schema')
}

const isSchemaExpression = (node: ESTree.Node | null | undefined): boolean => {
  if (node == null) return false
  if (isSchemaMemberExpression(node)) return true

  if (node.type === 'CallExpression') {
    if (node.callee.type === 'Identifier' && node.callee.name === 'pipe') {
      return isSchemaExpression(node.arguments[0])
    }
    if (
      node.callee.type === 'MemberExpression' &&
      getMemberPropertyName(node.callee) === 'pipe'
    ) {
      return isSchemaExpression(node.callee.object)
    }
    return isSchemaExpression(node.callee)
  }

  return false
}

const isSchemaClassSuper = (node: ESTree.Node | null): boolean => {
  if (node === null) return false
  let current: ESTree.Node = node
  while (current.type === 'CallExpression') {
    if (isSchemaMemberExpression(current.callee)) {
      const name = getMemberPropertyName(current.callee as ESTree.MemberExpression)
      if (name === 'TaggedClass' || name === 'TaggedError' || name === 'Class') return true
    }
    current = current.callee
  }
  return false
}

const reportViolation = (
  context: Context,
  node: ESTree.Node,
  name: string,
  actual: string,
  fix: string,
) => {
  context.report({
    node,
    messageId: 'nonSchemaExport',
    data: {
      name,
      expected: 'a *.schema.ts file to export only schemas and type declarations',
      actual,
      fix,
    },
  })
}

const checkVariableDeclaration = (
  context: Context,
  declaration: ESTree.VariableDeclaration,
) => {
  for (const declarator of declaration.declarations) {
    if (isSchemaExpression(declarator.init)) continue

    const name = declarator.id.type === 'Identifier' ? declarator.id.name : '<unknown>'
    reportViolation(
      context,
      declarator,
      `export const ${name}`,
      'a value that is not a schema expression',
      'define it with S.* or Schema.* from effect, or move it to a non-schema cell',
    )
  }
}

const checkNamedDeclaration = (
  context: Context,
  node: ESTree.ExportNamedDeclaration,
) => {
  const declaration = node.declaration
  if (declaration === null) {
    for (const specifier of node.specifiers) {
      const localName = context.sourceCode.getText(specifier.local)
      const exportedName = context.sourceCode.getText(specifier.exported)
      reportViolation(
        context,
        specifier,
        exportedName === localName ? `export { ${localName} }` : `export { ${localName} as ${exportedName} }`,
        'a re-export that cannot be verified as a schema',
        'move the value to a non-schema cell or keep the schema inline',
      )
    }
    return
  }

  if (declaration.type === 'TSTypeAliasDeclaration' || declaration.type === 'TSInterfaceDeclaration') return

  switch (declaration.type) {
    case 'VariableDeclaration': {
      checkVariableDeclaration(context, declaration)
      return
    }
    case 'ClassDeclaration':
    case 'ClassExpression': {
      if (isSchemaClassSuper(declaration.superClass)) return
      reportViolation(
        context,
        declaration,
        'export class',
        'a class that does not extend a Schema constructor',
        'extend S.TaggedClass, S.TaggedError, or Schema.Class, or move the class to a non-schema cell',
      )
      return
    }
    case 'FunctionDeclaration': {
      reportViolation(
        context,
        declaration,
        'export function',
        'a function export',
        'move the function to a non-schema cell',
      )
      return
    }
    case 'TSEnumDeclaration': {
      reportViolation(
        context,
        declaration,
        'export enum',
        'an enum export',
        'replace it with S.Literal or move it to a non-schema cell',
      )
      return
    }
    default:
      reportViolation(
        context,
        declaration,
        'export declaration',
        'an unsupported export kind',
        'move it to a non-schema cell',
      )
  }
}

const checkDefaultDeclaration = (
  context: Context,
  node: ESTree.ExportDefaultDeclaration,
) => {
  const declaration = node.declaration
  const name = declaration.type === 'Identifier' ? declaration.name : '<anonymous>'
  reportViolation(
    context,
    node,
    `export default ${name}`,
    'a default export',
    'use named schema exports instead',
  )
}

const checkAllDeclaration = (
  context: Context,
  node: ESTree.ExportAllDeclaration,
) => {
  reportViolation(
    context,
    node,
    `export * from '${node.source.value}'`,
    'a wildcard re-export',
    're-export only the schemas you need, or move non-schema exports out of the target file',
  )
}

export const schemaExportsOnlySchemas = defineRule({
  meta,
  create(context: Context) {
    if (!context.filename.endsWith(SCHEMA_SUFFIX)) return {}

    return {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        checkNamedDeclaration(context, node)
      },
      ExportDefaultDeclaration(node: ESTree.ExportDefaultDeclaration) {
        checkDefaultDeclaration(context, node)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        checkAllDeclaration(context, node)
      },
    }
  },
})
