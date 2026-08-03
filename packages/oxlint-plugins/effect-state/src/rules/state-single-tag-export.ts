import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { DEFAULT_EXPORT_PRIMITIVE_NAME } from './state-primitives.config.js'
import { meta } from './state-single-tag-export.config.js'

export type MessageIds = 'multipleTagExports'

const MULTIPLE_TAG_EXPORTS_MESSAGE_ID: MessageIds = 'multipleTagExports'

const isStateFile = (filename: string): boolean => filename.endsWith('.state.ts')

const calleeIsContextTag = (callee: ESTree.CallExpression['callee']): boolean => {
  if (callee.type !== 'MemberExpression') return false
  const object = callee.object
  const property = callee.property
  if (object.type !== 'Identifier' || object.name !== 'Context') return false
  return property.type === 'Identifier' && property.name === 'Tag'
}

const isContextTagConstruction = (node: ESTree.Node): boolean => {
  if (node.type === 'CallExpression') return calleeIsContextTag(node.callee) || isContextTagConstruction(node.callee)
  return false
}

type ExportedTag = {
  name: string
  node: ESTree.Node
}

const tagFromClass = (node: ESTree.Class): ExportedTag | null => {
  if (node.superClass === null || !isContextTagConstruction(node.superClass)) return null
  return { name: node.id === null ? DEFAULT_EXPORT_PRIMITIVE_NAME : node.id.name, node }
}

const tagFromDeclarator = (declarator: ESTree.VariableDeclarator): ExportedTag | null => {
  if (declarator.id.type !== 'Identifier') return null
  const init = declarator.init
  if (init === null || !isContextTagConstruction(init)) return null
  return { name: declarator.id.name, node: declarator }
}

const collectDeclaratorTags = (declaration: ESTree.VariableDeclaration, tags: ExportedTag[]): void => {
  for (const declarator of declaration.declarations) {
    const tag = tagFromDeclarator(declarator)
    if (tag !== null) tags.push(tag)
  }
}

const collectTagsFromNamedExport = (
  declaration: ESTree.ExportNamedDeclaration['declaration'],
  tags: ExportedTag[],
): void => {
  if (declaration === null) return
  if (declaration.type === 'ClassDeclaration') {
    const tag = tagFromClass(declaration)
    if (tag !== null) tags.push(tag)
    return
  }
  if (declaration.type === 'VariableDeclaration') collectDeclaratorTags(declaration, tags)
}

const collectTagsFromDefaultExport = (node: ESTree.ExportDefaultDeclaration, tags: ExportedTag[]): void => {
  const declaration = node.declaration
  if (declaration.type === 'ClassDeclaration') {
    const tag = tagFromClass(declaration)
    if (tag !== null) tags.push(tag)
    return
  }
  if (isContextTagConstruction(declaration)) tags.push({ name: DEFAULT_EXPORT_PRIMITIVE_NAME, node: declaration })
}

const exportedTags = (program: ESTree.Program): ExportedTag[] => {
  const tags: ExportedTag[] = []
  for (const statement of program.body) {
    if (statement.type === 'ExportNamedDeclaration') collectTagsFromNamedExport(statement.declaration, tags)
    if (statement.type === 'ExportDefaultDeclaration') collectTagsFromDefaultExport(statement, tags)
  }
  return tags
}

export const stateSingleTagExport = defineRule({
  meta,
  create(context: Context) {
    if (!isStateFile(context.filename)) return {}

    return {
      'Program:exit'(node: ESTree.Program) {
        const tags = exportedTags(node)
        const [, ...excess] = tags
        excess.forEach((tag, index) => {
          context.report({
            node: tag.node,
            messageId: MULTIPLE_TAG_EXPORTS_MESSAGE_ID,
            data: {
              name: tag.name,
              expected:
                'at most one exported Context.Tag per *.state.ts (a runtime cell may publish its handle directly and skip the Tag entirely)',
              actual: `tag ${index + 2} of ${tags.length}`,
              fix:
                'delete the Tag nothing consumes; if both are consumed they are two state cells, so split them into one *.state.ts per Tag; merge them only when both name the same state',
            },
          })
        })
      },
    }
  },
})
