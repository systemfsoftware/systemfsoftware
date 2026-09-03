import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  COMMENT_TOKEN_ACTUAL,
  COMMENT_TOKEN_EXPECTED,
  COMMENT_TOKEN_FIX,
  COMMENT_TOKEN_NAME,
  DYNAMIC_ONLY_SOURCES,
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

const isDynamicOnlySource = (value: unknown): boolean =>
  typeof value === 'string' && DYNAMIC_ONLY_SOURCES.some((prefix) => value === prefix || value.startsWith(prefix))

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

  return (
    (isMeta(test.left) && isVoidZero(test.right)) ||
    (isMeta(test.right) && isVoidZero(test.left))
  )
}

const isLawsCall = (callee: ESTree.Node): boolean =>
  callee.type === 'MemberExpression' &&
  callee.property.type === 'Identifier' &&
  callee.property.name === LAWS_METHOD &&
  callee.object.type === 'Identifier' &&
  callee.object.name === LAWS_OBJECT

const collectExportedNames = (
  body: readonly (ESTree.Statement | ESTree.ModuleDeclaration)[],
  out: Map<string, boolean>,
  isInternalAt: (statement: ESTree.Node) => boolean,
): void => {
  for (const statement of body) {
    if (statement.type === 'ExportNamedDeclaration') {
      const internal = isInternalAt(statement)
      if (statement.declaration?.type === 'VariableDeclaration') {
        for (const declarator of statement.declaration.declarations) {
          if (declarator.id.type === 'Identifier') out.set(declarator.id.name, internal)
        }
      }
      if (statement.declaration?.type === 'FunctionDeclaration' && statement.declaration.id) {
        out.set(statement.declaration.id.name, internal)
      }
      if (statement.declaration?.type === 'ClassDeclaration' && statement.declaration.id) {
        out.set(statement.declaration.id.name, internal)
      }
      if (statement.declaration?.type === 'TSTypeAliasDeclaration') out.set(statement.declaration.id.name, internal)
      if (statement.declaration?.type === 'TSInterfaceDeclaration') out.set(statement.declaration.id.name, internal)
      for (const specifier of statement.specifiers) {
        if (specifier.local.type === 'Identifier') out.set(specifier.local.name, internal)
      }
    }
    if (statement.type === 'ExportDefaultDeclaration' && statement.declaration.type === 'Identifier') {
      out.set(statement.declaration.name, false)
    }
  }
}

