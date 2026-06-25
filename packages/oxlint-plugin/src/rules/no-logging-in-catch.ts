// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { ESTree } from '@oxlint/plugins'

const EFFECT_MODULE = 'effect'
const CATCH_METHODS: ReadonlySet<string> = new Set([
  'catchAll',
  'catchTag',
  'catchAllCause',
  'catchSome',
  'catchSomeCause',
  'catchIf',
  'orElse',
  'orElseFail',
  'orElseSucceed',
])
const EFFECT_LOG_METHODS: ReadonlySet<string> = new Set([
  'log',
  'logDebug',
  'logError',
  'logWarning',
  'logInfo',
  'logTrace',
])
const CONSOLE_LOG_METHODS: ReadonlySet<string> = new Set([
  'log',
  'error',
  'warn',
  'info',
  'debug',
])

export const noLoggingInCatch = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prevents logging inside Effect catch blocks. Use Effect.tapError or logging outside catch instead.',
    },
    schema: [],
    messages: {
      noLoggingInCatch:
        '{{name}} is forbidden inside {{catchMethod}}. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    },
  },
  create(context) {
    // Stryker restore all
    const trackedEffectImports = new Set<string>()
    const catchMethodStack: string[] = []
    const activeCatchCallbacks = new WeakSet<ESTree.Node>()

    const getCatchMethodName = (
      node: ESTree.CallExpression,
    ): string | null => {
      const { callee } = node
      if (
        callee.type === 'MemberExpression' &&
        callee.property.type === 'Identifier' &&
        CATCH_METHODS.has(callee.property.name)
      ) {
        return callee.property.name
      }
      return null
    }

    const reportViolation = (
      node: ESTree.Node,
      loggingMethod: string,
      catchMethod: string,
    ) => {
      context.report({
        node,
        messageId: 'noLoggingInCatch',
        data: {
          name: loggingMethod,
          catchMethod,
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: `${loggingMethod} inside ${catchMethod}`,
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      })
    }

    type FunctionLike = ESTree.ArrowFunctionExpression | ESTree.Function

    const enterCatchCallback = (
      node: FunctionLike,
    ) => {
      if (trackedEffectImports.size === 0) return
      if (node.parent.type !== 'CallExpression') return
      const callExpr: ESTree.CallExpression = node.parent
      const method = getCatchMethodName(callExpr)
      if (method !== null && node === callExpr.arguments[callExpr.arguments.length - 1]) {
        catchMethodStack.push(method)
        activeCatchCallbacks.add(node)
      }
    }

    const exitCatchCallback = (
      node: FunctionLike,
    ) => {
      if (activeCatchCallbacks.has(node)) {
        catchMethodStack.pop()
        activeCatchCallbacks.delete(node)
      }
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (node.source.value !== EFFECT_MODULE) return

        for (const spec of node.specifiers) {
          if (spec.type === 'ImportNamespaceSpecifier') {
            trackedEffectImports.add(spec.local.name)
          }
          if (
            spec.type === 'ImportSpecifier' &&
            spec.imported.type === 'Identifier' &&
            spec.imported.name === 'Effect'
          ) {
            trackedEffectImports.add(spec.local.name)
          }
        }
      },

      VariableDeclaration(node: ESTree.VariableDeclaration) {
        for (const decl of node.declarations) {
          if (decl.id.type !== 'Identifier') continue
          trackedEffectImports.delete(decl.id.name)
        }
      },

      ArrowFunctionExpression: enterCatchCallback,
      'ArrowFunctionExpression:exit': exitCatchCallback,
      FunctionExpression: enterCatchCallback,
      'FunctionExpression:exit': exitCatchCallback,

      CallExpression(node: ESTree.CallExpression) {
        if (catchMethodStack.length === 0) return

        const catchMethod = catchMethodStack[catchMethodStack.length - 1]!
        const { callee } = node

        if (callee.type !== 'MemberExpression') return
        if (callee.property.type !== 'Identifier') return
        if (callee.object.type !== 'Identifier') return

        const objectName = callee.object.name
        const methodName = callee.property.name

        if (
          trackedEffectImports.has(objectName) &&
          EFFECT_LOG_METHODS.has(methodName)
        ) {
          reportViolation(node, `${objectName}.${methodName}`, catchMethod)
          return
        }

        if (
          objectName === 'console' &&
          CONSOLE_LOG_METHODS.has(methodName)
        ) {
          reportViolation(node, `console.${methodName}`, catchMethod)
        }
      },

      // Detect Effect.log* passed as pipe argument: something.pipe(Effect.log)
      MemberExpression(node: ESTree.MemberExpression) {
        if (catchMethodStack.length === 0) return
        if (node.parent.type !== 'CallExpression') return

        const pipeCallee = node.parent.callee
        if (pipeCallee.type !== 'MemberExpression') return
        if (pipeCallee.property.type !== 'Identifier') return
        if (pipeCallee.property.name !== 'pipe') return

        if (
          node.object.type === 'Identifier' &&
          trackedEffectImports.has(node.object.name) &&
          node.property.type === 'Identifier' &&
          EFFECT_LOG_METHODS.has(node.property.name)
        ) {
          reportViolation(
            node.parent,
            `${node.object.name}.${node.property.name}`,
            catchMethodStack[catchMethodStack.length - 1]!,
          )
        }
      },
    }
  },
})
