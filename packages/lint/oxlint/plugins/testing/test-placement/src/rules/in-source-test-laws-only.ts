import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  COMMENT_TOKEN_ACTUAL,
  COMMENT_TOKEN_EXPECTED,
  COMMENT_TOKEN_FIX,
  COMMENT_TOKEN_NAME,
  EXPORTED_CALLEE_ACTUAL,
  EXPORTED_CALLEE_EXPECTED,
  EXPORTED_CALLEE_FIX,
  EXPORTED_CALLEE_NAME,
  GLOBAL_AUGMENTATION_ACTUAL,
  GLOBAL_AUGMENTATION_EXPECTED,
  GLOBAL_AUGMENTATION_FIX,
  GLOBAL_AUGMENTATION_NAME,
  GUARD_BODY_NOT_LAWS_ACTUAL,
  GUARD_BODY_NOT_LAWS_EXPECTED,
  GUARD_BODY_NOT_LAWS_FIX,
  GUARD_BODY_NOT_LAWS_NAME,
  GUARD_TOKEN_PATTERN,
  LAWS_METHOD,
  LAWS_OBJECT,
  meta,
  NON_CANONICAL_GUARD_ACTUAL,
  NON_CANONICAL_GUARD_EXPECTED,
  NON_CANONICAL_GUARD_FIX,
  NON_CANONICAL_GUARD_NAME,
  SNAPSHOT_ASSERTION_ACTUAL,
  SNAPSHOT_ASSERTION_EXPECTED,
  SNAPSHOT_ASSERTION_FIX,
  SNAPSHOT_ASSERTION_NAME,
  SNAPSHOT_MATCHERS,
  TEST_VOCABULARY_ACTUAL,
  TEST_VOCABULARY_CALLS,
  TEST_VOCABULARY_EXPECTED,
  TEST_VOCABULARY_FIX,
  TEST_VOCABULARY_NAME,
  VITEST_IMPORT_ACTUAL,
  VITEST_IMPORT_EXPECTED,
  VITEST_IMPORT_FIX,
  VITEST_IMPORT_NAME,
  VITEST_SOURCE_PREFIXES,
} from './in-source-test-laws-only.config.js'
import { basenameOf, isTestFile, isUnderSrc } from './path.js'

export type MessageIds =
  | 'vitestImport'
  | 'testVocabulary'
  | 'snapshotAssertion'
  | 'nonCanonicalGuard'
  | 'guardBodyNotLaws'
  | 'commentToken'
  | 'globalAugmentation'
  | 'exportedCallee'

type GuardRecord = { node: ESTree.IfStatement }

const isVitestSource = (value: unknown): boolean =>
  typeof value === 'string' && VITEST_SOURCE_PREFIXES.some((prefix) => value === prefix || value.startsWith(prefix))

const isVoidZero = (node: ESTree.Node): boolean => node.type === 'UnaryExpression' && node.operator === 'void'

const isMeta = (node: ESTree.Node): boolean =>
  node.type === 'MemberExpression' &&
  node.property.type === 'Identifier' &&
  node.property.name === 'vitest' &&
  node.object.type === 'MetaProperty' &&
  node.object.meta.name === 'import' &&
  node.object.property.name === 'meta'

/**
 * True when `test` is exactly the canonical collection guard —
 * `import.meta.vitest !== void 0` (or the reversed comparison). Any other
 * reference to `import.meta.vitest` is a non-canonical escape.
 */
const isCanonicalGuardTest = (test: ESTree.Node): boolean => {
  if (test.type !== 'BinaryExpression' || (test.operator !== '!==' && test.operator !== '===')) return false
  const metaSide = isMeta(test.left) ? test.left : isMeta(test.right) ? test.right : undefined
  if (metaSide === undefined) return false
  const other = metaSide === test.left ? test.right : test.left
  return isVoidZero(other)
}

const isLawsCall = (callee: ESTree.Node): boolean =>
  callee.type === 'MemberExpression' &&
  callee.property.type === 'Identifier' &&
  callee.property.name === LAWS_METHOD &&
  callee.object.type === 'Identifier' &&
  callee.object.name === LAWS_OBJECT

