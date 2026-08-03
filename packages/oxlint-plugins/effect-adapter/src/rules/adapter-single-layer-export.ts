import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { meta, Options } from './adapter-single-layer-export.config.js'

export type MessageIds = 'tooManyLayerExports' | 'leakedHelper'

const isAdapterFile = (filename: string): boolean => filename.endsWith('.adapter.ts')

const isLayerCall = (node: ESTree.CallExpression): boolean => {
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return false
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'Layer') return false
  if (callee.property.type !== 'Identifier') return false
  return callee.property.name === 'effect' || callee.property.name === 'succeed'
}

const isFunctionExpression = (node: ESTree.Node | null | undefined): boolean => {
  if (node === null || node === undefined) return false
  return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression'
}

const initIsFunction = (decl: ESTree.VariableDeclarator): boolean => isFunctionExpression(decl.init)

type HelperExport = { node: ESTree.Node; name: string }
type ReportSpec = {
  node: ESTree.Node
  messageId: 'tooManyLayerExports' | 'leakedHelper'
  data: Record<string, string>
}

type Collected = {
  layerConstNames: Set<string>
  arrowFnConstNames: Set<string>
  namedFunctionDeclarationNames: Set<string>
  exportedLayerNodes: ESTree.Node[]
  exportedFunctionHelpers: HelperExport[]
  exportedValueHelpers: HelperExport[]
  exportedOpaqueReexports: HelperExport[]
  defaultExport: ESTree.Node | null
  defaultIsLayer: boolean
  defaultIsFunctionHelper: boolean
}

const collectEmpty = (): Collected => ({
  layerConstNames: new Set<string>(),
  arrowFnConstNames: new Set<string>(),
  namedFunctionDeclarationNames: new Set<string>(),
  exportedLayerNodes: [],
  exportedFunctionHelpers: [],
  exportedValueHelpers: [],
  exportedOpaqueReexports: [],
  defaultExport: null,
  defaultIsLayer: false,
  defaultIsFunctionHelper: false,
})

const collectFromProgram = (program: ESTree.Program): Collected => {
  const state = collectEmpty()

  for (const stmt of program.body) {
    if (stmt.type === 'ExportAllDeclaration') {
      if (stmt.exportKind === 'type') continue
      const name = stmt.exported?.type === 'Identifier' ? stmt.exported.name : stmt.source.value
      state.exportedOpaqueReexports.push({ node: stmt, name })
      continue
    }

    if (stmt.type === 'FunctionDeclaration' && stmt.id !== null) {
      state.namedFunctionDeclarationNames.add(stmt.id.name)
      continue
    }

    if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations) {
        if (decl.id.type !== 'Identifier') continue
        if (decl.init?.type === 'CallExpression' && isLayerCall(decl.init)) {
          state.layerConstNames.add(decl.id.name)
          continue
        }
        if (initIsFunction(decl)) {
          state.arrowFnConstNames.add(decl.id.name)
        }
      }
      continue
    }

    if (stmt.type === 'ExportNamedDeclaration') {
      if (stmt.exportKind === 'type') continue

      const declaration = stmt.declaration
      if (declaration !== null) {
        if (declaration.type === 'FunctionDeclaration' && declaration.id !== null) {
          const name = declaration.id.name
          state.namedFunctionDeclarationNames.add(name)
          state.exportedFunctionHelpers.push({ node: declaration, name })
          continue
        }

        if (declaration.type === 'VariableDeclaration') {
          for (const decl of declaration.declarations) {
            if (decl.id.type !== 'Identifier') continue
            if (decl.init?.type === 'CallExpression' && isLayerCall(decl.init)) {
              state.layerConstNames.add(decl.id.name)
              state.exportedLayerNodes.push(decl)
              continue
            }
            if (initIsFunction(decl)) {
              state.arrowFnConstNames.add(decl.id.name)
              state.exportedFunctionHelpers.push({ node: decl, name: decl.id.name })
              continue
            }
            state.exportedValueHelpers.push({ node: decl, name: decl.id.name })
          }
          continue
        }

        continue
      }

      for (const spec of stmt.specifiers) {
        if (spec.exportKind === 'type') continue
        if (spec.local.type !== 'Identifier') continue
        const localName = spec.local.name
        const exportedName = spec.exported.type === 'Identifier' ? spec.exported.name : localName
        if (stmt.source !== null) {
          state.exportedOpaqueReexports.push({ node: spec, name: exportedName })
          continue
        }
        if (state.layerConstNames.has(localName)) {
          state.exportedLayerNodes.push(spec)
          continue
        }
        if (state.arrowFnConstNames.has(localName)) {
          state.exportedFunctionHelpers.push({ node: spec, name: exportedName })
          continue
        }
        if (state.namedFunctionDeclarationNames.has(localName)) {
          state.exportedFunctionHelpers.push({ node: spec, name: exportedName })
        }
      }
      continue
    }

    if (stmt.type === 'ExportDefaultDeclaration') {
      state.defaultExport = stmt.declaration
      const decl = stmt.declaration
      if (decl.type === 'CallExpression' && isLayerCall(decl)) {
        state.defaultIsLayer = true
        continue
      }
      if (decl.type === 'FunctionDeclaration') {
        state.defaultIsFunctionHelper = true
        if (decl.id) state.namedFunctionDeclarationNames.add(decl.id.name)
        continue
      }
      if (isFunctionExpression(decl)) {
        state.defaultIsFunctionHelper = true
        continue
      }
      if (decl.type === 'Identifier') {
        if (state.layerConstNames.has(decl.name)) {
          state.defaultIsLayer = true
          continue
        }
        if (state.arrowFnConstNames.has(decl.name) || state.namedFunctionDeclarationNames.has(decl.name)) {
          state.defaultIsFunctionHelper = true
        }
      }
    }
  }

  return state
}

