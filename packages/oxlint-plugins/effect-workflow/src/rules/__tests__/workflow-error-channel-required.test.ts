import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowErrorChannelRequired } from '../workflow-error-channel-required.js'

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

const BARE_UNION_EXPORT = `export const decideRefInjection = (cmd: CheckRefInjectionCommand): RefVerdict => verdict`

const TAGGED_ERROR_DECL = `class Denied extends S.TaggedError<Denied>()('Denied', { reason: S.String }) {}`
const TAGGED_CLASS_DECL = `class Denied extends S.TaggedClass<Denied>()('Denied', { reason: S.String }) {}`

const missing = (name: string) => ({
  messageId: 'missingErrorChannel' as const,
  data: {
    name: `The exported workflow ${name}`,
    expected: 'a return type of Either<Decision, Error>',
    actual: 'a return type with no error channel',
    fix:
      'add the domain error the consumer branches on and return Either<Decision, Error>; a total computation with no domain error is not a workflow — rename the file to a .kernel.ts or .observer.ts cell',
  },
})

const uninhabited = (name: string, actual: string) => ({
  messageId: 'uninhabitedErrorChannel' as const,
  data: {
    name: `The error channel of ${name}`,
    expected: 'an inhabited S.TaggedError variant',
    actual: `${actual}, which declares no domain error`,
    fix:
      'name the domain error the consumer aborts on and declare it as an S.TaggedError; if no such error exists this is not a workflow — rename the file to a .kernel.ts or .observer.ts cell',
  },
})

const unparameterized = (name: string) => ({
  messageId: 'uninhabitedErrorChannel' as const,
  data: {
    name: `The error channel of ${name}`,
    expected: 'an inhabited S.TaggedError variant',
    actual: 'an unparameterized Either',
    fix:
      'name the domain error the consumer aborts on and declare it as an S.TaggedError; if no such error exists this is not a workflow — rename the file to a .kernel.ts or .observer.ts cell',
  },
})

const plainError = (constructed: string, actual: string) => ({
  messageId: 'plainErrorChannel' as const,
  data: {
    name: `The value passed to Either.left (${constructed})`,
    expected: 'an S.TaggedError declared in this workflow',
    actual,
    fix:
      `declare ${constructed} as class ${constructed} extends S.TaggedError<${constructed}>()('${constructed}', { ... }) so the error carries a tag the consumer can dispatch on`,
  },
})

