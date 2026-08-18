import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'
import { EXPECTED, FIX } from '../ban-classes.config.js'
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

const PROD = 'src/feature.ts'

const noSuperclassError = (name: string) => ({
  messageId: 'banned' as const,
  data: {
    name,
    expected: EXPECTED,
    actual: 'a class whose superclass is not a sanctioned Effect v4 constructor',
    fix: FIX,
  },
})

const unsanctionedBaseError = (name: string, basePath: string) => ({
  messageId: 'banned' as const,
  data: {
    name,
    expected: EXPECTED,
    actual: `a class extending ${basePath}`,
    fix: FIX,
  },
})

ruleTester.run('ban-classes', banClasses, {
  valid: [
    {
      name: 'Should_Pass_When_ExtendsContextService_WithDoubleCall',
      code: `
        import { Context } from 'effect'
        class Service extends Context.Service<Service, { readonly value: number }>()("Service") {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsContextService_WithOptions',
      code: `
        import { Context } from 'effect'
        class Service extends Context.Service<Service>()("Service", { make: Effect.sync(() => ({})) }) {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsContextService_ViaAliasedContextImport',
      code: `
        import { Context as Ctx } from 'effect'
        class Database extends Ctx.Service<Database, Database>()("@app/Database") {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsContextReference_WithSingleCall',
      code: `
        import { Context } from 'effect'
        class Interrupts extends Context.Reference("Interrupts", { defaultValue: () => ({ count: 0 }) }) {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsSchemaClass_ViaAliasedSchemaImport',
      code: `
        import { Schema as S } from 'effect'
        class Person extends S.Class<Person>("Person")({ name: S.String }) {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsSchemaClass_WithBrand',
      code: `
        import { Schema } from 'effect'
        class Value extends Schema.Class<Value, { readonly brand: unique symbol }>("Value")({
          a: Schema.Date
        }) {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsSchemaError',
      code: `
        import { Schema } from 'effect'
        class E extends Schema.Error<E>("E")({ message: Schema.String }) {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsSchemaTaggedError',
      code: `
        import { Schema } from 'effect'
        class E extends Schema.TaggedError<E>()("E", { code: Schema.Number }) {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsSchemaTaggedClass',
      code: `
        import { Schema } from 'effect'
        class T extends Schema.TaggedClass<T>()("T", { value: Schema.Number }) {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsSchemaOpaque',
      code: `
        import { Schema } from 'effect'
        class B extends Schema.Opaque<B>()(Schema.Struct({ a: Schema.String })) {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsDataClass_WithoutCall',
      code: `
        import { Data } from 'effect'
        class Person extends Data.Class<{ readonly name: string }> {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsDataError_WithoutCall',
      code: `
        import { Data } from 'effect'
        class SystemError extends Data.Error<{ readonly code: number }> {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsDataTaggedClass_WithSingleCall',
      code: `
        import { Data } from 'effect'
        class E extends Data.TaggedClass("E")<{ readonly code: number }> {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsDataTaggedError_SiblingRuleTerritoryIsSilent',
      code: `
        import { Data } from 'effect'
        class F extends Data.TaggedError("F")<{ readonly code: number }> {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsRequestClass_WithoutCall',
      code: `
        import { Request } from 'effect'
        class GetUser extends Request.Class<{ id: number }, string> {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsRequestTaggedClass_WithSingleCall',
      code: `
        import { Request } from 'effect'
        class GetUser extends Request.TaggedClass("GetUser")<{ id: number }, string, Error> {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsPipeableClass_WithoutCall',
      code: `
        import { Pipeable } from 'effect'
        class StreamImpl extends Pipeable.Class {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsInspectableClass_WithoutCall',
      code: `
        import { Inspectable } from 'effect'
        class Part extends Inspectable.Class {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsEffectableClass_WithoutCall',
      code: `
        import { Effectable } from 'effect'
        class CustomEffect extends Effectable.Class<number> {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsPersistableClass_FromUnstable',
      code: `
        import { Persistable } from 'effect/unstable'
        class Entry extends Persistable.Class({ payload: {} }) {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsRpcMake',
      code: `
        import { Rpc } from 'effect/unstable'
        class Ping extends Rpc.make("Ping") {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsRpcMiddlewareService',
      code: `
        import { RpcMiddleware } from 'effect/unstable'
        class Auth extends RpcMiddleware.Service<Auth, { provides: Identity }>()("effect/Auth", {}) {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsRpcGroupMake',
      code: `
        import { RpcGroup } from 'effect/unstable'
        class PingRpcs extends RpcGroup.make(Ping) {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsSanctionedViaNamespaceImport',
      code: `
        import * as Effect from 'effect'
        class Person extends Effect.Schema.Class<Person>("Person")({ name: Effect.Schema.String }) {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ClassExpression_ExtendsSanctionedBase',
      code: `
        import { Schema } from 'effect'
        const Person = class extends Schema.Class<{ name: string }>('Person')({ name: Schema.String }) {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_BareClass_InTestFile_OutOfScope',
      code: `
        class Foo {}
        class Bar extends Baz {}
      `,
      filename: 'src/feature.test.ts',
    },
    {
      name: 'Should_Pass_When_BareClass_InSpecFile_OutOfScope',
      code: `class Foo {}`,
      filename: 'src/feature.spec.ts',
    },
    {
      name: 'Should_Pass_When_BareClass_InTestsDir_OutOfScope',
      code: `class Foo {}`,
      filename: 'tests/helpers/shared.ts',
    },
    {
      name: 'Should_Pass_When_BareClass_InTestResources_OutOfScope',
      code: `class Foo {}`,
      filename: 'packages/foo/testResources/infinite-loop/vitest.config.js',
    },
    {
      name: 'Should_Pass_When_BareClass_InFixturesDir_OutOfScope',
      code: `class Foo {}`,
      filename: 'src/__fixtures__/fake.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_ReportViolation_When_ClassHasNoSuperclass',
      code: `class Foo {}`,
      filename: PROD,
      errors: [noSuperclassError('class Foo')],
    },
    {
      name: 'Should_ReportViolation_When_ClassExtendsUnknownBase',
      code: `class Foo extends Bar {}`,
      filename: PROD,
      errors: [noSuperclassError('class Foo')],
    },
    {
      name: 'Should_ReportViolation_When_ClassExpressionHasNoSuperclass',
      code: `const Foo = class {}`,
      filename: PROD,
      errors: [noSuperclassError('class <anonymous>')],
    },
    {
      name: 'Should_ReportViolation_When_ClassExtendsGenericType',
      code: `class Foo extends Generic<number> {}`,
      filename: PROD,
      errors: [noSuperclassError('class Foo')],
    },
    {
      name: 'Should_ReportViolation_When_ExportedClassHasNoSuperclass',
      code: `
        export class Foo {
          constructor() {}
        }
      `,
      filename: PROD,
      errors: [noSuperclassError('class Foo')],
    },
    {
      name: 'Should_ReportViolation_When_ClassExtendsLocalBaseClass',
      code: `
        class Base {}
        class Child extends Base {}
      `,
      filename: PROD,
      errors: [noSuperclassError('class Base'), noSuperclassError('class Child')],
    },
    {
      name: 'Should_ReportViolation_When_ClassExtendsLocalFactoryFunction',
      code: `
        function makeBase() { return class {} }
        class Foo extends makeBase() {}
      `,
      filename: PROD,
      errors: [noSuperclassError('class <anonymous>'), noSuperclassError('class Foo')],
    },
    {
      name: 'Should_ReportViolation_When_ExtendsV3ContextTag',
      code: `
        import { Context } from 'effect'
        class MyService extends Context.Tag<string, string>()("my-service") {}
      `,
      filename: PROD,
      errors: [unsanctionedBaseError('class MyService', 'effect/Context.Tag')],
    },
    {
      name: 'Should_ReportViolation_When_ExtendsSchemaUnion_WhichIsNotAClassBase',
      code: `
        import { Schema } from 'effect'
        class X extends Schema.Union([Schema.String, Schema.Number]) {}
      `,
      filename: PROD,
      errors: [unsanctionedBaseError('class X', 'effect/Schema.Union')],
    },
    {
      name: 'Should_ReportViolation_When_SchemaImportedFromOtherModule',
      code: `
        import { Schema } from 'my-other-lib'
        class X extends Schema.Class<X>("X")({ name: Schema.String }) {}
      `,
      filename: PROD,
      errors: [unsanctionedBaseError('class X', 'my-other-lib/Schema.Class')],
    },
    {
      name: 'Should_ReportViolation_When_SchemaNamespaceNotImported',
      code: `
        class X extends Schema.Class<X>("X")({}) {}
      `,
      filename: PROD,
      errors: [noSuperclassError('class X')],
    },
    {
      name: 'Should_ReportViolation_When_SanctionedLocalIsShadowed',
      code: `
        import { Schema as S } from 'effect'
        function S() {}
        class X extends S.Class<X>("X")({}) {}
      `,
      filename: PROD,
      errors: [
        {
          messageId: 'banned',
          data: {
            name: 'class X',
            expected: EXPECTED,
            actual: 'a class whose superclass is not a sanctioned Effect v4 constructor',
            fix: FIX,
          },
        },
      ],
    },
    {
      name: 'Should_ReportViolation_When_ExtendsComputedMember',
      code: `
        import { Context } from 'effect'
        class X extends Context["Service"]<X>()("X") {}
      `,
      filename: PROD,
      errors: [noSuperclassError('class X')],
    },
    {
      name: 'Should_ReportViolation_When_ExtendsDestructuredFactory',
      code: `
        import { Schema } from 'effect'
        const { Class: SchemaClass } = Schema
        class X extends SchemaClass<X>("X")({}) {}
      `,
      filename: PROD,
      errors: [noSuperclassError('class X')],
    },
    {
      name: 'Should_ReportMultipleViolations_When_MultipleClassesInOneFile',
      code: `
        class Foo {}
        const Bar = class {}
      `,
      filename: PROD,
      errors: [noSuperclassError('class Foo'), noSuperclassError('class <anonymous>')],
    },
  ],
})
