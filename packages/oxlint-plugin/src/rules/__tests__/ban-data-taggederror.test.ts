import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { banDataTaggedError } from '../ban-data-taggederror.js'

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

ruleTester.run('ban-data-taggederror', banDataTaggedError, {
  valid: [
    // --- Correct: S.TaggedError ---
    {
      name: 'Should_Pass_When_UsingSTaggedError',
      code: `
        import { Schema as S } from 'effect'
        class MyError extends S.TaggedError('MyError')<{ message: string }> {}
      `,
    },
    {
      name: 'Should_Pass_When_UsingSchemaTaggedError',
      code: `
        import { Schema } from 'effect'
        class MyError extends Schema.TaggedError('MyError')<{ message: string }> {}
      `,
    },

    // --- Other patterns ---
    {
      name: 'Should_Pass_When_UsingOtherObjectsNamedData',
      code: `
        const Data = { TaggedError: (tag: string) => class {} }
        class MyError extends Data.TaggedError('MyError') {}
      `,
    },
    {
      name: 'Should_Pass_When_DataIsImportedFromDifferentPackage',
      code: `
        import { Data } from 'some-other-package'
        class MyError extends Data.TaggedError('MyError') {}
      `,
    },
    {
      name: 'Should_Pass_When_LocalDataVariableDeclaredAfterImport',
      code: `
        import { Data } from 'effect'
        const Data = { TaggedError: (tag: string) => class {} }
        class MyError extends Data.TaggedError('MyError') {}
      `,
    },
    {
      name: 'Should_Pass_When_DataTaggedErrorChained',
      code: `
        import { Data } from 'effect'
        const x = Data.TaggedError.something
      `,
    },
    {
      name: 'Should_Pass_When_DataIsSecondVariableDeclaration',
      code: `
        const x = 1, Data = { TaggedError: (tag: string) => class {} }
        class MyError extends Data.TaggedError('MyError') {}
      `,
    },

    // --- Other Data methods should not be flagged ---
    {
      name: 'Should_Pass_When_UsingOtherDataMethods',
      code: `
        import { Data } from 'effect'
        class MyClass extends Data.Class({}) {}
        const myStruct = Data.struct({ name: 'test' })
      `,
    },
    {
      name: 'Should_Pass_When_UsingRegularClasses',
      code: `
        class MyError extends Error {
          constructor(message: string) {
            super(message)
          }
        }
      `,
    },
    {
      name: 'Should_Pass_When_ClassHasNoSuperClass',
      code: `
        import { Data } from 'effect'
        class MyClass {}
      `,
    },
    {
      name: 'Should_Pass_When_NoDataImport_DefaultsToEffectButNoUsage',
      code: `
        class MyError extends Error {}
      `,
    },
    {
      name: 'Should_Pass_When_NoDataImport_ButDataNotUsed',
      code: `
        const x = 1
      `,
    },

    // --- Tests to kill survived mutants ---
    {
      name: 'Should_Pass_When_ImportingOtherSpecifiersAlongsideData',
      code: `
        import { Data, Effect, Schema } from 'effect'
        const x = Effect.succeed(1)
      `,
    },
    {
      name: 'Should_Pass_When_ImportingDataWithAliasFromNonEffectPackage',
      code: `
        import { Data as D } from 'some-other-package'
        class MyError extends D.TaggedError('MyError') {}
      `,
    },
    {
      name: 'Should_Pass_When_ClassExtendsOtherTaggedError',
      code: `
        import { Schema } from 'effect'
        class MyError extends Schema.TaggedError('MyError')<{ msg: string }> {}
      `,
    },
    {
      name: 'Should_Pass_When_LocalDataVariableShadowsEffectDataInCallExpression',
      code: `
        import { Data } from 'effect'
        const Data = { TaggedError: () => class {} }
        const x = Data.TaggedError('X')
      `,
    },
    {
      name: 'Should_Pass_When_LocalDataVariableShadowsInMemberExpression',
      code: `
        import { Data } from 'effect'
        const Data = { TaggedError: () => class {} }
        const fn = Data.TaggedError
      `,
    },
  ],
  invalid: [
    // --- Class extending Data.TaggedError ---
    {
      name: 'Should_Report_When_ClassExtendsDataTaggedError',
      code: `
        import { Data } from 'effect'
        class MyError extends Data.TaggedError('MyError')<{ message: string }> {}
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_ClassExtendsDataTaggedErrorCallInsideTSInstantiation',
      code: `
        import { Data } from 'effect'
        class MyError extends Data.TaggedError('MyError')<{ msg: string }> {}
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },

    // --- Variable assignment ---
    {
      name: 'Should_Report_When_AssigningToVariable',
      code: `
        import { Data } from 'effect'
        const MyError = Data.TaggedError('MyError')
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_ExportingVariable',
      code: `
        import { Data } from 'effect'
        export const MyError = Data.TaggedError('MyError')
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },

    // --- Direct call without class ---
    {
      name: 'Should_Report_When_CallingDirectly',
      code: `
        import { Data } from 'effect'
        const ErrorClass = Data.TaggedError('MyError')
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_CallingNestedDirectly',
      code: `
        import { Data } from 'effect'
        const ErrorClass = Data.TaggedError('MyError')<{}>
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_DataTaggedErrorIsUsedAsPropertyAccess',
      code: `
        import { Data } from 'effect'
        const fn = Data.TaggedError
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },

    // --- Real-world patterns from codebase ---
    {
      name: 'Should_Report_TransactionSubmitErrorPattern',
      code: `
        import { Data } from 'effect'
        export class TransactionSubmitError extends Data.TaggedError('TransactionSubmitError')<{
          cause: unknown
          message: string
        }> {}
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_DatabaseConnectionErrorPattern',
      code: `
        import { Data } from 'effect'
        export class DatabaseConnectionError extends Data.TaggedError('DatabaseConnectionError')<{
          cause: Error
        }> {}
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_BlockchainErrorPattern',
      code: `
        import { Data } from 'effect'
        export class BlockchainError extends Data.TaggedError('BlockchainError')<{
          message: string
        }> {}
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },

    // --- Class extends without type arguments (covers extractExpression returning node as-is) ---
    {
      name: 'Should_Report_When_ClassExtendsDataTaggedErrorNoTypeArgs',
      code: `
        import { Data } from 'effect'
        class MyError extends Data.TaggedError('MyError') {}
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },

    // --- Class extends with type arguments (covers TSInstantiationExpression extraction) ---
    {
      name: 'Should_Report_When_ClassExtendsDataTaggedErrorWithEmptyType',
      code: `
        import { Data } from 'effect'
        class MyError extends Data.TaggedError('MyError')<{}> {}
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_ClassExtendsDataTaggedErrorWithComplexType',
      code: `
        import { Data } from 'effect'
        class MyError extends Data.TaggedError('MyError')<{ cause: Error; message: string }> {}
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_ClassExtendsDataTaggedErrorWithNestedType',
      code: `
        import { Data } from 'effect'
        class MyError extends Data.TaggedError('MyError')<{ data: { id: string } }> {}
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },

    // --- Data with other parent types (covers isInsideSuperClass false branch) ---
    {
      name: 'Should_Report_When_DataTaggedErrorInArrayExpression',
      code: `
        import { Data } from 'effect'
        const errors = [Data.TaggedError('Err1'), Data.TaggedError('Err2')]
      `,
      errors: [
        { messageId: 'noDataTaggedError' },
        { messageId: 'noDataTaggedError' },
      ],
    },

    // --- Additional edge cases ---
    {
      name: 'Should_Report_When_ClassExtendsDataTaggedErrorWithGenericCall',
      code: `
        import { Data } from 'effect'
        type MyType = { message: string }
        class MyError extends Data.TaggedError('MyError')<MyType> {}
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_MultipleClassesExtendDataTaggedError',
      code: `
        import { Data } from 'effect'
        class Error1 extends Data.TaggedError('Error1') {}
        class Error2 extends Data.TaggedError('Error2')<{ code: number }> {}
      `,
      errors: [
        { messageId: 'noDataTaggedError' },
        { messageId: 'noDataTaggedError' },
      ],
    },
    {
      name: 'Should_Report_When_DataTaggedErrorInTemplateExpression',
      code: `
        import { Data } from 'effect'
        const errors = [
          Data.TaggedError('Error1'),
          Data.TaggedError('Error2')<{}>,
        ]
      `,
      errors: [
        { messageId: 'noDataTaggedError' },
        { messageId: 'noDataTaggedError' },
      ],
    },
    {
      name: 'Should_Report_When_DataTaggedErrorInObjectLiteral',
      code: `
        import { Data } from 'effect'
        const errorMap = {
          a: Data.TaggedError('ErrorA'),
          b: Data.TaggedError('ErrorB')<{}>,
        }
      `,
      errors: [
        { messageId: 'noDataTaggedError' },
        { messageId: 'noDataTaggedError' },
      ],
    },

    // --- Tests to kill survived mutants ---
    {
      name: 'Should_Report_When_DataImportedWithDefaultNameAndUsed',
      code: `
        import { Data } from 'effect'
        const x = Data.TaggedError('X')
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_DataAliasedAndAliasUsed',
      code: `
        import { Data as D } from 'effect'
        const x = D.TaggedError('X')
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_NoImportButDataTaggedErrorUsed',
      code: `
        class MyError extends Data.TaggedError('MyError') {}
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_DataTaggedErrorCallNotInClassDeclaration',
      code: `
        import { Data } from 'effect'
        const fn = () => Data.TaggedError('X')
        fn()
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_DataTaggedErrorIsTopLevelCall',
      code: `
        import { Data } from 'effect'
        Data.TaggedError('X')
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_DataTaggedErrorIsStandaloneExpression',
      code: `
        import { Data } from 'effect'
        Data.TaggedError
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_DataTaggedErrorIsArgumentOfCall',
      code: `
        import { Data } from 'effect'
        fn(Data.TaggedError)
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_DataTaggedErrorAsReturnValue',
      code: `
        import { Data } from 'effect'
        function getError() {
          return Data.TaggedError
        }
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_DataTaggedErrorInNewExpression',
      code: `
        import { Data } from 'effect'
        const x = new (Data.TaggedError('X') as any)()
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_DataIsFirstSpecifier',
      code: `
        import { Data, Effect } from 'effect'
        class MyError extends Data.TaggedError('MyError') {}
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_DataIsLastSpecifier',
      code: `
        import { Effect, Data } from 'effect'
        class MyError extends Data.TaggedError('MyError') {}
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_DataAliasedFromEffect',
      code: `
        import { Data as D } from 'effect'
        class MyError extends D.TaggedError('MyError') {}
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_CallInNestedExpression',
      code: `
        import { Data } from 'effect'
        const fn = () => Data.TaggedError('MyError')
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_DataTaggedErrorInClassMethod',
      code: `
        import { Data } from 'effect'
        class MyClass {
          method() {
            const ErrClass = Data.TaggedError('MyError')
            return ErrClass
          }
        }
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
    {
      name: 'Should_Report_When_CallInsideObjectExpression',
      code: `
        import { Data } from 'effect'
        const obj = {
          err: Data.TaggedError('MyError')
        }
      `,
      errors: [{
        messageId: 'noDataTaggedError',
        data: {
          name: 'Data.TaggedError',
          expected: "S.TaggedError or Schema.TaggedError from 'effect' package",
          actual: 'Data.TaggedError',
          fix: "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>",
        },
      }],
    },
  ],
})
