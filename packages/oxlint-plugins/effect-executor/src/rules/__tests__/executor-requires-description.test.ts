import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { executorRequiresDescription } from '../executor-requires-description.js'

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

const WORKFLOW_IMPORT = `import { decide } from './order.workflow.js'`
const CELL_IMPORT = `import { Cell } from '@systemfsoftware/effect-cell-types'`

const DESCRIPTION_CODE = `${CELL_IMPORT}
import { Effect, Either, pipe } from 'effect'
${WORKFLOW_IMPORT}

const description = pipe(
  Cell.read((command) => Effect.succeed(command)),
  Cell.decode((raw) => Either.right(raw)),
  Cell.decide((decoded) => Either.map(decide(decoded), (decision) => decision)),
  Cell.encode((outcome) => outcome),
  Cell.write((outcome) => Effect.succeed(outcome)),
)

export const run = (command: unknown): unknown => Cell.apply(description, command)
`

const requiresDescriptionError = (name: string) =>
  ({
    messageId: 'requiresDescription',
    data: {
      name,
      expected: 'every call site that reaches a workflow to express the sandwich as a Cell description',
      actual: 'a call to a workflow decision outside any Cell description',
      fix:
        "import { Cell } from '@systemfsoftware/effect-cell-types' and express this call site as a description whose phases chain by type: Cell.read(...) -> Cell.decode(...) -> Cell.decide(...) -> Cell.encode(...) -> Cell.write(...), then apply it with Cell.apply, so the sandwich order is type-carried instead of hand-sequenced",
    },
  }) as const

