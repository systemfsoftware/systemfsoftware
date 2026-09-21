import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'
import { meta, Options, WORKER_NAME } from './no-new-worker-with-wasm-import.config.js'

export type MessageIds = 'forbiddenNewWorkerWithWasm'

const isWasmImport = (sourceValue: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((re) => re.test(sourceValue))

const isNewWorkerCall = (node: ESTree.NewExpression): boolean => {
  if (node.callee.type !== 'Identifier' || node.callee.name !== WORKER_NAME) return false
  const firstArg = node.arguments[0]
  if (firstArg === undefined) return false
  return true
}

export const noNewWorkerWithWasmImport = defineRule({
  meta,
  create(context: Context) {
    const options = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const patterns = options.wasmImportPatterns.map((src) => new RegExp(src))
    let hasWasmImport = false

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isWasmImport(node.source.value, patterns)) {
          hasWasmImport = true
        }
      },

      NewExpression(node: ESTree.NewExpression) {
        if (!hasWasmImport) return
        if (!isNewWorkerCall(node)) return

        context.report({
          node: node.callee,
          messageId: 'forbiddenNewWorkerWithWasm',
          data: {
            expected: options.expected,
            actual: 'new Worker(filePath)',
            fix: options.fix,
          },
        })
      },
    }
  },
})
