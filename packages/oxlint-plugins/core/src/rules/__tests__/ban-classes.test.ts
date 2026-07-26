import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { banClasses } from '../ban-classes.js'

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

const expectedPattern =
  'S.TaggedError, Schema.TaggedError, Data.TaggedError, Data.Error, Context.Tag, Context.Reference, RpcGroup.make, Effect.Service, S.Class, or S.TaggedClass pattern'
const fixSuggestion =
  'Use S.TaggedError or Data.TaggedError for errors, Context.Tag/Context.Reference for context, RpcGroup.make for RPC groups, Effect.Service for services, S.Class/S.TaggedClass for data classes. Add to whitelist if exception needed'

const noClassesError = (name: string) => ({
  messageId: 'noClasses' as const,
  data: {
    name,
    expected: expectedPattern,
    actual: `class ${name}`,
    fix: fixSuggestion,
  },
})

ruleTester.run('ban-classes', banClasses, {
  valid: [
    {
      name: 'Should_Pass_When_UsingEffectGen',
      code: `
        import { Effect } from 'effect'
        const myService = Effect.gen(function*() {
          return yield* Effect.succeed(1)
        })
      `,
    },
    {
      name: 'Should_Pass_When_UsingLayerEffect',
      code: `
        import { Layer } from 'effect'
        const MyServiceLive = Layer.effectDiscard(Effect.succeed(undefined))
      `,
    },
    {
      name: 'Should_Pass_When_UsingContextGenericTagValue',
      code: `
        import { Context } from 'effect'
        export const MyService = Context.GenericTag<{ doSomething: () => void }>('MyService')
      `,
    },
    {
      name: 'Should_Pass_When_UsingSTaggedError',
      code: `
        import { Schema as S } from 'effect'
        export class MyError extends S.TaggedError<MyError>('MyError')('MyError', { message: S.String }) {}
      `,
    },
    {
      name: 'Should_Pass_When_UsingSchemaTaggedError',
      code: `
        import { Schema } from 'effect'
        export class MyError extends Schema.TaggedError<MyError>('MyError')('MyError', { message: S.String }) {}
      `,
    },
    {
      name: 'Should_Pass_When_UsingDataTaggedError',
      code: `
        import { Data } from 'effect'
        export class MyError extends Data.TaggedError('MyError')<{ message: string }> {}
      `,
    },
    {
      name: 'Should_Pass_When_UsingSchemaError',
      code: `
        import { Schema } from 'effect'
        export class MyError extends Schema.Error<MyError>('MyError')('MyError', { message: S.String }) {}
      `,
    },
    {
      name: 'Should_Pass_When_UsingDataError',
      code: `
        import { Data } from 'effect'
        export class MyError extends Data.Error('MyError')<{ message: string }> {}
      `,
    },
    {
      name: 'Should_Pass_When_UsingContextTagClassPattern',
      code: `
        import { Context } from 'effect'
        export class DB extends Context.Tag('DB')<DB, { readonly connection: string }>() {}
      `,
    },
    {
      name: 'Should_Pass_When_UsingContextReferenceClassPattern',
      code: `
        import { Context } from 'effect'
        export class MyConfig extends Context.Reference<MyConfig>()('MyConfig', { defaultValue: () => ({}) }) {}
      `,
    },
    {
      name: 'Should_Pass_When_UsingRpcGroupMake',
      code: `
        import { Rpc, RpcGroup } from '@effect/rpc'
        export class DashboardRpcs extends RpcGroup.make(
          Rpc.make('GetUsernames', { success: { items: [] } })
        ) {}
      `,
    },
    {
      name: 'Should_Pass_When_ClassExpressionExtendsSTaggedError',
      code: `
        import { Schema as S } from 'effect'
        export const MyError = class extends S.TaggedError<MyError>('MyError')('MyError', { message: S.String }) {}
      `,
    },
    {
      name: 'Should_Pass_When_ClassExpressionExtendsSchemaTaggedError',
      code: `
        import { Schema } from 'effect'
        export const MyError = class extends Schema.TaggedError<MyError>('MyError')('MyError', { message: S.String }) {}
      `,
    },
    {
      name: 'Should_Pass_When_ClassExpressionExtendsDataTaggedError',
      code: `
        import { Data } from 'effect'
        export const MyError = class extends Data.TaggedError('MyError')<{ message: string }> {}
      `,
    },
    {
      name: 'Should_Pass_When_DirectContextTagCallAsSuper',
      code: `
        import { Context } from 'effect'
        class DB extends Context.Tag('DB') {}
      `,
    },
    {
      name: 'Should_Pass_When_ClassIsWhitelisted',
      code: `
        class WsCtor {
          constructor() {}
        }
      `,
      options: [{ whitelist: ['WsCtor'] }],
    },
    {
      name: 'Should_Pass_When_MultipleClassesWhitelisted',
      code: `
        class AllowedClass1 { method() {} }
        class AllowedClass2 { method() {} }
      `,
      options: [{ whitelist: ['AllowedClass1', 'AllowedClass2'] }],
    },
    {
      name: 'Should_Pass_When_ClassExpressionIsWhitelisted',
      code: `
        const WsCtor = class {
          constructor() {}
        }
      `,
      options: [{ whitelist: ['WsCtor'] }],
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ClassDeclaration',
      code: `
        class MyService {
          doSomething() { return 1 }
        }
      `,
      errors: [noClassesError('MyService')],
    },
    {
      name: 'Should_Report_When_ExportedClassDeclaration',
      code: `
        export class MyService {
          doSomething() { return 1 }
        }
      `,
      errors: [noClassesError('MyService')],
    },
    {
      name: 'Should_Report_When_DefaultExportedClass',
      code: `
        export default class MyService {
          doSomething() { return 1 }
        }
      `,
      errors: [noClassesError('MyService')],
    },
    {
      name: 'Should_Report_When_ClassExpressionAssignedToVariable',
      code: `
        const MyService = class {
          doSomething() { return 1 }
        }
      `,
      errors: [noClassesError('MyService')],
    },
    {
      name: 'Should_Report_When_AnonymousClassExpression',
      code: `
        const handler = class {
          handle() { return 1 }
        }
      `,
      errors: [noClassesError('handler')],
    },
    {
      name: 'Should_Report_When_AnonymousClassInReturn',
      code: `
        function createHandler() {
          return class {
            handle() { return 1 }
          }
        }
      `,
      errors: [noClassesError('Anonymous class')],
    },
    {
      name: 'Should_Report_When_MultipleClassDeclarations',
      code: `
        class ServiceA { method() {} }
        class ServiceB { method() {} }
      `,
      errors: [{ messageId: 'noClasses' }, { messageId: 'noClasses' }],
    },
    {
      name: 'Should_Report_When_ClassNotInWhitelist',
      code: `
        class NotWhitelisted {
          method() {}
        }
      `,
      options: [{ whitelist: ['AllowedClass'] }],
      errors: [noClassesError('NotWhitelisted')],
    },
    {
      name: 'Should_Report_When_OneClassNotInWhitelist',
      code: `
        class AllowedClass { method() {} }
        class NotAllowedClass { method() {} }
      `,
      options: [{ whitelist: ['AllowedClass'] }],
      errors: [noClassesError('NotAllowedClass')],
    },
    {
      name: 'Should_Report_When_NoOptionsProvided',
      code: `
        class StrykerWasHere {
          method() {}
        }
      `,
      errors: [noClassesError('StrykerWasHere')],
    },
    {
      name: 'Should_Report_When_ClassExpressionUsedInline',
      code: `
        const arr = [class { method() {} }]
      `,
      errors: [noClassesError('Anonymous class')],
    },
    {
      name: 'Should_Report_When_ExtendsSWithWrongMethod',
      code: `
        import { Schema as S } from 'effect'
        class MyError extends S.NotTaggedError('MyError')<{ message: string }> {}
      `,
      errors: [noClassesError('MyError')],
    },
    {
      name: 'Should_Report_When_ExtendsWrongObjectWithTaggedError',
      code: `
        import { Other } from 'effect'
        class MyError extends Other.TaggedError('MyError')<{ message: string }> {}
      `,
      errors: [noClassesError('MyError')],
    },
    {
      name: 'Should_Report_When_ExtendsCallWithIdentifierCallee',
      code: `
        function makeClass(_tag: string) {
          return class {}
        }
        class MyError extends makeClass('Tag')<{}> {}
      `,
      errors: [{ messageId: 'noClasses' }, { messageId: 'noClasses' }],
    },
    {
      name: 'Should_Report_When_OtherObjectWithTag',
      code: `
        import { Context } from 'effect'
        const FakeContext = Context
        class MyError extends FakeContext.Tag('Tag')<{}>() {}
      `,
      errors: [noClassesError('MyError')],
    },
    {
      name: 'Should_Report_When_ContextWithWrongProperty',
      code: `
        import { Context } from 'effect'
        class MyError extends Context.GenericTag('Tag')<{}>() {}
      `,
      errors: [noClassesError('MyError')],
    },
    {
      name: 'Should_Report_When_ContextReferenceWithoutTypeArgs',
      code: `
        import { Context } from 'effect'
        class MyConfig extends Context.Reference()('MyConfig', {}) {}
      `,
      errors: [noClassesError('MyConfig')],
    },
    {
      name: 'Should_Report_When_NonContextObjectWithReference',
      code: `
        const Other = { Reference: <T>() => { void (0 as T); return (_id: string) => class {} } }
        class MyConfig extends Other.Reference<string>()('MyConfig') {}
      `,
      options: [{ whitelist: ['Anonymous class'] }],
      errors: [noClassesError('MyConfig')],
    },
    {
      name: 'Should_Report_When_RpcGroupWithWrongProperty',
      code: `
        import { RpcGroup } from '@effect/rpc'
        class MyRpcs extends RpcGroup.other() {}
      `,
      errors: [noClassesError('MyRpcs')],
    },
    {
      name: 'Should_Report_When_OtherObjectWithMake',
      code: `
        const SomeOther = { make: () => class {} }
        class MyRpcs extends SomeOther.make() {}
      `,
      errors: [{ messageId: 'noClasses' }, { messageId: 'noClasses' }],
    },
    {
      name: 'Should_Report_When_ExtendsChainedGenericFactoryCall',
      code: `
        function makeFactory() {
          return function withType<T>() {
            void (0 as T)
            return class GenericBase {}
          }
        }
        class MyError extends makeFactory()<string>() {}
      `,
      options: [{ whitelist: ['GenericBase'] }],
      errors: [noClassesError('MyError')],
    },
    {
      name: 'Should_Report_When_FakeTaggedErrorChainedWithoutTypeArgs',
      code: `
        const S = {
          TaggedError: (_tag: string) => () => class {},
        }
        class MyError extends S.TaggedError('MyError')() {}
      `,
      options: [{ whitelist: ['Anonymous class'] }],
      errors: [noClassesError('MyError')],
    },
    {
      name: 'Should_Report_When_NonEffectTaggedErrorChainedWithTypeArgs',
      code: `
        const Other = {
          TaggedError: <T>() => {
            void (0 as T)
            return () => class {}
          },
        }
        class MyError extends Other.TaggedError<string>()() {}
      `,
      options: [{ whitelist: ['Anonymous class'] }],
      errors: [noClassesError('MyError')],
    },
    {
      name: 'Should_Report_When_ExtendsChainedCallWithNonTaggedError',
      code: `
        function makeClass() {
          return function () {
            return class {}
          }
        }
        class MyError extends makeClass()() {}
      `,
      errors: [{ messageId: 'noClasses' }, { messageId: 'noClasses' }],
    },
  ],
})
