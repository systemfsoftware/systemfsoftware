// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

export type Options = []
export type MessageIds =
  | 'testPrefixForbidden'
  | 'missingShouldPrefix'
  | 'missingWhenSeparator'
  | 'emptyBehavior'
  | 'emptyCondition'
  | 'invalidBehaviorCase'
  | 'invalidConditionCase'

export const dampTestNaming = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce DAMP (Descriptive and Meaningful Phrases) test naming format: Should_[ExpectedBehavior]_When_[Condition]',
    },
    schema: [],
    messages: {
      testPrefixForbidden: '{{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
      missingShouldPrefix: '{{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
      missingWhenSeparator: '{{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
      emptyBehavior: '{{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
      emptyCondition: '{{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
      invalidBehaviorCase: '{{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
      invalidConditionCase: '{{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    },
  },
  create(context: Context) {
    // Stryker restore all
    const SHOULD_PREFIX_LENGTH = 7
    const WHEN_SEPARATOR_LENGTH = 6

    const getExpected = (errorCode: MessageIds): string => {
      switch (errorCode) {
        case 'testPrefixForbidden':
          return 'DAMP format starting with Should_'
        case 'missingShouldPrefix':
          return 'Test name starting with Should_'
        case 'missingWhenSeparator':
          return 'Should_[Behavior]_When_[Condition] format'
        case 'emptyBehavior':
          return 'Non-empty behavior in PascalCase (e.g., ThrowError)'
        case 'emptyCondition':
          return 'Non-empty condition in PascalCase (e.g., PasswordInvalid)'
        case 'invalidBehaviorCase':
          return 'PascalCase (e.g., ThrowError)'
        case 'invalidConditionCase':
          return 'PascalCase (e.g., PasswordInvalid)'
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
          return 'Empty string between Should_ and _When_'
        case 'emptyCondition':
          return 'Empty string after _When_'
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
          return 'Remove "test" prefix and use DAMP format: Should_[Behavior]_When_[Condition]'
        case 'missingShouldPrefix':
          return 'Add "Should_" prefix to test name'
        case 'missingWhenSeparator':
          return 'Insert "_When_" separator between behavior and condition'
        case 'emptyBehavior':
          return 'Add descriptive behavior between Should_ and _When_ (e.g., Should_ThrowError_When_Called)'
        case 'emptyCondition':
          return 'Add descriptive condition after _When_ (e.g., Should_ThrowError_When_PasswordInvalid)'
        case 'invalidBehaviorCase':
          return 'Convert behavior to PascalCase (e.g., throwError → ThrowError)'
        case 'invalidConditionCase':
          return 'Convert condition to PascalCase (e.g., passwordInvalid → PasswordInvalid)'
      }
    }

    const PASCAL_CASE = /^[A-Z][a-z][a-zA-Z0-9]*$/

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

    // `.prop` is intentionally excluded — PBT naming has its own rule.
    const RECOGNIZED_TEST_METHODS = new Set([
      'only',
      'skip',
      'fails',
      'effect',
      'scoped',
      'live',
      'flakyTest',
    ])

    const isTestFunctionCall = (node: ESTree.CallExpression): boolean => {
      if (node.callee.type === 'Identifier') {
        const name = node.callee.name
        return name === 'it' || name === 'test'
      }

      if (node.callee.type === 'MemberExpression') {
        const immediateProp = node.callee.property
        if (immediateProp.type !== 'Identifier') {
          return false
        }
        if (!RECOGNIZED_TEST_METHODS.has(immediateProp.name)) {
          return false
        }

        let current: ESTree.Node | undefined = node.callee.object
        while (current) {
          if (current.type === 'Identifier') {
            return current.name === 'it' || current.name === 'test'
          }
          if (current.type === 'MemberExpression') {
            current = current.object
            continue
          }
          break
        }
      }

      return false
    }

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
