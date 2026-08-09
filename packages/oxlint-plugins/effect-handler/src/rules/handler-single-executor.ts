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

const isEffectEitherCall = (node: ESTree.CallExpression): boolean => {
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return false
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'Effect') return false
  if (callee.property.type !== 'Identifier' || callee.property.name !== 'either') return false
  return true
}

export const handlerSingleExecutor = defineRule({
  meta,
  create(context: Context) {
    if (!context.filename.endsWith(HANDLER_SUFFIX)) return {}

    const baseName = getHandlerBaseName(context.filename)
    let executorImportCount = 0
    let eitherCallCount = 0

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isExecutorImport(node)) executorImportCount += 1
      },

      CallExpression(node: ESTree.CallExpression) {
        if (isEffectEitherCall(node)) eitherCallCount += 1
      },

      'Program:exit'(node: ESTree.Program) {
        const reportNode = node.body[0] ?? node

        if (executorImportCount === 0) {
          context.report({
            node: reportNode,
            messageId: 'noExecutorImport',
            data: {
              name: baseName,
              expected: 'exactly one import of a sibling *.executor and one Effect.either(Executor(cmd)) delegation',
              actual: 'no import of a sibling *.executor.ts',
              fix:
                'construct the executor command and call yield* Effect.either(Executor(cmd)) — the executor owns the I/O sandwich',
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

        if (eitherCallCount === 0) {
          context.report({
            node: reportNode,
            messageId: 'noEitherDelegation',
            data: {
              name: baseName,
              expected: 'exactly one Effect.either(Executor(cmd)) call',
              actual: 'no Effect.either call around the executor call',
              fix: 'wrap the single executor call in Effect.either and map the Left to a response',
            },
          })
        } else if (eitherCallCount > 1) {
          context.report({
            node: reportNode,
            messageId: 'multipleEitherDelegations',
            data: {
              name: baseName,
              expected: 'exactly one Effect.either(Executor(cmd)) call',
              actual: `${String(eitherCallCount)} Effect.either calls`,
              fix:
                'only the single executor call may be wrapped in Effect.either — move the other effects into the executor',
            },
          })
        }
      },
    }
  },
})
