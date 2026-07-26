import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'
import { noContextGenericTag } from '../no-context-generic-tag.js'

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

ruleTester.run('no-context-generic-tag', noContextGenericTag, {
  valid: [
    {
      name: 'Should_AllowContextTag_When_UsedCorrectly',
      code: `
        import { Context } from 'effect'
        interface Database { readonly query: (sql: string) => unknown }
        const Database = Context.Tag('@app/Database')<Database, Database>()
      `,
    },
    {
      name: 'Should_AllowContextTag_When_ContextImportIsAliased',
      code: `
        import { Context as Ctx } from 'effect'
        interface Cache { readonly get: (key: string) => unknown }
        const Cache = Ctx.Tag('@app/Cache')<Cache, Cache>()
      `,
    },
    {
      name: 'Should_AllowClassExtendTag_When_UsingContextTagNotGenericTag',
      code: `
        import { Context } from 'effect'
        interface MyService { readonly value: string }
        class MyService extends Context.Tag('my-service')<MyService, MyService>() {}
      `,
    },
    {
      name: 'Should_AllowDestructuredTag_When_UsingTagNotGenericTag',
      code: `
        import { Context } from 'effect'
        const { Tag } = Context
        const MyTag = Tag('my-tag')<string, string>()
      `,
    },
    {
      name: 'Should_IgnoreGenericTag_When_ContextNotImportedFromEffect',
      code: `
        import { Effect, Layer } from 'effect'
        import { Context } from 'other-library'
        const tag = Context.GenericTag<string>('tag')
      `,
    },
    {
      name: 'Should_AllowContextMethods_When_CallingEmptyOrMake',
      code: `
        import { Context } from 'effect'
        const ctx = Context.empty()
      `,
    },
    {
      name: 'Should_AllowGenericTag_When_ImportedFromDifferentPackage',
      code: `
        import { GenericTag } from 'other-library'
        const MyTag = GenericTag<number>('my-tag')
      `,
    },
    {
      name: 'Should_AllowContext_When_SourceIsNotEffectModule',
      code: `
        import { Context } from 'react'
        const result = Context.Consumer
      `,
    },
    {
      name: 'Should_AllowNamespaceImport_When_UsingEffectNamespace',
      code: `
        import * as Effect from 'effect'
        const MyTag = Effect.Context.Tag('@app/MyTag')<string, string>()
      `,
    },
    {
      name: 'Should_AllowComputedProperty_When_AccessingDynamicKey',
      code: `
        import { Context } from 'effect'
        const key = 'GenericTag'
        const tag = Context[key]
      `,
    },
    {
      name: 'Should_AllowFunctionReturn_When_AccessingGenericTagDynamically',
      code: `
        import { Context } from 'effect'
        function getContext() { return Context }
        const tag = getContext().GenericTag
      `,
    },
    {
      name: 'Should_AllowClassExtend_When_ContextTagDirectCall',
      code: `
        import { Context } from 'effect'
        class MyService extends Context.Tag('my-service') {}
      `,
    },
    {
      name: 'Should_AllowClassExtend_When_DirectFunctionCall',
      code: `
        function makeTag(id: string) { return class {} }
        class MyService extends makeTag('my-service') {}
      `,
    },
    {
      name: 'Should_IgnoreDefaultImport_When_ImportingFromEffect',
      code: `
        import Context from 'effect'
        const tag = Context.GenericTag
      `,
    },
    {
      name: 'Should_AllowGenericTag_When_NonContextNamedImportFromEffect',
      code: `
        import { Effect } from 'effect'
        const tag = Effect.GenericTag
      `,
    },
    {
      name: 'Should_AllowTypeReference_When_UsingContextTag',
      code: `
        import { Context } from 'effect'
        type MyTag = Context.Tag<string, string>
      `,
    },
  ],
  invalid: [
    {
      name: 'Should_ReportViolation_When_AccessingContextGenericTag',
      code: `
        import { Context } from 'effect'
        const tag = Context.GenericTag
      `,
      errors: [{
        messageId: 'banned',
        data: {
          name: 'Context.GenericTag',
          expected: 'Context.Tag',
          actual: 'Context.GenericTag',
          fix: 'Replace with Context.Tag from effect',
        },
      }],
    },
    {
      name: 'Should_ReportViolation_When_AccessingGenericTagViaAliasedContext',
      code: `
        import { Context as Ctx } from 'effect'
        const tag = Ctx.GenericTag
      `,
      errors: [{ messageId: 'banned' }],
    },
    {
      name: 'Should_ReportViolation_When_CallingGenericTagWithTypeParameter',
      code: `
        import { Context } from 'effect'
        const Port = Context.GenericTag<number>("PORT")
      `,
      errors: [{ messageId: 'banned' }],
    },
    {
      name: 'Should_ReportViolation_When_UsingGenericTagWithComplexType',
      code: `
        import { Context } from 'effect'
        interface Logger { log: (msg: string) => void }
        const Logger = Context.GenericTag<Logger>("@services/Logger")
      `,
      errors: [{ messageId: 'banned' }],
    },
    {
      name: 'Should_ReportViolation_When_GenericTagUsedAsTypeAnnotation',
      code: `
        import { Context } from 'effect'
        function createTag(): GenericTag<string> {
          return Context.GenericTag<string>('tag')
        }
      `,
      errors: [
        { messageId: 'banned' },
        { messageId: 'banned' },
      ],
    },
    {
      name: 'Should_ReportViolation_When_GenericTagUsedInInterface',
      code: `
        import { Context } from 'effect'
        interface Service {
          tag: GenericTag<string>
        }
      `,
      errors: [{ messageId: 'banned' }],
    },
    {
      name: 'Should_ReportViolation_When_GenericTagUsedInClassProperty',
      code: `
        import { Context } from 'effect'
        class Container {
          tag: GenericTag<string>
        }
      `,
      errors: [{ messageId: 'banned' }],
    },
    {
      name: 'Should_ReportViolation_When_ClassExtendsContextGenericTag',
      code: `
        import { Context } from 'effect'
        class MyService extends Context.GenericTag<string>('my-service') {}
      `,
      errors: [
        { messageId: 'banned' },
        { messageId: 'banned' },
      ],
    },
    {
      name: 'Should_ReportViolation_When_ClassExtendsDestructuredGenericTag',
      code: `
        import { Context } from 'effect'
        const { GenericTag } = Context
        class MyService2 extends GenericTag<string>('service2') {}
      `,
      errors: [{ messageId: 'banned' }],
    },
    {
      name: 'Should_ReportMultipleViolations_When_GenericTagUsedMultipleTimes',
      code: `
        import { Context } from 'effect'
        const Tag1 = Context.GenericTag<string>('tag1')
        const Tag2 = Context.GenericTag<number>('tag2')
      `,
      errors: [{ messageId: 'banned' }, { messageId: 'banned' }],
    },
  ],
})