const collectExportedNames = (
  body: readonly (ESTree.Statement | ESTree.ModuleDeclaration)[],
  out: Set<string>,
): void => {
  for (const statement of body) {
    if (statement.type === 'ExportNamedDeclaration') {
      if (statement.declaration?.type === 'VariableDeclaration') {
        for (const declarator of statement.declaration.declarations) {
          if (declarator.id.type === 'Identifier') out.add(declarator.id.name)
        }
      }
      if (statement.declaration?.type === 'FunctionDeclaration' && statement.declaration.id !== null) {
        out.add(statement.declaration.id.name)
      }
      if (statement.declaration?.type === 'ClassDeclaration' && statement.declaration.id !== null) {
        out.add(statement.declaration.id.name)
      }
      for (const specifier of statement.specifiers) {
        if (specifier.local.type === 'Identifier') out.add(specifier.local.name)
      }
    }
  }
}

const collectImportedNames = (
  body: readonly (ESTree.Statement | ESTree.ModuleDeclaration)[],
  out: Set<string>,
): void => {
  for (const statement of body) {
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) {
        out.add(specifier.local.name)
      }
    }
  }
}

const guardBodyStatements = (consequent: ESTree.Node): readonly ESTree.Node[] =>
  consequent.type === 'BlockStatement' ? consequent.body : [consequent]

const isLawsRegistration = (statement: ESTree.Node): boolean =>
  statement.type === 'ExpressionStatement' &&
  statement.expression.type === 'AwaitExpression' &&
  statement.expression.argument.type === 'CallExpression' &&
  isLawsCall(statement.expression.argument.callee)

