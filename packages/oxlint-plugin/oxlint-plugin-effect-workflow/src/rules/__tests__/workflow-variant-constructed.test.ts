import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowVariantConstructed } from '../workflow-variant-constructed.js'

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

// The expected report data is written out here rather than imported from the rule's
// config: an import would compare the config with itself and pass on any rewording.
const UNCONSTRUCTED_EXPECTED =
  'a construction site in this file for every variant the construction declares in its decision and error channels'
const UNCONSTRUCTED_ACTUAL = 'a declared variant with no new X(…) or X.make(…) anywhere in this file'
const UNCONSTRUCTED_FIX =
  'construct the variant in this file with new X(…) or X.make(…), or delete it from the union and from every dispatch over it'

const variantError = (name: string): { readonly messageId: string; readonly data: Record<string, string> } => ({
  messageId: 'unconstructedVariant',
  data: { name, expected: UNCONSTRUCTED_EXPECTED, actual: UNCONSTRUCTED_ACTUAL, fix: UNCONSTRUCTED_FIX },
})

ruleTester.run('workflow-variant-constructed', workflowVariantConstructed, {
  valid: [
    {
      // Kills the mutant that reports a lawful file: every variant the named alias
      // declares is constructed, one per Match arm.
      name: 'Should_Pass_When_EveryVariantOfANamedAliasIsConstructedInAMatchArm',
      filename: '/repo/pkg/src/admit-amount.workflow.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {}) {}
export class Rejected extends S.TaggedClass<Rejected>()('Rejected', {}) {}
export type AmountDecision = Admitted | Rejected

export const admitAmount = Workflow.make(
  AmountCommand,
  (command: AmountCommand): Result.Result<AmountDecision, never> =>
    Match.value(command.amount > 0).pipe(
      Match.when(true, () => Result.succeed(new Admitted({}))),
      Match.when(false, () => Result.succeed(new Rejected({}))),
      Match.exhaustive,
    ),
)
`,
    },
    {
      // Kills the mutant that recognizes only \`new X(…)\`: a variant built through
      // its schema's own \`make\` is constructed just the same.
      name: 'Should_Pass_When_AVariantIsConstructedThroughItsSchemaMake',
      filename: '/repo/pkg/src/choose-restart-strategy.workflow.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class RestartDecisionContinue extends S.TaggedClass<RestartDecisionContinue>()('Continue', {}) {}
export class RestartDecisionRestart extends S.TaggedClass<RestartDecisionRestart>()('Restart', {}) {}
export type RestartDecisionOutcome = Result.Result<RestartDecisionContinue | RestartDecisionRestart, never>

export const chooseStrategy = Workflow.make(
  DecideInput,
  (command: DecideInput): RestartDecisionOutcome =>
    Match.value(command.intensityExceeded).pipe(
      Match.when(true, () => Result.succeed(RestartDecisionContinue.make())),
      Match.when(false, () => Result.succeed(RestartDecisionRestart.make({ indices: [command.failedIndex] }))),
      Match.exhaustive,
    ),
)
`,
    },
    {
      // Kills the mutant that keys on \`make\`: a total construction declares its
      // decision channel too, and both of its variants are built in the body.
      name: 'Should_Pass_When_ATotalWorkflowConstructsBothVariantsInItsBody',
      filename: '/repo/pkg/src/total-admit-amount.workflow.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {}) {}
export class Rejected extends S.TaggedClass<Rejected>()('Rejected', {}) {}

export const totalAdmitAmount = Workflow.total(
  AmountCommand,
  (command: AmountCommand): Result.Result<Admitted | Rejected, never> =>
    Match.value(command.amount > 0).pipe(
      Match.when(true, () => Result.succeed(new Admitted({}))),
      Match.when(false, () => Result.succeed(new Rejected({}))),
      Match.exhaustive,
    ),
)
`,
    },
    {
      // Kills the mutant that treats a composing constructor as a decision owner: an
      // andThen file holds no decider body, and its components' variants belong to
      // the files that build them.
      name: 'Should_Pass_When_TheFileOnlyComposesImportedWorkflowsWithAndThen',
      filename: '/repo/pkg/src/chain-admit-decisions.workflow.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import { admitDecodedCommand } from './admit-decoded-command.workflow.js'
import { totalAdmitDecision } from './total-admit-decision.workflow.js'

export const chainAdmitDecisions = Workflow.andThen(
  Decoded,
  admitDecodedCommand,
  SettleCommand,
  totalAdmitDecision,
)
`,
    },
    {
      // Kills the mutant that judges names it cannot resolve: an imported variant is
      // not declared in this file, so this file's AST cannot decide its reach.
      name: 'Should_Pass_When_TheDeclaredVariantsAreImportedRatherThanDeclaredHere',
      filename: '/repo/pkg/src/total-admit-decision.workflow.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import { Admitted, Rejected } from './admit-decoded-command.workflow.js'

export const totalAdmitDecision = Workflow.total(
  SettleCommand,
  (command: SettleCommand): Result.Result<Admitted | Rejected, never> => Result.succeed(command.decision),
)
`,
    },
    {
      // Kills the mutant that visits a type-test probe: \`*.tst.ts\` asserts what the
      // constructor promises, runs nowhere, and is exempt — the same costume as the
      // invalid fixture below is silent under this filename.
      name: 'Should_Pass_When_TheFileIsATypeTestProbe',
      filename: '/repo/pkg/test-types/Workflow.tst.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {}) {}
export class Rejected extends S.TaggedClass<Rejected>()('Rejected', {}) {}

export const admitAmount = Workflow.make(
  AmountCommand,
  (command: AmountCommand): Result.Result<Admitted | Rejected, never> =>
    Match.value(command.amount > 0).pipe(
      Match.when(true, () => Result.succeed(new Admitted({}))),
      Match.when(false, () => Result.succeed(new Admitted({}))),
      Match.exhaustive,
    ),
)
`,
    },
    {
      // Kills the mutant that invents a channel: no return annotation declares one,
      // so there is no declared variant set to judge.
      name: 'Should_Pass_When_TheDeciderDeclaresNoReturnAnnotation',
      filename: '/repo/pkg/src/admit-amount.workflow.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'

export const admitAmount = Workflow.make(AmountCommand, (command: AmountCommand) =>
  Result.succeed(command.decision))
`,
    },
    {
      // Kills the mutant that scopes construction to the decider body: construction
      // is a file-wide fact, so a variant built by a file-local helper counts.
      name: 'Should_Pass_When_TheVariantsAreConstructedByAFileLocalHelper',
      filename: '/repo/pkg/src/admit-amount.workflow.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {}) {}
export class Rejected extends S.TaggedClass<Rejected>()('Rejected', {}) {}

const decisionFor = (amount: number): Admitted | Rejected =>
  Match.value(amount > 0).pipe(
    Match.when(true, () => new Admitted({})),
    Match.when(false, () => new Rejected({})),
    Match.exhaustive,
  )

export const admitAmount = Workflow.make(
  AmountCommand,
  (command: AmountCommand): Result.Result<Admitted | Rejected, never> =>
    Result.succeed(decisionFor(command.amount)),
)
`,
    },
    {
      // Kills the mutant that reads a type reference as a construction: a type query
      // is erased, so no boundary and no verdict exist in this file.
      name: 'Should_Pass_When_TheConstructorIsReferencedOnlyAsAType',
      filename: '/repo/pkg/src/admit-amount.kernel.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'

export type AdmitSignature = typeof Workflow.make
`,
    },
    {
      // Kills the mutant that reads a Schema.Union const as a variant name of its own:
      // the const's members are the declared variants, and both are constructed.
      name: 'Should_Pass_When_TheDeclaredUnionIsASchemaUnionConst',
      filename: '/repo/pkg/src/admit-survivors-run.workflow.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {}) {}
export class NoSurvivors extends S.TaggedClass<NoSurvivors>()('NoSurvivors', {}) {}
export class SurvivorsRejection extends S.TaggedError<SurvivorsRejection>()('SurvivorsRejection', {}) {}
export const SurvivorsAdmission = S.Union([Admitted, NoSurvivors])
export type SurvivorsAdmission = S.Schema.Type<typeof SurvivorsAdmission>

export const admitSurvivorsRun = Workflow.make(
  AdmitSurvivorsRunCommand,
  (command: AdmitSurvivorsRunCommand): Result.Result<SurvivorsAdmission, SurvivorsRejection> =>
    Match.value(command.outcome).pipe(
      Match.when('admitted', () => Result.succeed(Admitted.make({ survivors: command.priorSurvivors }))),
      Match.when('none', () => Result.succeed(NoSurvivors.make())),
      Match.when('rejected', () => Result.fail(SurvivorsRejection.make({ reason: 'no-report' }))),
      Match.exhaustive,
    ),
)
`,
    },
  ],
  invalid: [
    {
      // Kills the mutant that never reports: one variant of the named alias has no
      // construction site, so exactly one report naming it must appear.
      name: 'Should_ReportTheUnconstructedVariant_When_ANamedAliasUnionIsHalfConstructed',
      filename: '/repo/pkg/src/admit-amount.workflow.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {}) {}
export class Rejected extends S.TaggedClass<Rejected>()('Rejected', {}) {}
export type AmountDecision = Admitted | Rejected

export const admitAmount = Workflow.make(
  AmountCommand,
  (command: AmountCommand): Result.Result<AmountDecision, never> =>
    Match.value(command.amount > 0).pipe(
      Match.when(true, () => Result.succeed(new Admitted({}))),
      Match.when(false, () => Result.succeed(new Admitted({}))),
      Match.exhaustive,
    ),
)
`,
      errors: [variantError('the declared decision variant Rejected')],
    },
    {
      // Kills the mutant that reads only a named alias: the inline Result.Result<…>
      // annotation is the other declared form, and the union member it names goes
      // unconstructed here.
      name: 'Should_ReportTheUnconstructedVariant_When_TheReturnAnnotationDeclaresTheUnionInline',
      filename: '/repo/pkg/src/admit-amount.workflow.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {}) {}
export class Rejected extends S.TaggedClass<Rejected>()('Rejected', {}) {}

export const admitAmount = Workflow.make(
  AmountCommand,
  (command: AmountCommand): Result.Result<Admitted | Rejected, never> =>
    Match.value(command.amount > 0).pipe(
      Match.when(true, () => Result.succeed(new Admitted({}))),
      Match.when(false, () => Result.succeed(new Admitted({}))),
      Match.exhaustive,
    ),
)
`,
      errors: [variantError('the declared decision variant Rejected')],
    },
    {
      // Kills the mutant that reads only the decision channel: the error union is
      // declared by the same annotation, and Refused is never built.
      name: 'Should_ReportTheUnconstructedError_When_OneDeclaredErrorVariantIsNeverBuilt',
      filename: '/repo/pkg/src/admit-amount.workflow.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {}) {}
export class Malformed extends S.TaggedError<Malformed>()('Malformed', {}) {}
export class Refused extends S.TaggedError<Refused>()('Refused', {}) {}

export const admitAmount = Workflow.make(
  AmountCommand,
  (command: AmountCommand): Result.Result<Admitted, Malformed | Refused> =>
    Match.value(command.amount > 0).pipe(
      Match.when(true, () => Result.succeed(new Admitted({}))),
      Match.when(false, () => Result.fail(new Malformed({}))),
      Match.exhaustive,
    ),
)
`,
      errors: [variantError('the declared error variant Refused')],
    },
    {
      // Kills the mutant that reads text instead of the syntax tree: a variant named
      // in a comment and in a string literal has no construction site.
      name: 'Should_ReportTheUnconstructedVariant_When_TheOnlyMentionIsACommentOrString',
      filename: '/repo/pkg/src/admit-amount.workflow.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {}) {}
export class Rejected extends S.TaggedClass<Rejected>()('Rejected', {}) {}

// new Rejected({}) belongs here once the ledger can refuse an amount.
const note = 'new Rejected({})'

export const admitAmount = Workflow.make(
  AmountCommand,
  (command: AmountCommand): Result.Result<Admitted | Rejected, never> => Result.succeed(new Admitted({})),
)
`,
      errors: [variantError('the declared decision variant Rejected')],
    },
    {
      // Kills the mutant that stops at a union alias: the aliases that name the whole
      // Result — the production form — are followed one hop to the channels inside.
      name: 'Should_ReportTheUnconstructedVariant_When_TheResultIsNamedByAnInFileAlias',
      filename: '/repo/pkg/src/choose-restart-strategy.workflow.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class RestartDecisionContinue extends S.TaggedClass<RestartDecisionContinue>()('Continue', {}) {}
export class RestartDecisionRestart extends S.TaggedClass<RestartDecisionRestart>()('Restart', {}) {}

export type RestartDecisionOutcome = Result.Result<RestartDecisionContinue | RestartDecisionRestart, never>

export const chooseStrategy = Workflow.make(
  DecideInput,
  (command: DecideInput): RestartDecisionOutcome =>
    Match.value(command.intensityExceeded).pipe(
      Match.when(true, () => Result.succeed(RestartDecisionContinue.make())),
      Match.when(false, () => Result.succeed(RestartDecisionContinue.make())),
      Match.exhaustive,
    ),
)
`,
      errors: [variantError('the declared decision variant RestartDecisionRestart')],
    },
    {
      // Kills the mutant that reads a Schema.Union const as a variant name of its own:
      // the const's members are the declared variants, and NoSurvivors has no site.
      name: 'Should_ReportTheUnconstructedVariant_When_TheDeclaredUnionIsASchemaUnionConst',
      filename: '/repo/pkg/src/admit-survivors-run.workflow.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {}) {}
export class NoSurvivors extends S.TaggedClass<NoSurvivors>()('NoSurvivors', {}) {}
export const SurvivorsAdmission = S.Union([Admitted, NoSurvivors])
export type SurvivorsAdmission = S.Schema.Type<typeof SurvivorsAdmission>

export const admitSurvivorsRun = Workflow.make(
  AdmitSurvivorsRunCommand,
  (command: AdmitSurvivorsRunCommand): Result.Result<SurvivorsAdmission, never> =>
    Match.value(command.priorSurvivors.length > 0).pipe(
      Match.when(true, () => Result.succeed(Admitted.make({ survivors: command.priorSurvivors }))),
      Match.when(false, () => Result.succeed(Admitted.make({ survivors: [] }))),
      Match.exhaustive,
    ),
)
`,
      errors: [variantError('the declared decision variant NoSurvivors')],
    },
    {
      name: 'Should_ReportTheUnconstructedVariant_When_TheOnlyConstructionIsInATypePosition',
      filename: '/repo/pkg/src/admit-amount.workflow.ts',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {}) {}
export class Rejected extends S.TaggedClass<Rejected>()('Rejected', {}) {}

export type RejectedKeyed = { [new Rejected({})]: string }

export const admitAmount = Workflow.make(
  AmountCommand,
  (command: AmountCommand): Result.Result<Admitted | Rejected, never> => Result.succeed(new Admitted({})),
)
`,
      errors: [variantError('the declared decision variant Rejected')],
    },
  ],
})
