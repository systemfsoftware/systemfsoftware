import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  ANONYMOUS_EXPORT_ACTUAL,
  MECHANISM_STEM_ACTUAL,
  MECHANISM_STEM_EXPECTED,
  MECHANISM_STEM_FIX,
  STEM_EXPORT_MISMATCH_ACTUAL,
  STEM_EXPORT_MISMATCH_EXPECTED,
  STEM_EXPORT_MISMATCH_FIX,
  STEM_NOT_KEBAB_ACTUAL,
  STEM_NOT_KEBAB_EXPECTED,
  STEM_NOT_KEBAB_FIX,
  STEM_TOO_SHORT_ACTUAL,
  STEM_TOO_SHORT_EXPECTED,
  STEM_TOO_SHORT_FIX,
  VACANT_FIRST_TOKEN_ACTUAL,
  VACANT_FIRST_TOKEN_EXPECTED,
  VACANT_FIRST_TOKEN_FIX,
} from '../damp-workflow-stem.config.js'
import { dampWorkflowStem } from '../damp-workflow-stem.js'

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

const IMPORT = `import { Workflow } from '@systemfsoftware/effect-cell-types'`

const workflow = (stem: string): string => `/repo/pkg/src/${stem}.workflow.ts`

const notKebabError = (name: string) => ({
  messageId: 'stemNotKebab' as const,
  data: {
    name,
    expected: STEM_NOT_KEBAB_EXPECTED,
    actual: STEM_NOT_KEBAB_ACTUAL,
    fix: STEM_NOT_KEBAB_FIX,
  },
})

const tooShortError = (name: string) => ({
  messageId: 'stemTooShort' as const,
  data: {
    name,
    expected: STEM_TOO_SHORT_EXPECTED,
    actual: STEM_TOO_SHORT_ACTUAL,
    fix: STEM_TOO_SHORT_FIX,
  },
})

const vacantError = (name: string) => ({
  messageId: 'vacantFirstToken' as const,
  data: {
    name,
    expected: VACANT_FIRST_TOKEN_EXPECTED,
    actual: VACANT_FIRST_TOKEN_ACTUAL,
    fix: VACANT_FIRST_TOKEN_FIX,
  },
})

const mechanismError = (name: string) => ({
  messageId: 'mechanismStem' as const,
  data: {
    name,
    expected: MECHANISM_STEM_EXPECTED,
    actual: MECHANISM_STEM_ACTUAL,
    fix: MECHANISM_STEM_FIX,
  },
})

const mismatchError = (name: string) => ({
  messageId: 'stemExportMismatch' as const,
  data: {
    name,
    expected: STEM_EXPORT_MISMATCH_EXPECTED,
    actual: STEM_EXPORT_MISMATCH_ACTUAL,
    fix: STEM_EXPORT_MISMATCH_FIX,
  },
})

const anonymousError = (name: string) => ({
  messageId: 'stemExportMismatch' as const,
  data: {
    name,
    expected: STEM_EXPORT_MISMATCH_EXPECTED,
    actual: ANONYMOUS_EXPORT_ACTUAL,
    fix: STEM_EXPORT_MISMATCH_FIX,
  },
})

