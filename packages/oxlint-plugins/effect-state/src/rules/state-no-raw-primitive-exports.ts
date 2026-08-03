import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta } from './state-no-raw-primitive-exports.config.js'
import { DEFAULT_EXPORT_PRIMITIVE_NAME, RUNTIME_HANDLE_KINDS } from './state-primitives.config.js'
import { type ModuleScopePrimitive, moduleScopeStatePrimitives, statePrimitiveKind } from './state-primitives.js'
export type MessageIds = 'rawPrimitiveExport'

const RAW_PRIMITIVE_EXPORT_MESSAGE_ID: MessageIds = 'rawPrimitiveExport'

const isStateFile = (filename: string): boolean => filename.endsWith('.state.ts')

const moduleExportName = (name: ESTree.ModuleExportName): string => 'name' in name ? name.name : name.value

const reportRawExport = (
  context: Context,
  node: ESTree.Node,
  primitive: ModuleScopePrimitive,
): void => {
  context.report({
    node,
    messageId: RAW_PRIMITIVE_EXPORT_MESSAGE_ID,
    data: {
      name: primitive.name,
      expected: 'a domain-typed surface — a function returning Effect<A, E, R> (withLock, joinInFlight, ask, tell)',
      actual: `the raw ${primitive.kind} exported directly`,
      fix:
        'keep the primitive module-scope but private; export a withLock/joinInFlight-style method plus the Context.Tag',
    },
  })
}

export const stateNoRawPrimitiveExports = defineRule({
  meta,
  create(context: Context) {
    if (!isStateFile(context.filename)) return {}

    return {
      'Program:exit'(node: ESTree.Program) {
        const primitives = moduleScopeStatePrimitives(node).filter((primitive) =>
          !RUNTIME_HANDLE_KINDS.has(primitive.kind)
        )
        const primitiveByName = new Map<string, ModuleScopePrimitive>(
          primitives.map((primitive) => [primitive.name, primitive] as const),
        )

        for (const statement of node.body) {
          if (statement.type !== 'ExportNamedDeclaration') continue
          const declaration = statement.declaration
          if (declaration?.type === 'VariableDeclaration') {
            for (const declarator of declaration.declarations) {
              if (declarator.id.type !== 'Identifier') continue
              const primitive = primitiveByName.get(declarator.id.name)
              if (primitive === undefined) continue
              reportRawExport(context, declarator, primitive)
            }
          }
          for (const specifier of statement.specifiers) {
            const primitive = primitiveByName.get(moduleExportName(specifier.local))
            if (primitive === undefined) continue
            reportRawExport(context, specifier, primitive)
          }
        }

        for (const statement of node.body) {
          if (statement.type !== 'ExportDefaultDeclaration') continue
          const declaration = statement.declaration
          if (declaration.type === 'Identifier') {
            const primitive = primitiveByName.get(declaration.name)
            if (primitive === undefined) continue
            reportRawExport(context, declaration, primitive)
            continue
          }
          const kind = statePrimitiveKind(declaration)
          if (kind === null || RUNTIME_HANDLE_KINDS.has(kind)) continue
          reportRawExport(context, declaration, { name: DEFAULT_EXPORT_PRIMITIVE_NAME, kind, node: declaration })
        }
      },
    }
  },
})
