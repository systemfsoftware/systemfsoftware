import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noLoggingInCatch } from '../no-logging-in-catch.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

ruleTester.run('no-logging-in-catch', noLoggingInCatch, {
  valid: [
    // --- Correct: Using Effect without catch methods ---
    {
      name: 'Should_Pass_When_UsingEffectLogOutsideCatch',
      code: `
        import { Effect } from 'effect'
        Effect.log('hello')
      `,
    },
    {
      name: 'Should_Pass_When_UsingEffectLogErrorOutsideCatch',
      code: `
        import { Effect } from 'effect'
        Effect.logError('error')
      `,
    },

    // --- Correct: Using tapError instead of logging in catch ---
    {
      name: 'Should_Pass_When_UsingTapErrorBeforeCatchAll',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.tapError((e) => Effect.logError(e)),
          Effect.catch(() => Effect.succeed(0))
        )
      `,
    },

    // --- Correct: catchAll without logging ---
    {
      name: 'Should_Pass_When_CatchAllReturnsPureValue',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.succeed(0))
        )
      `,
    },
    {
      name: 'Should_Pass_When_CatchAllWithNonLogEffect',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch((e) => Effect.succeed(e.message))
        )
      `,
    },

    // --- Correct: catchTag without logging ---
    {
      name: 'Should_Pass_When_CatchTagReturnsPureValue',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catchTag('Error', () => Effect.succeed(0))
        )
      `,
    },

    // --- Correct: catchAllCause without logging ---
    {
      name: 'Should_Pass_When_CatchAllCauseReturnsVoid',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catchCause(() => Effect.void)
        )
      `,
    },

    // --- Correct: orElse without logging ---
    {
      name: 'Should_Pass_When_OrElseWithoutLogging',
      code: `
        import { Effect } from 'effect'
        Effect.fail('error').pipe(
          Effect.catch(() => Effect.succeed(1))
        )
      `,
    },

    // --- Correct: orElseFail without logging ---
    {
      name: 'Should_Pass_When_OrElseFailWithoutLogging',
      code: `
        import { Effect } from 'effect'
        Effect.fail('a').pipe(
          Effect.catch(() => new Error('b'))
        )
      `,
    },

    // --- Correct: orElseSucceed without logging ---
    {
      name: 'Should_Pass_When_OrElseSucceedWithoutLogging',
      code: `
        import { Effect } from 'effect'
        Effect.fail('error').pipe(
          Effect.orElseSucceed(() => 42)
        )
      `,
    },

    // --- Correct: catchSome without logging ---
    {
      name: 'Should_Pass_When_CatchSomeWithoutLogging',
      code: `
        import { Effect } from 'effect'
        Effect.fail('error').pipe(
          Effect.catchFilter((e) => Effect.succeed(1))
        )
      `,
    },

    // --- Correct: catchSomeCause without logging ---
    {
      name: 'Should_Pass_When_CatchSomeCauseWithoutLogging',
      code: `
        import { Effect } from 'effect'
        Effect.fail('error').pipe(
          Effect.catchCauseFilter(() => Effect.succeed(1))
        )
      `,
    },

    // --- Correct: catchIf without logging ---
    {
      name: 'Should_Pass_When_CatchIfWithoutLogging',
      code: `
        import { Effect } from 'effect'
        Effect.fail('error').pipe(
          Effect.catchIf(
            (e) => e === 'error',
            () => Effect.succeed(1)
          )
        )
      `,
    },

    // --- Correct: catchIf predicate with logging should not be flagged ---
    {
      name: 'Should_Pass_When_LoggingInCatchIfPredicate',
      code: `
        import { Effect } from 'effect'
        Effect.fail('error').pipe(
          Effect.catchIf(
            (e) => { console.log(e); return true },
            () => Effect.succeed(1)
          )
        )
      `,
    },

    // --- Correct: No Effect import - should not check ---
    {
      name: 'Should_Pass_When_NoEffectImport',
      code: `
        const Effect = { log: (x: string) => x }
        Effect.log('hello')
      `,
    },

    // --- Correct: Other module import ---
    {
      name: 'Should_Pass_When_ImportingFromOtherModule',
      code: `
        import * as Effect from 'some-other-lib'
        Effect.log('hello')
      `,
    },

    {
      name: 'Should_Pass_When_BarrelNamespaceIsNotTheEffectExport',
      code: `
        import * as Effect from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.log('hello'))
        )
      `,
    },

    // --- Correct: Shadowed Effect variable ---
    {
      name: 'Should_Pass_When_EffectIsShadowed',
      code: `
        import { Effect } from 'effect'
        const Effect = { log: (x: string) => x }
        Effect.log('hello')
      `,
    },

    // --- Correct: Using Effect alias ---
    {
      name: 'Should_Pass_When_UsingAliasedEffectWithoutCatch',
      code: `
        import { Effect as E } from 'effect'
        E.log('hello')
      `,
    },

    // --- Correct: Alias shadowed by variable declaration ---
    {
      name: 'Should_Pass_When_AliasIsShadowed',
      code: `
        import { Effect as E } from 'effect'
        const E = { log: (x: string) => x, catchAll: (fn: Function) => fn(), succeed: (x: number) => x }
        E.succeed(1).pipe(
          E.catch(() => E.log('hello'))
        )
      `,
    },

    // --- Correct: Non-log Effect methods in catch ---
    {
      name: 'Should_Pass_When_UsingNonLogMethodsInCatch',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.sync(() => 42))
        )
      `,
    },

    // --- Correct: Effect.gen without catch methods ---
    {
      name: 'Should_Pass_When_EffectGenWithoutCatch',
      code: `
        import { Effect } from 'effect'
        Effect.gen(function*() {
          yield* Effect.log('hello')
          return 1
        })
      `,
    },

    // --- Correct: Logging in Effect.gen at root level ---
    {
      name: 'Should_Pass_When_LoggingInEffectGenRootLevel',
      code: `
        import { Effect } from 'effect'
        const program = Effect.gen(function*() {
          yield* Effect.log('start')
          const result = yield* Effect.tryPromise(() => fetch('/api'))
          yield* Effect.log('end')
          return result
        }).pipe(
          Effect.catch(() => Effect.succeed(null))
        )
      `,
    },

    // --- Effect imported as namespace ---
    {
      name: 'Should_Pass_When_NonEffectPipeArgument',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.map((x) => x + 1),
          Effect.catch(() => Effect.succeed(0))
        )
      `,
    },

    // --- Variable shadowing check ---
    {
      name: 'Should_Pass_When_EffectNotShadowedButDifferentVariable',
      code: `
        import { Effect } from 'effect'
        const MyEffect = { log: () => {} }
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.succeed(0))
        )
      `,
    },

    // --- Empty catch callback ---
    {
      name: 'Should_Pass_When_EmptyCatchCallback',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.void)
        )
      `,
    },

    // --- Non-catch method with Effect ---
    {
      name: 'Should_Pass_When_NonCatchMethod',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.map((x) => x + 1)
        )
      `,
    },

    // --- console methods not in catch ---
    {
      name: 'Should_Pass_When_ConsoleLogOutsideCatch',
      code: `
        import { Effect } from 'effect'
        console.log('outside')
        Effect.succeed(1)
      `,
    },

    // --- pipe without logging in catch ---
    {
      name: 'Should_Pass_When_PipeWithoutLoggingInCatch',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.succeed(0).pipe(Effect.map((x) => x + 1)))
        )
      `,
    },

    // --- Plain function call inside catch (not member expression) ---
    {
      name: 'Should_Pass_When_PlainFunctionCallInCatch',
      code: `
        import { Effect } from 'effect'
        declare const recover: () => Effect.Effect<number>
        Effect.succeed(1).pipe(
          Effect.catch(() => recover())
        )
      `,
    },

    // --- Non-Effect module with catchAll-like method ---
    {
      name: 'Should_Pass_When_NonEffectModuleUsesCatchAll',
      code: `
        const obj = { catchAll: (fn: Function) => fn() }
        obj.catchAll(() => console.log('not effect'))
      `,
    },

    // --- Other module import with catchAll and logging ---
    {
      name: 'Should_Pass_When_OtherModuleCatchAllWithLogging',
      code: `
        import * as Effect from 'some-other-lib'
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.log('hello'))
        )
      `,
    },

    // --- Shadowed Effect in catch should not report ---
    {
      name: 'Should_Pass_When_ShadowedEffectInCatch',
      code: `
        import { Effect } from 'effect'
        const Effect = { log: (x: string) => x, catchAll: (fn: Function) => fn(), succeed: (x: number) => x }
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.log('hello'))
        )
      `,
    },

    // --- Non-Effect variable declaration doesn't unshadow ---
    {
      name: 'Should_Pass_When_OtherVariableDoesNotAffectTracking',
      code: `
        import { Effect } from 'effect'
        const NotEffect = { log: (x: string) => x }
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.succeed(0))
        )
      `,
    },

    // --- Destructuring declaration doesn't unshadow Effect ---
    {
      name: 'Should_Pass_When_DestructuringDoesNotUnshadow',
      code: `
        import { Effect } from 'effect'
        const { log } = console
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.succeed(0))
        )
      `,
    },

    // --- Namespace import with non-pipe chained call in catch ---
    {
      name: 'Should_Pass_When_NonPipeChainedCallInCatch',
      code: `
        import { Effect } from 'effect'
        declare const transform: { run: (e: Effect.Effect<number>) => number }
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.succeed(transform.run(Effect.succeed(0))))
        )
      `,
    },

    // --- Computed property access inside catch ---
    {
      name: 'Should_Pass_When_ComputedPropertyInCatch',
      code: `
        import { Effect } from 'effect'
        const method = 'log'
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect[method]('hello'))
        )
      `,
    },

    // --- String literal computed property in call inside catch ---
    {
      name: 'Should_Pass_When_StringLiteralComputedCallInCatch',
      code: `
        import { Effect } from 'effect'
        declare const obj: { log: (msg: string) => void }
        Effect.succeed(1).pipe(
          Effect.catch(() => {
            obj['log']('hello')
            return Effect.succeed(0)
          })
        )
      `,
    },

    // --- Non-Identifier callee object inside catch ---
    {
      name: 'Should_Pass_When_CallExpressionCalleeObjectInCatch',
      code: `
        import { Effect } from 'effect'
        declare const getLogger: () => { log: (msg: string) => void }
        Effect.succeed(1).pipe(
          Effect.catch(() => {
            getLogger().log('hello')
            return Effect.succeed(0)
          })
        )
      `,
    },

    // --- Non-console non-Effect member expression in catch ---
    {
      name: 'Should_Pass_When_OtherMemberExpressionInCatch',
      code: `
        import { Effect } from 'effect'
        declare const logger: { log: (msg: string) => void }
        Effect.succeed(1).pipe(
          Effect.catch(() => {
            logger.log('hello')
            return Effect.succeed(0)
          })
        )
      `,
    },

    // --- Non-log console method in catch ---
    {
      name: 'Should_Pass_When_ConsoleTraceInCatch',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => {
            console.trace('trace')
            return Effect.succeed(0)
          })
        )
      `,
    },

    // --- ImportSpecifier for non-Effect named import ---
    {
      name: 'Should_Pass_When_ImportingNonEffectNamedExport',
      code: `
        import { pipe } from 'effect'
        pipe(1, (x: number) => x + 1)
      `,
    },

    // --- Non-Effect named import used with catchAll-like method ---
    {
      name: 'Should_Pass_When_NonEffectNamedImportWithCatchAll',
      code: `
        import { Stream } from 'effect'
        Stream.succeed(1).pipe(
          Stream.catchAll(() => Stream.log('hello'))
        )
      `,
    },

    // --- String argument (not function) to catch ---
    {
      name: 'Should_Pass_When_NonFunctionArgToCatch',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catchTag('MyError', () => Effect.succeed(0))
        )
      `,
    },

    // --- Pipe argument that is not MemberExpression ---
    {
      name: 'Should_Pass_When_PipeArgIsNotMemberExpression',
      code: `
        import { Effect } from 'effect'
        declare const myFn: (x: number) => number
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.succeed(0).pipe(myFn))
        )
      `,
    },

    // --- Pipe argument with non-Identifier object ---
    {
      name: 'Should_Pass_When_PipeArgHasNonIdentifierObject',
      code: `
        import { Effect } from 'effect'
        declare const getEffectModule: () => { log: typeof Effect.log }
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.succeed(0).pipe(getEffectModule().log))
        )
      `,
    },

    // --- Pipe argument with non-Effect namespace ---
    {
      name: 'Should_Pass_When_PipeArgHasNonEffectNamespace',
      code: `
        import { Effect } from 'effect'
        declare const Other: { log: (x: number) => number }
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.succeed(0).pipe(Other.log))
        )
      `,
    },

    // --- Pipe argument with non-log property ---
    {
      name: 'Should_Pass_When_PipeArgHasNonLogProperty',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.succeed(0).pipe(Effect.map))
        )
      `,
    },

    // --- Pipe with computed property argument ---
    {
      name: 'Should_Pass_When_PipeArgHasComputedProperty',
      code: `
        import { Effect } from 'effect'
        const key = 'log'
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.succeed(0).pipe(Effect[key]))
        )
      `,
    },

    // --- Pipe callee accessed via string literal computed property ---
    {
      name: 'Should_Pass_When_PipeCalleeHasStringLiteralProperty',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.succeed(0)['pipe'](Effect.log))
        )
      `,
    },

    // --- Logging after catch block (exit callback must pop stack) ---
    {
      name: 'Should_Pass_When_LoggingAfterCatchBlock',
      code: `
        import { Effect } from 'effect'
        const program = Effect.succeed(1).pipe(
          Effect.catch(() => Effect.succeed(0))
        )
        Effect.log('after catch')
      `,
    },

    // --- Non-catch inner function should not affect stack ---
    {
      name: 'Should_Pass_When_InnerFunctionExitsWithoutAffectingStack',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => {
            const fn = (cb: () => void) => cb()
            fn(() => {})
            return Effect.succeed(0)
          })
        )
      `,
    },

    // --- Effect.map via non-pipe method chain in catch ---
    {
      name: 'Should_Pass_When_NonPipeMethodChainInCatch',
      code: `
        import { Effect } from 'effect'
        declare const chain: { apply: (e: Effect.Effect<number>) => Effect.Effect<number> }
        Effect.succeed(1).pipe(
          Effect.catch(() => chain.apply(Effect.succeed(0)))
        )
      `,
    },

    // --- MemberExpression as non-pipe, non-callee in catch ---
    {
      name: 'Should_Pass_When_MemberExpressionAssignedInCatch',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => {
            const ref = Effect.log
            return Effect.succeed(0)
          })
        )
      `,
    },

    // --- Effect.log in pipe OUTSIDE catch should not be flagged ---
    {
      name: 'Should_Pass_When_EffectLogInPipeOutsideCatch',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(Effect.log)
      `,
    },

    // --- Effect.log as argument to non-pipe method in catch ---
    {
      name: 'Should_Pass_When_EffectLogAsArgToNonPipeInCatch',
      code: `
        import { Effect } from 'effect'
        declare const apply: (fn: unknown) => unknown
        Effect.succeed(1).pipe(
          Effect.catch(() => {
            apply(Effect.log)
            return Effect.succeed(0)
          })
        )
      `,
    },

    // --- Non-pipe chained call with Effect ref in catch ---
    {
      name: 'Should_Pass_When_EffectLogRefInNonPipeCallInCatch',
      code: `
        import { Effect } from 'effect'
        declare const wrap: { run: (...fns: unknown[]) => unknown }
        Effect.succeed(1).pipe(
          Effect.catch(() => {
            wrap.run(Effect.log)
            return Effect.succeed(0)
          })
        )
      `,
    },
  ],
  invalid: [
    // --- Inner function exit must not pop catch stack ---
    {
      name: 'Should_Report_When_LoggingAfterInnerFunctionInCatch',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => {
            const fn = (cb: () => void) => cb()
            fn(() => {})
            Effect.log('still in catch')
            return Effect.succeed(0)
          })
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Effect.log in catchAll ---
    {
      name: 'Should_Report_When_EffectLogInCatchAll',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch((e) => Effect.log(e))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Effect.logError in catchAll ---
    {
      name: 'Should_Report_When_EffectLogErrorInCatchAll',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch((e) => Effect.logError(e))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.logError',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.logError inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Effect.logWarning in catchAll ---
    {
      name: 'Should_Report_When_EffectLogWarningInCatchAll',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch((e) => Effect.logWarning(e))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.logWarning',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.logWarning inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Effect.logDebug in catchAll ---
    {
      name: 'Should_Report_When_EffectLogDebugInCatchAll',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch((e) => Effect.logDebug(e))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.logDebug',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.logDebug inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Effect.logInfo in catchAll ---
    {
      name: 'Should_Report_When_EffectLogInfoInCatchAll',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch((e) => Effect.logInfo(e))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.logInfo',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.logInfo inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Effect.logTrace in catchAll ---
    {
      name: 'Should_Report_When_EffectLogTraceInCatchAll',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch((e) => Effect.logTrace(e))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.logTrace',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.logTrace inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Effect.log in catchTag ---
    {
      name: 'Should_Report_When_EffectLogInCatchTag',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catchTag('Error', () => Effect.log('error'))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catchTag',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catchTag',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Effect.log in catchAllCause ---
    {
      name: 'Should_Report_When_EffectLogInCatchAllCause',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catchCause(() => Effect.log('cause'))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catchCause',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catchCause',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Effect.log in catchSome ---
    {
      name: 'Should_Report_When_EffectLogInCatchSome',
      code: `
        import { Effect } from 'effect'
        Effect.fail('error').pipe(
          Effect.catchFilter(() => Effect.log('some')),
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catchFilter',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catchFilter',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Effect.log in catchSomeCause ---
    {
      name: 'Should_Report_When_EffectLogInCatchSomeCause',
      code: `
        import { Effect } from 'effect'
        Effect.fail('error').pipe(
          Effect.catchCauseFilter(() => Effect.log('some cause')),
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catchCauseFilter',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catchCauseFilter',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Effect.log in catchIf ---
    {
      name: 'Should_Report_When_EffectLogInCatchIf',
      code: `
        import { Effect } from 'effect'
        Effect.fail('error').pipe(
          Effect.catchIf(
            (e) => true,
            () => Effect.log('if')
          ),
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catchIf',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catchIf',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Effect.log in orElse ---
    {
      name: 'Should_Report_When_EffectLogInOrElse',
      code: `
        import { Effect } from 'effect'
        Effect.fail('error').pipe(
          Effect.catch(() => Effect.log('else'))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Effect.log in orElseFail ---
    {
      name: 'Should_Report_When_EffectLogInOrElseFail',
      code: `
        import { Effect } from 'effect'
        Effect.fail('a').pipe(
          Effect.catch(() => {
            Effect.log('fail')
            return new Error('b')
          })
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Effect.log in orElseSucceed ---
    {
      name: 'Should_Report_When_EffectLogInOrElseSucceed',
      code: `
        import { Effect } from 'effect'
        Effect.fail('error').pipe(
          Effect.orElseSucceed(() => {
            Effect.log('succeed')
            return 42
          })
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'orElseSucceed',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside orElseSucceed',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- console.log in catchAll ---
    {
      name: 'Should_Report_When_ConsoleLogInCatchAll',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch((e) => {
            console.log(e)
            return Effect.succeed(0)
          })
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'console.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'console.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- console.error in catchAll ---
    {
      name: 'Should_Report_When_ConsoleErrorInCatchAll',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch((e) => {
            console.error(e)
            return Effect.succeed(0)
          })
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'console.error',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'console.error inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- console.warn in catchAll ---
    {
      name: 'Should_Report_When_ConsoleWarnInCatchAll',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch((e) => {
            console.warn(e)
            return Effect.succeed(0)
          })
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'console.warn',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'console.warn inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- console.info in catchAll ---
    {
      name: 'Should_Report_When_ConsoleInfoInCatchAll',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch((e) => {
            console.info(e)
            return Effect.succeed(0)
          })
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'console.info',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'console.info inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- console.debug in catchAll ---
    {
      name: 'Should_Report_When_ConsoleDebugInCatchAll',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch((e) => {
            console.debug(e)
            return Effect.succeed(0)
          })
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'console.debug',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'console.debug inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Nested logging in catchAll ---
    {
      name: 'Should_Report_When_NestedEffectLogInCatchAll',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch((e) => {
            const inner = Effect.log(e)
            return inner
          })
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Using Effect alias in catch ---
    {
      name: 'Should_Report_When_UsingAliasedEffectLogInCatch',
      code: `
        import { Effect as E } from 'effect'
        E.succeed(1).pipe(
          E.catch((e) => E.log(e))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'E.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'E.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Multiple logging calls in catch ---
    {
      name: 'Should_Report_When_MultipleLogsInCatchAll',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch((e) => {
            console.log('first')
            console.error('second')
            return Effect.succeed(0)
          })
        )
      `,
      errors: [
        {
          messageId: 'noLoggingInCatch',
          data: {
            name: 'console.log',
            catchMethod: 'catch',
            expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
            actual: 'console.log inside catch',
            fix:
              'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
          },
        },
        {
          messageId: 'noLoggingInCatch',
          data: {
            name: 'console.error',
            catchMethod: 'catch',
            expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
            actual: 'console.error inside catch',
            fix:
              'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
          },
        },
      ],
    },

    // --- Real-world pattern: logging then recovering ---
    {
      name: 'Should_Report_When_LoggingThenRecoveringInCatchTag',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catchTag('DatabaseError', (e) => {
            Effect.logError(\`DB Error: \${e}\`)
            return Effect.succeed(0)
          })
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.logError',
          catchMethod: 'catchTag',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.logError inside catchTag',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Edge case: Effect.log passed to .pipe() inside catch ---
    {
      name: 'Should_Report_When_EffectLogPassedToPipeInCatch',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.succeed(0).pipe(Effect.log))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Edge case: Effect.logError passed to .pipe() inside catch ---
    {
      name: 'Should_Report_When_EffectLogErrorPassedToPipeInCatch',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.succeed(0).pipe(Effect.logError))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.logError',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.logError inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- FunctionExpression (not arrow) in catch ---
    {
      name: 'Should_Report_When_FunctionExpressionInCatch',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(function(e) { return Effect.log(e) })
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- console.log in catch with FunctionExpression ---
    {
      name: 'Should_Report_When_ConsoleLogInCatchWithFunctionExpression',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(function(e) {
            console.log(e)
            return Effect.succeed(0)
          })
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'console.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'console.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Named import (not namespace) detects logging ---
    {
      name: 'Should_Report_When_NamedImportEffectLogInCatch',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.log('error'))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Shadowed Effect still detects before shadowing ---
    {
      name: 'Should_Report_When_EffectLogInCatchBeforeShadowing',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.log('error'))
        )
        const Effect = { log: (x: string) => x }
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Variable declaration of non-Effect should not unshadow ---
    {
      name: 'Should_Report_When_OtherVarDeclDoesNotUnshadowEffect',
      code: `
        import { Effect } from 'effect'
        const other = 42
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.log('error'))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Destructuring declaration should not unshadow Effect ---
    {
      name: 'Should_Report_When_DestructuringDoesNotUnshadowEffect',
      code: `
        import { Effect } from 'effect'
        const { log } = console
        Effect.succeed(1).pipe(
          Effect.catch(() => Effect.log('error'))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Named import Effect with console.log in catch ---
    {
      name: 'Should_Report_When_NamedImportWithConsoleLogInCatch',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catch(() => {
            console.log('error')
            return Effect.succeed(0)
          })
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'console.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'console.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Aliased Effect.log via pipe inside catch ---
    {
      name: 'Should_Report_When_AliasedEffectLogViaPipeInCatch',
      code: `
        import { Effect as E } from 'effect'
        E.succeed(1).pipe(
          E.catch(() => E.succeed(0).pipe(E.log))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'E.log',
          catchMethod: 'catch',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'E.log inside catch',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },

    // --- Logging via pipe inside catch with namespace import ---
    {
      name: 'Should_Report_When_EffectLogViaPipeInCatchTag',
      code: `
        import { Effect } from 'effect'
        Effect.succeed(1).pipe(
          Effect.catchTag('Error', () => Effect.succeed(0).pipe(Effect.log))
        )
      `,
      errors: [{
        messageId: 'noLoggingInCatch',
        data: {
          name: 'Effect.log',
          catchMethod: 'catchTag',
          expected: 'Use Effect.tapError, Effect.tap, or logging outside the catch block',
          actual: 'Effect.log inside catchTag',
          fix:
            'Move logging to Effect.tapError before the catch, or handle error recovery without side effects in catch',
        },
      }],
    },
  ],
})