const buildReports = (state: Collected, program: ESTree.Program): ReportSpec[] => {
  const reports: ReportSpec[] = []

  const exportedLayerCount = state.exportedLayerNodes.length + (state.defaultIsLayer ? 1 : 0)

  if (exportedLayerCount >= 2) {
    const reportNode = state.exportedLayerNodes[1] ?? state.defaultExport ?? program
    reports.push({
      node: reportNode,
      messageId: 'tooManyLayerExports',
      data: {
        name: 'the adapter Layer',
        expected: 'exactly one exported Layer — the binding that provides the port',
        actual: `${exportedLayerCount} exported Layers`,
        fix:
          'keep a single Layer for the port; collapse live/default/declined variants into one or pick the one the composition root wires',
      },
    })
  }

  if (exportedLayerCount >= 1) {
    for (const helper of state.exportedFunctionHelpers) {
      reports.push({
        node: helper.node,
        messageId: 'leakedHelper',
        data: {
          name: helper.name,
          expected: 'Layer-only export — the composition root receives the port, not the wrap internals',
          actual: 'exported function helper alongside the Layer',
          fix:
            'move the helper to a sibling file (or inline it behind the Layer); only the Layer should leave the adapter',
        },
      })
    }
    for (const value of state.exportedValueHelpers) {
      reports.push({
        node: value.node,
        messageId: 'leakedHelper',
        data: {
          name: value.name,
          expected: 'Layer-only export — the composition root receives the port, not the wrap internals',
          actual: 'exported value alongside the Layer',
          fix:
            'move the value to a sibling file or inline it behind the Layer; only the Layer should leave the adapter',
        },
      })
    }
    for (const reexport of state.exportedOpaqueReexports) {
      const isExportAll = reexport.node.type === 'ExportAllDeclaration'
      reports.push({
        node: reexport.node,
        messageId: 'leakedHelper',
        data: {
          name: reexport.name,
          expected: 'Layer-only export — the composition root receives the port, not the wrap internals',
          actual: isExportAll
            ? 'opaque re-export — the adapter cannot verify what leaves the module'
            : 'cross-module re-export — the local name does not resolve to a local declaration',
          fix: isExportAll
            ? 'remove the export * and import only what you need explicitly, or move the re-exports to a barrel file outside the adapter'
            : 'import the value first, then export it by name, so the adapter controls what leaves',
        },
      })
    }
    if (state.defaultIsFunctionHelper && state.defaultExport !== null) {
      const defaultHelperName = state.defaultExport.type === 'Identifier'
        ? state.defaultExport.name
        : state.defaultExport.type === 'FunctionDeclaration'
        ? (state.defaultExport.id?.name ?? 'default')
        : 'default'
      reports.push({
        node: state.defaultExport,
        messageId: 'leakedHelper',
        data: {
          name: defaultHelperName,
          expected: 'Layer-only export — the composition root receives the port, not the wrap internals',
          actual: 'exported function helper alongside the Layer',
          fix:
            'move the helper to a sibling file (or inline it behind the Layer); only the Layer should leave the adapter',
        },
      })
    }
  }

  return reports
}

export const adapterSingleLayerExport = defineRule({
  meta,
  create(context: Context) {
    if (!isAdapterFile(context.filename)) return {}

    const program = context.sourceCode.ast
    const state = collectFromProgram(program)
    const reports = buildReports(state, program)

    return {
      'Program:exit'() {
        for (const report of reports) {
          context.report({
            node: report.node,
            messageId: report.messageId,
            data: report.data,
          })
        }
      },
    }
  },
})