ruleTester.run('damp-workflow-stem', dampWorkflowStem, {
  valid: [
    {
      name: 'Should_Pass_When_StemIsATwoTokenDecisionPhrase',
      code: 'export const admitOrder = 1',
      filename: workflow('admit-order'),
    },
    {
      name: 'Should_Pass_When_LaterTokensAreNouns',
      code: 'export const admitSurvivorsRun = 1',
      filename: workflow('admit-survivors-run'),
    },
    {
      name: 'Should_Pass_When_StemNamesTheClassification',
      code: 'export const classifyMutant = 1',
      filename: workflow('classify-mutant'),
    },
    {
      name: 'Should_Pass_When_StemCarriesAnAcronymToken',
      code: 'export const writeJsonReport = 1',
      filename: workflow('write-json-report'),
    },
    {
      name: 'Should_Pass_When_StemIsThreeTokens',
      code: 'export const chooseRestartStrategy = 1',
      filename: workflow('choose-restart-strategy'),
    },
    {
      name: 'Should_Pass_When_StemIsFiveTokens',
      code: 'export const admitOrderInSmallBatches = 1',
      filename: workflow('admit-order-in-small-batches'),
    },
    {
      name: 'Should_Pass_When_SecondTokenIsNumeric',
      code: 'export const log2Exits = 1',
      filename: workflow('log2-exits'),
    },
    {
      name: 'Should_SkipMismatch_When_FileExportsNoValues',
      code: `import * as S from 'effect/Schema'\nexport class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}`,
      filename: workflow('admit-order'),
    },
    {
      name: 'Should_Pass_When_FileIsNotAWorkflowFile',
      code: 'export const Config = 1',
      filename: '/repo/pkg/src/Config.ts',
    },
    {
      name: 'Should_Pass_When_StemCarriesAnExtraPeriod',
      code: 'export const order = 1',
      filename: '/repo/pkg/src/place.order.workflow.ts',
    },
    {
      name: 'Should_SkipMismatch_When_FileExportsTwoValues',
      code: 'export const prepareWorkflow = 1\nexport const otherThing = 2',
      filename: workflow('prepare-run'),
    },
  ],
  invalid: [
    {
      name: 'Should_ReportNotKebab_When_StemIsUppercase',
      code: 'export const somethingElse = 1',
      filename: workflow('Config'),
      errors: [notKebabError('Config.workflow.ts')],
    },
    {
      name: 'Should_ReportNotKebab_When_StemUsesUnderscores',
      code: 'export const somethingElse = 1',
      filename: workflow('restart_decision'),
      errors: [notKebabError('restart_decision.workflow.ts')],
    },
    {
      name: 'Should_ReportNotKebab_When_StemIsCamelCase',
      code: 'export const somethingElse = 1',
      filename: workflow('restartDecision'),
      errors: [notKebabError('restartDecision.workflow.ts')],
    },
    {
      name: 'Should_ReportNotKebab_When_StemIsSixTokens',
      code: 'export const somethingElse = 1',
      filename: workflow('admit-order-in-small-batches-now'),
      errors: [notKebabError('admit-order-in-small-batches-now.workflow.ts')],
    },
    {
      name: 'Should_ReportTooShort_When_StemIsAVacantVerb',
      code: 'export const somethingElse = 1',
      filename: workflow('run'),
      errors: [tooShortError('run.workflow.ts')],
    },
    {
      name: 'Should_ReportTooShort_When_StemIsAMechanismToken',
      code: 'export const somethingElse = 1',
      filename: workflow('config'),
      errors: [tooShortError('config.workflow.ts')],
    },
    {
      name: 'Should_ReportVacant_When_FirstTokenIsRun',
      code: 'export const runMutation = 1',
      filename: workflow('run-mutation'),
      errors: [vacantError('run-mutation.workflow.ts')],
    },
    {
      name: 'Should_ReportVacant_When_FirstTokenIsHandle',
      code: 'export const handleCommand = 1',
      filename: workflow('handle-command'),
      errors: [vacantError('handle-command.workflow.ts')],
    },
    {
      name: 'Should_ReportVacant_When_FirstTokenIsProcess',
      code: 'export const somethingElse = 1',
      filename: workflow('process-data'),
      errors: [vacantError('process-data.workflow.ts')],
    },
    {
      name: 'Should_ReportVacant_When_FirstTokenIsDecide',
      code: 'export const somethingElse = 1',
      filename: workflow('decide-the-verdict'),
      errors: [vacantError('decide-the-verdict.workflow.ts')],
    },
    {
      name: 'Should_ReportMechanism_When_FirstTokenIsHandler',
      code: 'export const handlerWorkflow = 1',
      filename: workflow('handler-workflow'),
      errors: [mechanismError('handler-workflow.workflow.ts')],
    },
    {
      name: 'Should_ReportMechanism_When_FirstTokenIsConfig',
      code: 'export const somethingElse = 1',
      filename: workflow('config-settings'),
      errors: [mechanismError('config-settings.workflow.ts')],
    },
    {
      name: 'Should_ReportMechanism_When_FirstTokenIsInstrument',
      code: 'export const instrumentFiles = 1',
      filename: workflow('instrument-files'),
      errors: [mechanismError('instrument-files.workflow.ts')],
    },
    {
      name: 'Should_ReportMismatch_When_ExportKeepsItsOldName',
      code: 'export const prepareWorkflow = 1',
      filename: workflow('prepare-run'),
      errors: [mismatchError('prepare-run.workflow.ts')],
    },
    {
      name: 'Should_ReportMismatch_When_StemAndExportDisagree',
      code: 'export const admitLoadedSettings = 1',
      filename: workflow('admit-settings'),
      errors: [mismatchError('admit-settings.workflow.ts')],
    },
    {
      name: 'Should_ReportMismatch_When_TheOnlyExportIsAnonymous',
      code: `${IMPORT}\nexport default Workflow.make((input: number) => input)`,
      filename: workflow('prepare-run'),
      errors: [anonymousError('prepare-run.workflow.ts')],
    },
  ],
})
