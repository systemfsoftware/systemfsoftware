// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { JSONSchema, Schema as S } from 'effect'

const Options = S.Struct({
  wasmImportPatterns: S.optionalWith(
    S.Array(S.String),
    { default: () => [/^(@[^/]+\/)?[^/]+-wasm(\/.*)?$/].map((re) => re.source) },
  ),
  expected: S.optionalWith(
    S.String,
    { default: () => 'Bun.spawn subprocess pool' },
  ),
  fix: S.optionalWith(
    S.String,
    {
      default: () =>
        'Run each worker in its own OS process (not in a thread of the parent) so each one has its own WASM heap and concurrent init cannot race. A subprocess-per-worker pool with a per-child crash handler (re-dispatch the in-flight work and spawn a replacement) is the standard shape.',
    },
  ),
})

export type MessageIds = 'forbiddenNewWorkerWithWasm'

const WORKER_NAME = 'Worker'

const isWasmImport = (sourceValue: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((re) => re.test(sourceValue))

const isNewWorkerCall = (node: ESTree.NewExpression): boolean => {
  if (node.callee.type !== 'Identifier' || node.callee.name !== WORKER_NAME) return false
  if (node.arguments.length === 0) return false
  const firstArg = node.arguments[0]
  if (firstArg === undefined) return false
  return true
}

export const noNewWorkerWithWasmImport = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'When a file imports a WASM module (e.g. `*-wasm`), ban new Worker(filePath). Use Bun.spawn for process isolation — WASM global state races on concurrent init across threads of the same OS process and segfaults bun.',
    },
    schema: [JSONSchema.make(Options)],
    messages: {
      forbiddenNewWorkerWithWasm:
        '{{actual}} is forbidden when a WASM module is imported. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    },
  },
  create(context: Context) {
    // Stryker restore all
    const options = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const patterns = options.wasmImportPatterns.map((src) => new RegExp(src))
    let hasWasmImport = false

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value
        if (typeof source === 'string' && isWasmImport(source, patterns)) {
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
