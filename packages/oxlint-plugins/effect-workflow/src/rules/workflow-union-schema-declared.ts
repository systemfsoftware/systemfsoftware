import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { getClassName, isTaggedClassOrError } from './tagged-class.js'
import { meta } from './workflow-union-schema-declared.config.js'

export type MessageIds = 'bareUnionAlias'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

const declaredVariantsIn = (
  ann: ESTree.TSUnionType,
  known: Set<string | undefined>,
): string[] => {
  const names: string[] = []
  for (const member of ann.types) {
    if (member.type !== 'TSTypeReference') continue
    if (member.typeName.type !== 'Identifier') continue
    if (!known.has(member.typeName.name)) continue
    names.push(member.typeName.name)
  }
  return names
}

type PendingAlias = { node: ESTree.Node; name: string; ann: ESTree.TSUnionType }

export const workflowUnionSchemaDeclared = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isWorkflowFile(filename)) return {}

    const variantNames = new Set<string | undefined>()
    const aliases: PendingAlias[] = []

    return {
      ClassDeclaration(node: ESTree.Class) {
        if (!node.superClass) return
        if (node.superClass.type !== 'CallExpression') return
        if (!isTaggedClassOrError(node.superClass)) return
        variantNames.add(getClassName(node))
      },
      TSTypeAliasDeclaration(node: ESTree.TSTypeAliasDeclaration) {
        const ann = node.typeAnnotation
        if (ann.type !== 'TSUnionType') return
        aliases.push({ node, name: node.id.name, ann })
      },
      'Program:exit'() {
        for (const alias of aliases) {
          const variants = declaredVariantsIn(alias.ann, variantNames)
          if (variants.length < 2) continue
          context.report({
            node: alias.node,
            messageId: 'bareUnionAlias',
            data: {
              name: alias.name,
              expected: `const ${alias.name} = S.Union(${
                variants.join(', ')
              }) paired with type ${alias.name} = S.Schema.Type<typeof ${alias.name}>`,
              actual:
                `${alias.name} is a bare TS type alias over ${variants.length} schema variants, so no runtime schema exists`,
              fix: `replace the alias with const ${alias.name} = S.Union(${
                variants.join(', ')
              }) and type ${alias.name} = S.Schema.Type<typeof ${alias.name}>`,
            },
          })
        }
      },
    }
  },
})
