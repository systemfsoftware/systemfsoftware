import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta } from './adapter-layer-required.config.js'

export type MessageIds = 'layerExportRequired'

const isAdapterFile = (filename: string): boolean => filename.endsWith('.adapter.ts')

const isLayerCall = (node: ESTree.CallExpression): boolean => {
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return false
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'Layer') return false
  if (callee.property.type !== 'Identifier') return false
  return callee.property.name === 'effect' || callee.property.name === 'succeed'
}

export const adapterLayerRequired = defineRule({
  meta,
  create(context: Context) {
    if (!isAdapterFile(context.filename)) return {}

    const program = context.sourceCode.ast
    const layerConstNames = new Set<string>()
    const exportedNames = new Set<string>()
    let defaultExport: ESTree.Node | null = null

    for (const stmt of program.body) {
      if (stmt.type === 'VariableDeclaration') {
        for (const decl of stmt.declarations) {
          if (decl.id.type !== 'Identifier') continue
          if (decl.init?.type === 'CallExpression' && isLayerCall(decl.init)) {
            layerConstNames.add(decl.id.name)
          }
        }
        continue
      }

      if (stmt.type === 'ExportNamedDeclaration') {
        if (stmt.exportKind === 'type') continue

        const declaration = stmt.declaration
        if (declaration !== null && declaration.type === 'VariableDeclaration') {
          for (const decl of declaration.declarations) {
            if (decl.id.type !== 'Identifier') continue
            exportedNames.add(decl.id.name)
            if (decl.init?.type === 'CallExpression' && isLayerCall(decl.init)) {
              layerConstNames.add(decl.id.name)
            }
          }
          continue
        }

        for (const spec of stmt.specifiers) {
          if (spec.exportKind === 'type') continue
          if (spec.local.type === 'Identifier') exportedNames.add(spec.local.name)
          if (spec.exported.type === 'Identifier') exportedNames.add(spec.exported.name)
        }
        continue
      }

      if (stmt.type === 'ExportDefaultDeclaration') {
        defaultExport = stmt.declaration
      }
    }

    let defaultIsLayer = false
    if (defaultExport?.type === 'CallExpression') defaultIsLayer = isLayerCall(defaultExport)
    if (defaultExport?.type === 'Identifier') defaultIsLayer = layerConstNames.has(defaultExport.name)

    const hasLayerExport = defaultIsLayer || [...exportedNames].some((name) => layerConstNames.has(name))
    if (hasLayerExport) return {}

    return {
      'Program:exit'() {
        const exportedList = [...exportedNames]
        context.report({
          node: program.body[0] ?? program,
          messageId: 'layerExportRequired',
          data: {
            name: 'the adapter Layer',
            expected: 'an exported const initialized with Layer.effect or Layer.succeed, providing the port',
            actual: exportedList.length === 0
              ? 'no exported Layer — the file exports nothing'
              : `no exported Layer — the file exports: ${exportedList.join(', ')}`,
            fix:
              'export the port Layer — Layer.effect(Port, make) for live, Layer.succeed(Port, impl) for a default or stub',
          },
        })
      },
    }
  },
})