ruleTester.run('executor-requires-description', executorRequiresDescription, {
  valid: [
    {
      name: 'Should_Pass_When_WorkflowCallSitsInsideCellDescription',
      code: DESCRIPTION_CODE,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowReachedThroughBarrelSitsInsideCellDescription',
      code: `${CELL_IMPORT}
import { Effect, Either, pipe } from 'effect'
import { decide } from './order-barrels/index.js'

const description = pipe(
  Cell.read((command) => Effect.succeed(command)),
  Cell.decode((raw) => Either.right(raw)),
  Cell.decide((decoded) => Either.map(decide(decoded), (decision) => decision)),
  Cell.encode((outcome) => outcome),
  Cell.write((outcome) => Effect.succeed(outcome)),
)

export const run = (command: unknown): unknown => Cell.apply(description, command)
`,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowImportIsTypeOnly',
      code: `import type { ContentPair } from './extraction.workflow.js'

export const scan = (pair: ContentPair): string => pair.newSide
`,
      filename: 'verdict.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TypeOnlyWorkflowBindingIsCalled',
      code: `import type { decide } from './order.workflow.js'

export const run = (input: unknown): unknown => decide(input)
`,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowValueImportIsNeverCalled',
      code: `import * as S from 'effect/Schema'
import { ExtractableSchema, UnrecoverableError } from './extraction.workflow.js'

export class DecideCommand extends S.TaggedClass<DecideCommand>()('DecideCommand', {
  extraction: S.EitherFromSelf({ left: UnrecoverableError, right: ExtractableSchema }),
}) {}
`,
      filename: 'verdict-command.schema.ts',
    },
    {
      name: 'Should_Pass_When_TestFileCallsWorkflowDecision',
      code: `${WORKFLOW_IMPORT}

export const run = (input: unknown): unknown => decide(input)
`,
      filename: '__tests__/order.workflow.property.test.ts',
    },
    {
      name: 'Should_Pass_When_TestSuffixedFileCallsWorkflowDecision',
      code: `${WORKFLOW_IMPORT}

export const run = (input: unknown): unknown => decide(input)
`,
      filename: 'order.executor.test.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowImportIsNeverCalled',
      code: `${WORKFLOW_IMPORT}

export const run = decide
`,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Pass_When_NonWorkflowImportedFunctionIsCalled',
      code: `import { helper } from './order.utils.js'

export const run = (input: unknown): unknown => helper(input)
`,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Pass_When_PackageEntryImportIsCalled',
      code: `import { make } from './index.js'

export const layer = make()
`,
      filename: 'memory-file-system.adapter.ts',
    },
    {
      name: 'Should_Pass_When_NamedNonBarrelModuleImportIsCalled',
      code: `import { helper } from './order-barrels/helpers.js'

export const run = (input: unknown): unknown => helper(input)
`,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Pass_When_PackageScopedImportIsCalled',
      code: `import { helper } from '@scope/pkg/index.js'

export const run = (input: unknown): unknown => helper(input)
`,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowCallAndDescriptionDeclaredLaterInFile',
      code: `${WORKFLOW_IMPORT}
import { Cell } from '@systemfsoftware/effect-cell-types'

export const run = (input: unknown): unknown => {
  const outcome = decide(input)
  const description = Cell.write(() => Effect.succeed(outcome))
  return Cell.apply(description, input)
}
`,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Pass_When_ParentDirectoryEntryImportIsCalled',
      code: `import { run } from '../index.js'

export const layer = run()
`,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Pass_When_AbsoluteRootEntryImportIsCalled',
      code: `import { run } from '/index.js'

export const layer = run()
`,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Pass_When_ComputedLiteralAccessOnWorkflowNamespace',
      code: `import * as Workflow from './order.workflow.js'

export const run = (input: unknown): unknown => Workflow['decide'](input)
`,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Pass_When_TestDirectoryFileCallsWorkflowDecision',
      code: `${WORKFLOW_IMPORT}

export const run = (input: unknown): unknown => decide(input)
`,
      filename: 'src/__tests__/order.executor.ts',
    },
    {
      name: 'Should_Pass_When_TypeSpecifierWorkflowBindingIsCalled',
      code: `import { type decide } from './order.workflow.js'

export const run = (input: unknown): unknown => decide(input)
`,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Pass_When_NamespaceCellDescriptionDeclaresDescription',
      code: `import * as Cell from '@systemfsoftware/effect-cell-types'
import { Effect } from 'effect'
import { decide } from './order.workflow.js'

export const run = (input: unknown): unknown => {
  const description = Cell.decide((decoded: unknown) => Effect.succeed(decide(decoded)))
  return Cell.apply(description, input)
}
`,
      filename: 'order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_FileCallsWorkflowDecisionWithoutDescription',
      code: `${WORKFLOW_IMPORT}

export const run = (input: unknown): unknown => decide(input)
`,
      filename: 'order.executor.ts',
      errors: [requiresDescriptionError('decide')],
    },
    {
      name: 'Should_Report_When_FileCallsWorkflowDecisionThroughReExportBarrelWithoutDescription',
      code: `import { decide } from './order-barrels/index.js'

export const run = (input: unknown): unknown => decide(input)
`,
      filename: 'order.executor.ts',
      errors: [requiresDescriptionError('decide')],
    },
    {
      name: 'Should_Report_When_FileCallsWorkflowDecisionThroughModBarrelWithoutDescription',
      code: `import { decide } from './order-barrels/mod.js'

export const run = (input: unknown): unknown => decide(input)
`,
      filename: 'order.executor.ts',
      errors: [requiresDescriptionError('decide')],
    },
    {
      name: 'Should_Report_When_FileCallsNamespacedWorkflowDecisionWithoutDescription',
      code: `import * as Workflow from './order.workflow.js'

export const run = (input: unknown): unknown => Workflow.decide(input)
`,
      filename: 'order.executor.ts',
      errors: [requiresDescriptionError('Workflow')],
    },
    {
      name: 'Should_Report_When_FileCallsNamespacedBarrelDecisionWithoutDescription',
      code: `import * as OrderBarrels from './order-barrels/index.js'

export const run = (input: unknown): unknown => OrderBarrels.decide(input)
`,
      filename: 'order.executor.ts',
      errors: [requiresDescriptionError('OrderBarrels')],
    },
    {
      name: 'Should_Report_When_FileCallsAliasedWorkflowDecisionWithoutDescription',
      code: `import { decide as decideOrder } from './order.workflow.js'

export const run = (input: unknown): unknown => decideOrder(input)
`,
      filename: 'order.executor.ts',
      errors: [requiresDescriptionError('decideOrder')],
    },
    {
      name: 'Should_Report_When_FileCallsWorkflowDecisionAndOnlyNonDescriptionCellMemberWithoutDescription',
      code: `${WORKFLOW_IMPORT}
import { Cell } from '@systemfsoftware/effect-cell-types'

export const run = (input: unknown): unknown => {
  const phases = Cell.custom(input)
  return decide(input)
}
`,
      filename: 'order.executor.ts',
      errors: [requiresDescriptionError('decide')],
    },
    {
      name: 'Should_Report_When_FileCallsTwoWorkflowDecisionsWithoutDescription',
      code: `import { decide } from './order.workflow.js'
import { classify } from './classification.workflow.js'

export const run = (input: unknown): unknown => [decide(input), classify(input)]
`,
      filename: 'order.executor.ts',
      errors: [requiresDescriptionError('decide'), requiresDescriptionError('classify')],
    },
    {
      name: 'Should_Report_When_FileCallsWorkflowDecisionThroughAbsoluteBarrelWithoutDescription',
      code: `import { decide } from '/abs/workflows/index.js'

export const run = (input: unknown): unknown => decide(input)
`,
      filename: 'order.executor.ts',
      errors: [requiresDescriptionError('decide')],
    },
    {
      name: 'Should_Report_When_FileCallsWorkflowDecisionAndNonCellMemberDescriptionMethodWithoutDescription',
      code: `import { decide } from './order.workflow.js'
import { helper } from './order.utils.js'

export const run = (input: unknown): unknown => {
  const shaped = helper.read(input)
  return decide(input)
}
`,
      filename: 'order.executor.ts',
      errors: [requiresDescriptionError('decide')],
    },
    {
      name: 'Should_Report_When_FileCallsComputedMemberOnWorkflowNamespaceWithoutDescription',
      code: `import * as Workflow from './order.workflow.js'

export const run = (input: unknown, key: string): unknown => Workflow[key](input)
`,
      filename: 'order.executor.ts',
      errors: [requiresDescriptionError('Workflow')],
    },
    {
      name: 'Should_Report_When_TypeOnlyCellImportDoesNotDeclareDescription',
      code: `import type { Cell } from '@systemfsoftware/effect-cell-types'
import { decide } from './order.workflow.js'

export const run = (input: unknown): unknown => {
  const description = Cell.read(input)
  return decide(input)
}
`,
      filename: 'order.executor.ts',
      errors: [requiresDescriptionError('decide')],
    },
    {
      name: 'Should_Report_When_TypeSpecifierCellImportDoesNotDeclareDescription',
      code: `import { type Cell } from '@systemfsoftware/effect-cell-types'
import { decide } from './order.workflow.js'

export const run = (input: unknown): unknown => {
  const description = Cell.read(input)
  return decide(input)
}
`,
      filename: 'order.executor.ts',
      errors: [requiresDescriptionError('decide')],
    },
  ],
})
