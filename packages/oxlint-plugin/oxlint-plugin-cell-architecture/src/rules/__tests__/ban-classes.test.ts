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
      // The dominant spelling in this repo, and the one the rule used to reject:
      // a per-module namespace import binds the MEMBERS of `Context`, so the
      // extends-expression supplies only `Service` and the namespace has to come
      // from the specifier.
      name: 'Should_Pass_When_ExtendsContextService_ViaDeepNamespaceImport',
      code: `
        import * as Context from 'effect/Context'
        class SandboxDirectory extends Context.Service<SandboxDirectory, string>()('SandboxDirectory') {}
      `,
      filename: PROD,
    },
    {
      name: 'Should_Pass_When_ExtendsTaggedError_ViaDeepNamespaceImportAliasedToS',
      code: `
        import * as S from 'effect/Schema'
        class ParseFailed extends S.TaggedError<ParseFailed>()('ParseFailed', { file: S.String }) {}
      `,
      filename: PROD,
    },
    {
      // A `declare module` augmentation emits nothing: no field, no constructor,
      // no instance. None of the harms this rule prevents can occur there, and
      // there is no alternative spelling to migrate it to.
      name: 'Should_Pass_When_ClassIsAmbient_InsideDeclareModule',
      code: `
        declare module '@babel/core' {
          export class File {
            constructor(options: { filename?: string })
            public ast: unknown
          }
        }
      `,
      filename: PROD,
    },
    {
      // Same reasoning as the `declare module` case, one nesting level out: a
      // file-scope `declare class` carries the ambient flag on itself and has no
      // ambient module ancestor, so a walk that starts at the parent misses it
      // and reports a declaration that emits nothing.
      name: 'Should_Pass_When_ClassIsAmbient_AtFileScope',
      code: `
        declare class LegacyEmitter extends EventTarget {
          public emit(event: string): void
        }
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
      name: 'Should_ReportViolation_When_ClassExtendsObject',
      code: `class Foo extends Object {}`,
      filename: PROD,
      errors: [unsanctionedBaseError('class Foo', 'Object')],
    },
    {
      name: 'Should_ReportViolation_When_ClassExtendsFunction',
      code: `class Foo extends Function {}`,
      filename: PROD,
      errors: [unsanctionedBaseError('class Foo', 'Function')],
    },
    {
      name: 'Should_ReportViolation_When_ClassInsideNonAmbientNamespace',
      code: `
        namespace Shapes {
          export class Circle {}
        }
      `,
      filename: PROD,
      errors: [noSuperclassError('class Circle')],
    },
    {
      name: 'Should_ReportViolation_When_ClassExpressionHasNoSuperclass',
      code: `const Foo = class {}`,
      filename: PROD,
      errors: [noSuperclassError('class <anonymous>')],
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
