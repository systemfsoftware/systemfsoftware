import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowEitherInhabited } from '../workflow-either-inhabited.js'

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

const UNIT_DECISION = `class Allow extends S.TaggedClass<Allow>()('Allow', {}) {}`
const FIELDED_DECISION = `class Approved extends S.TaggedClass<Approved>()('Approved', { amount: S.Number }) {}`
const TAGGED_ERROR = `class Denied extends S.TaggedError<Denied>()('Denied', { reason: S.String }) {}`
const UNTAGGED_CLASS = `class Denied extends S.TaggedClass<Denied>()('Denied', { reason: S.String }) {}`

const uninhabitedError = (name: string, actual: string) => ({
  messageId: 'uninhabitedErrorChannel' as const,
  data: {
    name: `The error channel of ${name}`,
    expected: 'an inhabited S.TaggedError variant',
    actual,
    fix:
      'name the domain error the consumer aborts on and declare it as an S.TaggedError; if the decision is total, drop the Either and return the bare union so the tag carries the choice',
  },
})

const uninhabitedDecision = (name: string, actual: string) => ({
  messageId: 'uninhabitedDecisionChannel' as const,
  data: {
    name: `The decision channel of ${name}`,
    expected: 'a decision that carries information — two or more variants, or one variant with fields',
    actual,
    fix:
      'an Either whose decision channel is a unit is Option<Error> in disguise; return Option<Error>, or return the bare union so the tag carries the choice',
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

ruleTester.run('workflow-either-inhabited', workflowEitherInhabited, {
  valid: [
    {
      name: 'Should_Ignore_When_FileIsNotAWorkflow',
      code:
        `${UNIT_DECISION}\nexport const decide = (cmd: Cmd): Either.Either<Allow, never> => Either.right(new Allow())`,
      filename: 'prompt-destination.kernel.ts',
    },
    {
      name: 'Should_Pass_When_TotalDecisionReturnsABareUnion',
      code: `${UNIT_DECISION}\n${TAGGED_ERROR}\nexport const decide = (cmd: Cmd): DelegationVerdict => verdict`,
      filename: 'no-skill-delegation.workflow.ts',
    },
    {
      name: 'Should_Pass_When_BothChannelsCarryInformation',
      code:
        `${FIELDED_DECISION}\n${TAGGED_ERROR}\nexport const decide = (cmd: Cmd): Either.Either<Approved, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_DecisionIsASingleVariantWithFields',
      code:
        `${FIELDED_DECISION}\n${TAGGED_ERROR}\nexport const decide = (cmd: Cmd): Either.Either<Approved, Denied> => Either.right(new Approved({ amount: 1 }))`,
      filename: 'submit-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_DecisionChannelIsAUnionOfUnitVariants',
      code:
        `${UNIT_DECISION}\n${TAGGED_ERROR}\nexport const decide = (cmd: Cmd): Either.Either<Allow | Escalate, Denied> => Either.right(new Allow())`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_UnitClassIsConstructedOnTheRightOfAFieldedDecision',
      code:
        `${FIELDED_DECISION}\n${UNTAGGED_CLASS}\nexport const decide = (cmd: Cmd): Either.Either<Approved, Denied> => Either.right(new Approved({ amount: 1 }))`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TaggedErrorIsImportedUnqualified',
      code:
        `class Denied extends TaggedError<Denied>()('Denied', { reason: S.String }) {}\n${FIELDED_DECISION}\nexport const decide = (cmd: Cmd): Either.Either<Approved, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_SuperclassIsNotACall',
      code:
        `class Legacy extends BaseThing {}\n${FIELDED_DECISION}\n${TAGGED_ERROR}\nexport const decide = (cmd: Cmd): Either.Either<Approved, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ExportedVariableIsNotAFunction',
      code: `export const LIMIT: Money = money(100)`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_FunctionExpressionHasBothChannels',
      code:
        `${FIELDED_DECISION}\n${TAGGED_ERROR}\nexport const decide = function (cmd: Cmd): Either.Either<Approved, Denied> { return Either.right(new Approved({ amount: 1 })) }`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ReturnIsAQualifiedNonEitherType',
      code:
        `${UNIT_DECISION}\n${TAGGED_ERROR}\nexport const decide = (cmd: Cmd): Option.Option<Denied> => Option.none()`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_DecisionFieldsComeFromAnIdentifier',
      code:
        `class Allow extends S.TaggedClass<Allow>()('Allow', AllowFields) {}\n${TAGGED_ERROR}\nexport const decide = (cmd: Cmd): Either.Either<Allow, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
    },
    {
      name: 'Should_Pass_When_DecisionExtendsAnUnrecognisedFactoryBase',
      code:
        `class Allow extends factory()('Allow', {}) {}\n${TAGGED_ERROR}\nexport const decide = (cmd: Cmd): Either.Either<Allow, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_DecisionChannelIsAUnitVariant',
      code:
        `${UNIT_DECISION}\n${TAGGED_ERROR}\nexport const decideNoSkillDelegation = (cmd: Cmd): Either.Either<Allow, Denied> => Either.right(new Allow())`,
      filename: 'no-skill-delegation.workflow.ts',
      errors: [uninhabitedDecision('decideNoSkillDelegation', 'Allow, a single variant with no fields')],
    },
    {
      name: 'Should_Report_When_UnitDecisionIsDeclaredAfterTheExport',
      code:
        `${TAGGED_ERROR}\nexport const decide = (cmd: Cmd): Either.Either<Allow, Denied> => Either.right(new Allow())\n${UNIT_DECISION}`,
      filename: 'decide-access.workflow.ts',
      errors: [uninhabitedDecision('decide', 'Allow, a single variant with no fields')],
    },
    {
      name: 'Should_Report_When_TaggedClassIsDeclaredWithNoFieldsArgument',
      code:
        `class Allow extends S.TaggedClass<Allow>()('Allow') {}\n${TAGGED_ERROR}\nexport const decide = (cmd: Cmd): Either.Either<Allow, Denied> => Either.right(new Allow())`,
      filename: 'decide-access.workflow.ts',
      errors: [uninhabitedDecision('decide', 'Allow, a single variant with no fields')],
    },
    {
      name: 'Should_Report_When_DecisionChannelIsVoid',
      code:
        `${TAGGED_ERROR}\nexport const decide = (cmd: Cmd): Either.Either<void, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
      errors: [uninhabitedDecision('decide', 'void')],
    },
    {
      name: 'Should_Report_When_ErrorChannelIsNever',
      code:
        `${FIELDED_DECISION}\nexport const decide = (cmd: Cmd): Either.Either<Approved, never> => Either.right(new Approved({ amount: 1 }))`,
      filename: 'decide-access.workflow.ts',
      errors: [uninhabitedError('decide', 'never, which declares no domain error')],
    },
    {
      name: 'Should_Report_When_ErrorChannelIsString',
      code:
        `${FIELDED_DECISION}\nexport const decide = (cmd: Cmd): Either.Either<Approved, string> => Either.right(new Approved({ amount: 1 }))`,
      filename: 'decide-access.workflow.ts',
      errors: [uninhabitedError('decide', 'string, which declares no domain error')],
    },
    {
      name: 'Should_Report_When_EitherHasNoTypeArguments',
      code: `${FIELDED_DECISION}\nexport const decide = (cmd: Cmd): Either.Either => result`,
      filename: 'decide-access.workflow.ts',
      errors: [uninhabitedError('decide', 'an unparameterized Either')],
    },
    {
      name: 'Should_Report_When_QualifiedEitherHasNoTypeArguments',
      code: `${FIELDED_DECISION}\nexport const decide = (cmd: Cmd): Either => result`,
      filename: 'decide-access.workflow.ts',
      errors: [uninhabitedError('decide', 'an unparameterized Either')],
    },
    {
      name: 'Should_Report_When_FunctionDeclarationErrorChannelIsNever',
      code: `${FIELDED_DECISION}\nexport function decide(cmd: Cmd): Either.Either<Approved, never> { return ok }`,
      filename: 'decide-access.workflow.ts',
      errors: [uninhabitedError('decide', 'never, which declares no domain error')],
    },
    {
      name: 'Should_Report_When_FunctionExpressionErrorChannelIsNever',
      code:
        `${FIELDED_DECISION}\nexport const decide = function (cmd: Cmd): Either.Either<Approved, never> { return ok }`,
      filename: 'decide-access.workflow.ts',
      errors: [uninhabitedError('decide', 'never, which declares no domain error')],
    },
    {
      name: 'Should_Report_BothChannels_When_DecisionIsUnitAndErrorIsNever',
      code:
        `${UNIT_DECISION}\nexport const decide = (cmd: Cmd): Either.Either<Allow, never> => Either.right(new Allow())`,
      filename: 'decide-access.workflow.ts',
      errors: [
        uninhabitedError('decide', 'never, which declares no domain error'),
        uninhabitedDecision('decide', 'Allow, a single variant with no fields'),
      ],
    },
    {
      name: 'Should_Report_When_PlainErrorIsPassedToLeft',
      code:
        `${FIELDED_DECISION}\n${TAGGED_ERROR}\nexport const decide = (cmd: Cmd): Either.Either<Approved, Denied> => Either.left(new Error('boom'))`,
      filename: 'decide-access.workflow.ts',
      errors: [plainError('Error', 'a plain JavaScript Error')],
    },
    {
      name: 'Should_Report_When_UntaggedClassIsPassedToLeft',
      code:
        `${FIELDED_DECISION}\n${UNTAGGED_CLASS}\nexport const decide = (cmd: Cmd): Either.Either<Approved, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
      errors: [plainError('Denied', 'Denied, which does not extend S.TaggedError')],
    },
    {
      name: 'Should_Report_When_UntaggedClassIsDeclaredAfterTheLeftCall',
      code:
        `${FIELDED_DECISION}\nexport const decide = (cmd: Cmd): Either.Either<Approved, Denied> => Either.left(new Denied({ reason: 'x' }))\n${UNTAGGED_CLASS}`,
      filename: 'decide-access.workflow.ts',
      errors: [plainError('Denied', 'Denied, which does not extend S.TaggedError')],
    },
    {
      name: 'Should_Report_When_UnqualifiedTaggedClassIsPassedToLeft',
      code:
        `${FIELDED_DECISION}\nclass Denied extends TaggedClass<Denied>()('Denied', { reason: S.String }) {}\nexport const decide = (cmd: Cmd): Either.Either<Approved, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
      errors: [plainError('Denied', 'Denied, which does not extend S.TaggedError')],
    },
    {
      name: 'Should_Report_When_FactoryBaseClassIsPassedToLeft',
      code:
        `${FIELDED_DECISION}\nclass Denied extends factory()()('Denied', { reason: S.String }) {}\nexport const decide = (cmd: Cmd): Either.Either<Approved, Denied> => Either.left(new Denied({ reason: 'x' }))`,
      filename: 'decide-access.workflow.ts',
      errors: [plainError('Denied', 'Denied, which does not extend S.TaggedError')],
    },
  ],
})