ruleTester.run('workflow-error-channel-required', workflowErrorChannelRequired, {
  valid: [
    {
      name: 'Should_Ignore_When_FileIsNotAWorkflow',
      code: `${TAGGED_CLASS_DECL}\n${BARE_UNION_EXPORT}\nconst x = Either.left(new Error('boom'))`,
      filename: 'inject-instructions.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ReturnsQualifiedEitherWithTaggedError',
      code:
        `${TAGGED_ERROR_DECL}\nexport const interpretHookResult = (cmd: InterpretHookCommand): Either.Either<HookDecision, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'hook-verdict.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ReturnsBareEither',
      code:
        `export const cancelOrder = (cmd: CancelOrderCommand): Either<CancelOrderDecision, CancelOrderError> => result`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_FunctionDeclarationReturnsEither',
      code:
        `export function cancelOrder(cmd: CancelOrderCommand): Either.Either<Decision, CancelError> { return result }`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ExportHasNoDeclaration',
      code: `const local = 1; export { local }`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ExportIsNotAFunction',
      code: `export const CancelOrderDecision = S.Union(Cancelled, Refunded)`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TaggedErrorIsExported',
      code:
        `export ${TAGGED_ERROR_DECL}\nexport const decide = (cmd: Cmd): Either.Either<Allowed, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_LeftArgumentIsNotAConstructor',
      code:
        `${TAGGED_ERROR_DECL}\nexport const decide = (cmd: Cmd): Either.Either<Allowed, Denied> => Either.left(existingError)`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_UntaggedClassIsConstructedOnTheRightChannel',
      code:
        `class Approved extends S.TaggedClass<Approved>()('Approved', {}) {}\n${TAGGED_ERROR_DECL}\nexport const decide = (cmd: Cmd): Either.Either<Approved, Denied> => Either.right(new Approved({}))`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ClassHasNoSuperClass',
      code:
        `class Bare {}\n${TAGGED_ERROR_DECL}\nexport const decide = (cmd: Cmd): Either.Either<Allowed, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_MemberCallIsNotEitherLeft',
      code:
        `${TAGGED_CLASS_DECL}\nexport const decide = (cmd: Cmd): Either.Either<Allowed, Failure> => Option.some(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_EitherLeftHasNoArguments',
      code: `${TAGGED_CLASS_DECL}\nexport const decide = (cmd: Cmd): Either.Either<Allowed, Failure> => Either.left()`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_EitherLeftCarriesNonConstructorValue',
      code:
        `${TAGGED_CLASS_DECL}\nexport const decide = (cmd: Cmd): Either.Either<Allowed, Failure> => Either.left(denied)`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ExportedVariableIsNotAFunction',
      code: `export const LIMIT: Money = money(100)`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TaggedErrorIsImportedUnqualified',
      code:
        `class Denied extends TaggedError<Denied>()('Denied', { reason: S.String }) {}\nexport const decide = (cmd: Cmd): Either.Either<Allowed, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_SuperClassIsNotACall',
      code:
        `${TAGGED_ERROR_DECL}\nclass Legacy extends BaseThing {}\nexport const decide = (cmd: Cmd): Either.Either<Allowed, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ArrowHasNoReturnAnnotation',
      code: `export const cancelOrder = (cmd) => result`,
      filename: 'cancel-order.workflow.ts',
      errors: [missing('cancelOrder')],
    },
    {
      name: 'Should_Report_When_ReturnsBareUnion',
      code: BARE_UNION_EXPORT,
      filename: 'inject-instructions.workflow.ts',
      errors: [missing('decideRefInjection')],
    },
    {
      name: 'Should_Report_When_ReturnsOption',
      code: `export const decideNoSkillDelegation = (cmd: CheckDelegationCommand): Option.Option<Verdict> => v`,
      filename: 'no-skill-delegation.workflow.ts',
      errors: [missing('decideNoSkillDelegation')],
    },
    {
      name: 'Should_Report_When_ReturnsPrimitive',
      code: `export const isHostBound = (text: string): boolean => true`,
      filename: 'prompt-destination.workflow.ts',
      errors: [missing('isHostBound')],
    },
    {
      name: 'Should_Report_When_FunctionDeclarationReturnsBareUnion',
      code: `export function decideRefInjection(cmd: CheckRefInjectionCommand): RefVerdict { return verdict }`,
      filename: 'inject-instructions.workflow.ts',
      errors: [missing('decideRefInjection')],
    },
    {
      name: 'Should_Report_When_QualifiedTypeIsNotEither',
      code: `export const decide = (cmd: Cmd): Effect.Effect<Decision> => result`,
      filename: 'cancel-order.workflow.ts',
      errors: [missing('decide')],
    },
    {
      name: 'Should_Report_When_ErrorChannelIsNever',
      code: `export const decideAccess = (cmd: Cmd): Either.Either<AccessDecision, never> => Either.right(allowed)`,
      filename: 'decide-access.workflow.ts',
      errors: [uninhabited('decideAccess', 'never')],
    },
    {
      name: 'Should_Report_When_ErrorChannelIsVoid',
      code: `export const decideAccess = (cmd: Cmd): Either.Either<AccessDecision, void> => Either.right(allowed)`,
      filename: 'decide-access.workflow.ts',
      errors: [uninhabited('decideAccess', 'void')],
    },
    {
      name: 'Should_Report_When_EitherHasNoTypeArguments',
      code: `export const decideAccess = (cmd: Cmd): Either => result`,
      filename: 'decide-access.workflow.ts',
      errors: [unparameterized('decideAccess')],
    },
    {
      name: 'Should_Report_When_QualifiedEitherHasNoTypeArguments',
      code: `export const decideAccess = (cmd: Cmd): Either.Either => result`,
      filename: 'decide-access.workflow.ts',
      errors: [unparameterized('decideAccess')],
    },
    {
      name: 'Should_Report_When_ErrorChannelIsString',
      code: `export const decideAccess = (cmd: Cmd): Either.Either<AccessDecision, string> => Either.right(allowed)`,
      filename: 'decide-access.workflow.ts',
      errors: [uninhabited('decideAccess', 'string')],
    },
    {
      name: 'Should_Report_When_FunctionDeclarationErrorChannelIsNever',
      code: `export function decideAccess(cmd: Cmd): Either.Either<AccessDecision, never> { return ok }`,
      filename: 'decide-access.workflow.ts',
      errors: [uninhabited('decideAccess', 'never')],
    },
    {
      name: 'Should_Report_When_LeftCarriesPlainError',
      code: `export const decide = (cmd: Cmd): Either.Either<Allowed, Denied> => Either.left(new Error('no grant'))`,
      filename: 'decide-access.workflow.ts',
      errors: [plainError('Error', 'a plain JavaScript Error')],
    },
    {
      name: 'Should_Report_When_LeftCarriesTaggedClassNotTaggedError',
      code:
        `${TAGGED_CLASS_DECL}\nexport const decide = (cmd: Cmd): Either.Either<Allowed, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
      errors: [plainError('Denied', 'Denied, which does not extend S.TaggedError')],
    },
    {
      name: 'Should_Report_When_LeftCarriesPlainErrorInsideNestedPipe',
      code:
        `${TAGGED_ERROR_DECL}\nexport const decide = (cmd: Cmd): Either.Either<Allowed, Denied> => Match.value(cmd).pipe(Match.tag('A', () => Either.left(new Error('x'))), Match.exhaustive)`,
      filename: 'decide-access.workflow.ts',
      errors: [plainError('Error', 'a plain JavaScript Error')],
    },
    {
      name: 'Should_Report_When_UnqualifiedTaggedClassIsPassedToLeft',
      code:
        `class Denied extends TaggedClass<Denied>()('Denied', { reason: S.String }) {}\nexport const decide = (cmd: Cmd): Either.Either<Allowed, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
      errors: [plainError('Denied', 'Denied, which does not extend S.TaggedError')],
    },
    {
      name: 'Should_Report_When_ExportIsAFunctionExpressionWithoutEither',
      code: `export const decide = function (cmd: Cmd): RefVerdict { return verdict }`,
      filename: 'inject-instructions.workflow.ts',
      errors: [missing('decide')],
    },
    {
      name: 'Should_Report_When_LeftCarriesClassWithNonCallSuperClass',
      code:
        `class Legacy extends BaseThing {}\nexport const decide = (cmd: Cmd): Either.Either<Allowed, Legacy> => Either.left(new Legacy())`,
      filename: 'decide-access.workflow.ts',
      errors: [plainError('Legacy', 'Legacy, which does not extend S.TaggedError')],
    },
  ],
})