export const inSourceTestLawsOnly = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isUnderSrc(filename) || isTestFile(basenameOf(filename))) return {}

    const importedNames = new Set<string>()
    const exportedNames = new Set<string>()
    const canonicalGuards: GuardRecord[] = []

    return {
      Program(node: ESTree.Program) {
        collectImportedNames(node.body, importedNames)
        collectExportedNames(node.body, exportedNames)
        for (const comment of context.sourceCode.getAllComments()) {
          if (GUARD_TOKEN_PATTERN.test(comment.value)) {
            context.report({
              node,
              messageId: 'commentToken',
              data: {
                name: COMMENT_TOKEN_NAME,
                expected: COMMENT_TOKEN_EXPECTED,
                actual: COMMENT_TOKEN_ACTUAL,
                fix: COMMENT_TOKEN_FIX,
              },
            })
          }
        }
      },
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (node.source.type === 'Literal' && isVitestSource(node.source.value)) {
          context.report({
            node: node.source,
            messageId: 'vitestImport',
            data: {
              name: VITEST_IMPORT_NAME,
              expected: VITEST_IMPORT_EXPECTED,
              actual: VITEST_IMPORT_ACTUAL,
              fix: VITEST_IMPORT_FIX,
            },
          })
        }
      },
      ImportExpression(node: ESTree.ImportExpression) {
        if (node.source.type === 'Literal' && isVitestSource(node.source.value)) {
          context.report({
            node,
            messageId: 'vitestImport',
            data: {
              name: VITEST_IMPORT_NAME,
              expected: VITEST_IMPORT_EXPECTED,
              actual: VITEST_IMPORT_ACTUAL,
              fix: VITEST_IMPORT_FIX,
            },
          })
        }
      },
      CallExpression(node: ESTree.CallExpression) {
        if (node.callee.type === 'Identifier' && TEST_VOCABULARY_CALLS[node.callee.name] === true) {
          context.report({
            node,
            messageId: 'testVocabulary',
            data: {
              name: TEST_VOCABULARY_NAME,
              expected: TEST_VOCABULARY_EXPECTED,
              actual: TEST_VOCABULARY_ACTUAL,
              fix: TEST_VOCABULARY_FIX,
            },
          })
          return
        }
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          SNAPSHOT_MATCHERS[node.callee.property.name] === true
        ) {
          context.report({
            node,
            messageId: 'snapshotAssertion',
            data: {
              name: SNAPSHOT_ASSERTION_NAME,
              expected: SNAPSHOT_ASSERTION_EXPECTED,
              actual: SNAPSHOT_ASSERTION_ACTUAL,
              fix: SNAPSHOT_ASSERTION_FIX,
            },
          })
          return
        }
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          TEST_VOCABULARY_CALLS[node.callee.object.name] === true
        ) {
          context.report({
            node,
            messageId: 'testVocabulary',
            data: {
              name: TEST_VOCABULARY_NAME,
              expected: TEST_VOCABULARY_EXPECTED,
              actual: TEST_VOCABULARY_ACTUAL,
              fix: TEST_VOCABULARY_FIX,
            },
          })
        }
      },
      MemberExpression(node: ESTree.MemberExpression) {
        if (!isMeta(node)) return
        const parent = node.parent
        if (
          parent?.type === 'BinaryExpression' &&
          (parent.operator === '!==' || parent.operator === '===') &&
          parent.parent?.type === 'IfStatement' &&
          parent.parent.test === parent &&
          parent.parent.parent?.type === 'Program'
        ) {
          return
        }
        context.report({
          node,
          messageId: 'nonCanonicalGuard',
          data: {
            name: NON_CANONICAL_GUARD_NAME,
            expected: NON_CANONICAL_GUARD_EXPECTED,
            actual: NON_CANONICAL_GUARD_ACTUAL,
            fix: NON_CANONICAL_GUARD_FIX,
          },
        })
      },
      IfStatement(node: ESTree.IfStatement) {
        if (node.parent.type !== 'Program') return
        if (!isCanonicalGuardTest(node.test)) return
        canonicalGuards.push({ node })
      },
      TSInterfaceDeclaration(node: ESTree.TSInterfaceDeclaration) {
        if (node.id.name !== 'ImportMeta') return
        const hasVitestProperty = node.body.body.some(
          (member) =>
            member.type === 'TSPropertySignature' && member.key.type === 'Identifier' && member.key.name === 'vitest',
        )
        if (!hasVitestProperty) return
        context.report({
          node,
          messageId: 'globalAugmentation',
          data: {
            name: GLOBAL_AUGMENTATION_NAME,
            expected: GLOBAL_AUGMENTATION_EXPECTED,
            actual: GLOBAL_AUGMENTATION_ACTUAL,
            fix: GLOBAL_AUGMENTATION_FIX,
          },
        })
      },
      ObjectExpression(node: ESTree.ObjectExpression) {
        if (node.parent?.type !== 'CallExpression' || !isLawsCall(node.parent.callee)) return
        for (const property of node.properties) {
          if (
            property.type === 'Property' &&
            property.key.type === 'Identifier' &&
            property.key.name === 'run' &&
            property.value.type === 'Identifier' &&
            (exportedNames.has(property.value.name) || importedNames.has(property.value.name))
          ) {
            context.report({
              node: property,
              messageId: 'exportedCallee',
              data: {
                name: EXPORTED_CALLEE_NAME,
                expected: EXPORTED_CALLEE_EXPECTED,
                actual: EXPORTED_CALLEE_ACTUAL,
                fix: EXPORTED_CALLEE_FIX,
              },
            })
          }
        }
      },
      'Program:exit'() {
        for (const guard of canonicalGuards) {
          for (const statement of guardBodyStatements(guard.node.consequent)) {
            if (isLawsRegistration(statement)) continue
            context.report({
              node: statement,
              messageId: 'guardBodyNotLaws',
              data: {
                name: GUARD_BODY_NOT_LAWS_NAME,
                expected: GUARD_BODY_NOT_LAWS_EXPECTED,
                actual: GUARD_BODY_NOT_LAWS_ACTUAL,
                fix: GUARD_BODY_NOT_LAWS_FIX,
              },
            })
          }
        }
      },
    }
  },
})
