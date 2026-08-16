import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'
import { EXECUTOR_SUFFIX, HANDLER_SUFFIX, meta } from './handler-single-executor.config.js'

export type MessageIds =
  | 'noExecutorImport'
  | 'multipleExecutorImports'
  | 'noEitherDelegation'
  | 'multipleEitherDelegations'

const HandlerFileName = S.NonEmptyArray(S.String)

const getHandlerBaseName = (filename: string): string =>
  A.lastNonEmpty(S.decodeUnknownSync(HandlerFileName)(filename.split('/')))

const PathSegments = S.NonEmptyArray(S.String)

const lastSegmentOf = (source: string): string => {
  const segments = S.decodeUnknownSync(PathSegments)(source.split('/'))
  return A.lastNonEmpty(segments)
}

const EXECUTOR_IMPORT_REGEX = new RegExp(`\\.${EXECUTOR_SUFFIX.slice(1)}(\\.js|\\.ts)?$`)

const isExecutorImport = (node: ESTree.ImportDeclaration): boolean => {
  if (node.importKind === 'type') return false
  return EXECUTOR_IMPORT_REGEX.test(lastSegmentOf(node.source.value))
}

/**
 * The single delegation slot: `Effect.either(Executor(cmd))` (v3) or the v4
 * rename `Effect.result(Executor(cmd))`. Both spellings count against the SAME
 * slot — a handler must have exactly one across the two.
 */
const isEffectDelegationCall = (node: ESTree.CallExpression): boolean => {
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return false
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'Effect') return false
  if (callee.property.type !== 'Identifier') return false
  return callee.property.name === 'either' || callee.property.name === 'result'
}

export const handlerSingleExecutor = defineRule({
  meta,
  create(context: Context) {
    if (!context.filename.endsWith(HANDLER_SUFFIX)) return {}

    const baseName = getHandlerBaseName(context.filename)
    let executorImportCount = 0
    let delegationCallCount = 0

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isExecutorImport(node)) executorImportCount += 1
      },

      CallExpression(node: ESTree.CallExpression) {
        if (isEffectDelegationCall(node)) delegationCallCount += 1
      },

      'Program:exit'(node: ESTree.Program) {
        const reportNode = node.body[0] ?? node

        if (executorImportCount === 0) {
          context.report({
            node: reportNode,
            messageId: 'noExecutorImport',
            data: {
              name: baseName,
              expected:
                'exactly one import of a sibling *.executor and one delegation call — Effect.either(Executor(cmd)) (v3) or Effect.result(Executor(cmd)) (v4)',
              actual: 'no import of a sibling *.executor.ts',
              fix:
                'construct the executor command and call yield* Effect.either(Executor(cmd)) (v3) or yield* Effect.result(Executor(cmd)) (v4) — the executor owns the I/O sandwich',
            },
          })
        } else if (executorImportCount > 1) {
          context.report({
            node: reportNode,
            messageId: 'multipleExecutorImports',
            data: {
              name: baseName,
              expected: 'exactly one import of a sibling *.executor',
              actual: `${String(executorImportCount)} *.executor imports`,
              fix: 'merge the orchestrations into one executor, or split this handler per executor',
            },
          })
        }

        if (delegationCallCount === 0) {
          context.report({
            node: reportNode,
            messageId: 'noEitherDelegation',
            data: {
              name: baseName,
              expected:
                'exactly one delegation call — Effect.either(Executor(cmd)) (v3) or Effect.result(Executor(cmd)) (v4)',
              actual: 'no delegation call — neither Effect.either nor Effect.result around the executor call',
              fix:
                'wrap the single executor call in Effect.either (v3) / Effect.result (v4) and map the Left/failure side to a response',
            },
          })
        } else if (delegationCallCount > 1) {
          context.report({
            node: reportNode,
            messageId: 'multipleEitherDelegations',
            data: {
              name: baseName,
              expected:
                'exactly one delegation call — Effect.either(Executor(cmd)) (v3) or Effect.result(Executor(cmd)) (v4)',
              actual: `${String(delegationCallCount)} Effect.either / Effect.result calls`,
              fix:
                'only the single executor call may be wrapped in Effect.either / Effect.result — move the other effects into the executor',
            },
          })
        }
      },
    }
  },
})
