import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  EMPTY_BEHAVIOR_ACTUAL,
  EMPTY_BEHAVIOR_EXPECTED,
  EMPTY_BEHAVIOR_FIX,
  EMPTY_CONDITION_ACTUAL,
  EMPTY_CONDITION_EXPECTED,
  EMPTY_CONDITION_FIX,
  INVALID_BEHAVIOR_CASE_EXPECTED,
  INVALID_BEHAVIOR_CASE_FIX,
  INVALID_CONDITION_CASE_EXPECTED,
  INVALID_CONDITION_CASE_FIX,
  meta,
  MISSING_SHOULD_PREFIX_EXPECTED,
  MISSING_SHOULD_PREFIX_FIX,
  MISSING_WHEN_SEPARATOR_EXPECTED,
  MISSING_WHEN_SEPARATOR_FIX,
  PASCAL_CASE,
  RECOGNIZED_TEST_METHODS,
  SHOULD_PREFIX_LENGTH,
  TEST_PREFIX_FORBIDDEN_EXPECTED,
  TEST_PREFIX_FORBIDDEN_FIX,
  WHEN_SEPARATOR_LENGTH,
} from './damp-test-naming.config.js'

export type Options = []
export type MessageIds =
  | 'testPrefixForbidden'
  | 'missingShouldPrefix'
  | 'missingWhenSeparator'
  | 'emptyBehavior'
  | 'emptyCondition'
  | 'invalidBehaviorCase'
  | 'invalidConditionCase'

const getExpected = (errorCode: MessageIds): string => {
  switch (errorCode) {
    case 'testPrefixForbidden':
      return TEST_PREFIX_FORBIDDEN_EXPECTED
    case 'missingShouldPrefix':
      return MISSING_SHOULD_PREFIX_EXPECTED
    case 'missingWhenSeparator':
      return MISSING_WHEN_SEPARATOR_EXPECTED
    case 'emptyBehavior':
      return EMPTY_BEHAVIOR_EXPECTED
    case 'emptyCondition':
      return EMPTY_CONDITION_EXPECTED
    case 'invalidBehaviorCase':
      return INVALID_BEHAVIOR_CASE_EXPECTED
    case 'invalidConditionCase':
      return INVALID_CONDITION_CASE_EXPECTED
  }
}

const getActual = (testName: string, errorCode: MessageIds): string => {
  switch (errorCode) {
    case 'testPrefixForbidden':
      return `Test starts with "${testName.startsWith('Test') ? 'Test' : 'test'}" prefix`
    case 'missingShouldPrefix':
      return `Test name "${testName}" missing Should_ prefix`
    case 'missingWhenSeparator':
      return `Test name "${testName}" missing _When_ separator`
    case 'emptyBehavior':
      return EMPTY_BEHAVIOR_ACTUAL
    case 'emptyCondition':
      return EMPTY_CONDITION_ACTUAL
    case 'invalidBehaviorCase': {
      const behavior = testName.slice(SHOULD_PREFIX_LENGTH, testName.indexOf('_When_'))
      return `Behavior "${behavior}" is not PascalCase`
    }
    case 'invalidConditionCase': {
      const condition = testName.slice(testName.indexOf('_When_') + WHEN_SEPARATOR_LENGTH)
      return `Condition "${condition}" is not PascalCase`
    }
  }
}

const getFix = (errorCode: MessageIds): string => {
  switch (errorCode) {
    case 'testPrefixForbidden':
      return TEST_PREFIX_FORBIDDEN_FIX
    case 'missingShouldPrefix':
      return MISSING_SHOULD_PREFIX_FIX
    case 'missingWhenSeparator':
      return MISSING_WHEN_SEPARATOR_FIX
    case 'emptyBehavior':
      return EMPTY_BEHAVIOR_FIX
    case 'emptyCondition':
      return EMPTY_CONDITION_FIX
    case 'invalidBehaviorCase':
      return INVALID_BEHAVIOR_CASE_FIX
    case 'invalidConditionCase':
      return INVALID_CONDITION_CASE_FIX
  }
}

const validateDampFormat = (name: string): MessageIds | null => {
  if (name.toLowerCase().startsWith('test')) {
    return 'testPrefixForbidden'
  }

  if (!name.startsWith('Should_')) {
    return 'missingShouldPrefix'
  }

  const whenIndex = name.indexOf('_When_')
  if (whenIndex === -1) {
    return 'missingWhenSeparator'
  }

  const behavior = name.slice(SHOULD_PREFIX_LENGTH, whenIndex)
  const condition = name.slice(whenIndex + WHEN_SEPARATOR_LENGTH)

  if (behavior.length === 0) {
    return 'emptyBehavior'
  }

  if (condition.length === 0) {
    return 'emptyCondition'
  }

  if (!PASCAL_CASE.test(behavior)) {
    return 'invalidBehaviorCase'
  }

  if (!PASCAL_CASE.test(condition)) {
    return 'invalidConditionCase'
  }

  return null
}

const extractTestName = (node: ESTree.CallExpression): string | undefined => {
  const firstArg = node.arguments[0]
  if (!firstArg) {
    return undefined
  }

  if (firstArg.type === 'Literal') {
    return String(firstArg.value)
  }

  if (firstArg.type === 'TemplateLiteral' && firstArg.quasis.length === 1) {
    return firstArg.quasis[0]?.value.cooked ?? undefined
  }

  return undefined
}

const isTestFunctionCall = (node: ESTree.CallExpression): boolean => {
  if (node.callee.type === 'Identifier') {
    return node.callee.name === 'it' || node.callee.name === 'test'
  }
  if (node.callee.type === 'MemberExpression') {
    if (node.callee.property.type !== 'Identifier') {
      return false
    }
    if (!RECOGNIZED_TEST_METHODS.has(node.callee.property.name)) {
      return false
    }

    // The for-loop's increment expression advances `current` every
    // iteration, so the loop cannot spin even if the body is empty.
    let current: ESTree.Node = node.callee.object
    for (; current.type === 'MemberExpression'; current = current.object) {
      // walk only
    }
    return current.type === 'Identifier' && (current.name === 'it' || current.name === 'test')
  }
  return false
}

export const dampTestNaming = defineRule({
  meta,
  create(context: Context) {
    return {
      CallExpression(node: ESTree.CallExpression) {
        if (!isTestFunctionCall(node)) {
          return
        }

        const testName = extractTestName(node)
        if (!testName) {
          return
        }

        const errorCode = validateDampFormat(testName)
        if (errorCode) {
          context.report({
            node: node.arguments[0]!,
            messageId: errorCode,
            data: {
              expected: getExpected(errorCode),
              actual: getActual(testName, errorCode),
              fix: getFix(errorCode),
            },
          })
        }
      },
    }
  },
})