const collectImportedNames = (
  body: readonly (ESTree.Statement | ESTree.ModuleDeclaration)[],
  out: Set<string>,
): void => {
  for (const statement of body) {
    if (statement.type !== 'ImportDeclaration') continue
    for (const specifier of statement.specifiers) {
      out.add(specifier.local.name)
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

/**
 * The generated schema channel: a `ruleOfSchemas(...)` registration. Inside
 * its callbacks the library-owned `it`/`expect` machinery is the sanctioned
 * vocabulary; the same calls anywhere else are the ceremony this rule bans.
 */
const isRuleOfSchemasCall = (callee: ESTree.Node): boolean =>
  callee.type === 'Identifier' && callee.name === 'ruleOfSchemas'

/**
 * True when a callee chain is rooted at `rootName` — `rootName(...)` itself
 * and any `rootName(...).forEach(...)` and friends. The generated and
 * type-level channels chain registrations off their root call, so both the
 * statement grammar and the ancestor check key on this. One hop of chaining
 * is not the limit here — the walk follows the full member/call spine; the
 * one-hop limit noted elsewhere applies only to run-binding alias resolution.
 */
const isRootedAt = (rootName: string) => (callee: ESTree.Node): boolean => {
  if (callee.type === 'Identifier' && callee.name === rootName) return true
  if (callee.type !== 'MemberExpression') return false
  const object = callee.object
  if (object.type === 'CallExpression') return isRootedAt(rootName)(object.callee)
  return isRootedAt(rootName)(object)
}

const isRuleOfSchemasRooted = isRootedAt('ruleOfSchemas')

const isExpectTypeOfRooted = isRootedAt('expectTypeOf')

/**
 * The kernel-property channel: an `it.prop(...)` / `test.prop(...)`
 * registration inside the canonical guard — the sanctioned home for pure
 * quantified coverage that is not a decision-core law.
 */
const isPropertyRegistration = (node: ESTree.CallExpression): boolean =>
  node.callee.type === 'MemberExpression' &&
  node.callee.property.type === 'Identifier' &&
  node.callee.property.name === 'prop' &&
  node.callee.object.type === 'Identifier' &&
  (node.callee.object.name === 'it' || node.callee.object.name === 'test')

const RUNNER_SOURCES: readonly string[] = ['vitest', 'vitest/', '@effect/vitest', '@effect/vitest/']

const isRunnerSource = (value: unknown): boolean =>
  typeof value === 'string' && RUNNER_SOURCES.some((prefix) => value === prefix || value.startsWith(prefix))

export const inSourceTestLawsOnly = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isUnderSrc(filename) || isTestFile(basenameOf(filename))) return {}

    const importedNames = new Set<string>()
    /** name -> whether the export is `@internal`-marked (unpublished surface) */
    const exportedNames = new Map<string, boolean>()
    /** module-local const targets for one-hop run-alias resolution */
    const aliasTargets = new Map<string, ESTree.Node>()
    const canonicalGuards: GuardRecord[] = []
    /**
     * True when the module is the generated channel's implementation side —
     * it exports `ruleOfSchemas` itself. Its runner import is static by API
     * contract (consumers call it synchronously from their own guards), and
     * its self-check coverage rides the same machinery it hands out, so the
     * consumer-facing arms stand down for the whole file.
     */
    let isChannelImplementation = false

    const isInternalAt = (statement: ESTree.Node): boolean =>
      context.sourceCode
        .getCommentsBefore(statement)
        .some((comment) => comment.value.includes('@internal'))

    const ancestorOf = (node: ESTree.Node): ESTree.Node | undefined => node.parent ?? undefined

    const isInsideCanonicalGuard = (node: ESTree.Node): boolean => {
      let current: ESTree.Node | undefined = ancestorOf(node)
      while (current !== undefined) {
        if (current.type === 'IfStatement' && canonicalGuards.some((guard) => guard.node === current)) return true
        current = ancestorOf(current)
      }
      return false
    }

    const isInsideRuleOfSchemas = (node: ESTree.Node): boolean => {
      let current: ESTree.Node | undefined = ancestorOf(node)
      while (current !== undefined) {
        if (current.type === 'CallExpression' && isRuleOfSchemasRooted(current.callee)) return true
        current = ancestorOf(current)
      }
      return false
    }

    const rootIdentifierOf = (node: ESTree.Node): string | undefined => {
      if (node.type === 'Identifier') return node.name
      if (node.type !== 'MemberExpression') return undefined
      let current: ESTree.Node = node.object
      while (current.type === 'MemberExpression') current = current.object
      return current.type === 'Identifier' ? current.name : undefined
    }

    const isPublishedBinding = (name: string): boolean => {
      const binding = exportedNames.get(name)
      if (binding === true) return false
      return binding === false || importedNames.has(name)
    }

    const aliasRootOf = (name: string): string | undefined => {
      const init = aliasTargets.get(name)
      if (init === undefined) return undefined
      if (init.type === 'Identifier') return init.name
      if (init.type === 'MemberExpression') return rootIdentifierOf(init)
      return undefined
    }

    const reportExportedCallee = (node: ESTree.Node): void => {
      context.report({
        node,
        messageId: 'exportedCallee',
        data: {
          name: EXPORTED_CALLEE_NAME,
          expected: EXPORTED_CALLEE_EXPECTED,
          actual: EXPORTED_CALLEE_ACTUAL,
          fix: EXPORTED_CALLEE_FIX,
        },
      })
    }

    return {
      Program(node: ESTree.Program) {
        collectImportedNames(node.body, importedNames)
        collectExportedNames(node.body, exportedNames, isInternalAt)
        for (const statement of node.body) {
          if (statement.type !== 'VariableDeclaration') continue
          for (const declarator of statement.declarations) {
            if (declarator.id.type !== 'Identifier') continue
            const init = declarator.init
            if (init?.type === 'Identifier' || init?.type === 'MemberExpression') {
              aliasTargets.set(declarator.id.name, init)
            }
          }
        }
        if (exportedNames.has('ruleOfSchemas')) isChannelImplementation = true
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
        // A type-only import is erased at compile time: nothing of the runner
        // reaches the published module graph, so the runtime-coupling
        // rationale does not apply to it.
        if (node.importKind === 'type') return
        // The channel implementation's runner import is static by API
        // contract: consumers call its registrations synchronously.
        if (isChannelImplementation) return
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
        if (node.source.type !== 'Literal') return
        if (isDynamicOnlySource(node.source.value)) {
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
          return
        }
        if (!isVitestSource(node.source.value)) return
        // The property and generated channels load their runner inside the
        // guard, where the branch is dead in the published build — the same
        // dynamics the laws call itself uses.
        if (isInsideCanonicalGuard(node) && isRunnerSource(node.source.value)) return
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
      },
      CallExpression(node: ESTree.CallExpression) {
        if (isRuleOfSchemasCall(node.callee)) return
        const insideGeneratedChannel = isInsideRuleOfSchemas(node)
        if (node.callee.type === 'Identifier' && TEST_VOCABULARY_CALLS[node.callee.name] === true) {
          if (!insideGeneratedChannel && !isChannelImplementation) {
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
          TEST_VOCABULARY_CALLS[node.callee.object.name] === true &&
          !(
            (isPropertyRegistration(node) &&
              (isInsideCanonicalGuard(node) || insideGeneratedChannel)) ||
            isChannelImplementation
          )
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
          if (property.type !== 'Property' || property.key.type !== 'Identifier' || property.key.name !== 'run') {
            continue
          }
          const value = property.value
          if (value.type === 'Identifier') {
            // An `@internal`-marked export is module-private in every sense
            // that reaches a consumer: stripInternal drops it from the
            // published dts, so no integration suite outside the module can
            // exercise it directly.
            if (exportedNames.get(value.name) === true) continue
            if (isPublishedBinding(value.name)) {
              reportExportedCallee(property)
              continue
            }
            // One hop of alias resolution only: `const ref = exported; run: ref`.
            const resolved = aliasRootOf(value.name)
            if (resolved !== undefined && isPublishedBinding(resolved)) reportExportedCallee(property)
            continue
          }
          if (value.type === 'MemberExpression') {
            const root = rootIdentifierOf(value)
            if (root === undefined) continue
            if (exportedNames.get(root) === true) continue
            if (isPublishedBinding(root)) reportExportedCallee(property)
            continue
          }
          if (value.type === 'ArrowFunctionExpression' && value.body.type === 'CallExpression') {
            const callee = value.body.callee
            if (callee.type === 'Identifier') {
              if (exportedNames.get(callee.name) === true) continue
              if (isPublishedBinding(callee.name)) {
                reportExportedCallee(property)
                continue
              }
              const resolved = aliasRootOf(callee.name)
              if (resolved !== undefined && isPublishedBinding(resolved)) reportExportedCallee(property)
              continue
            }
            if (callee.type === 'MemberExpression') {
              const root = rootIdentifierOf(callee)
              if (root === undefined) continue
              if (exportedNames.get(root) === true) continue
              if (isPublishedBinding(root)) reportExportedCallee(property)
            }
          }
        }
      },
      VariableDeclaration(node: ESTree.VariableDeclaration) {
        for (const declarator of node.declarations) {
          if (declarator.id.type !== 'Identifier') continue
          const init = declarator.init
          if (init?.type === 'Identifier' || init?.type === 'MemberExpression') {
            aliasTargets.set(declarator.id.name, init)
          }
        }
      },
      'Program:exit'() {
        if (isChannelImplementation) return
        for (const guard of canonicalGuards) {
          for (const statement of guardBodyStatements(guard.node.consequent)) {
            if (isLawsRegistration(statement)) continue
            if (statement.type === 'VariableDeclaration') continue
            if (statement.type === 'ExpressionStatement') {
              const expression = statement.expression
              if (expression.type === 'AwaitExpression') {
                const argument = expression.argument
                if (argument.type !== 'CallExpression') continue
                if (
                  isPropertyRegistration(argument) ||
                  isExpectTypeOfRooted(argument.callee) ||
                  isRuleOfSchemasRooted(argument.callee) ||
                  isInsideRuleOfSchemas(argument)
                ) {
                  continue
                }
              }
              if (expression.type !== 'CallExpression') continue
              if (
                isPropertyRegistration(expression) ||
                isExpectTypeOfRooted(expression.callee) ||
                isRuleOfSchemasRooted(expression.callee) ||
                isInsideRuleOfSchemas(expression)
              ) {
                continue
              }
            }
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
