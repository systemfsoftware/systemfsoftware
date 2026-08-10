import { CELLS, EXEMPT, UNSANCTIONED_ACTUAL, UNSANCTIONED_FIX } from '../cell-suffix-required.config.js'
import { cellSuffixRequired } from '../cell-suffix-required.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const expectedFor = (cells: ReadonlyArray<string>, exempt: ReadonlyArray<string>): string =>
  `<name>.<cell>.ts with <cell> one of ${cells.join(', ')}, or exactly one of ${exempt.join(', ')}`

const unsanctioned = (
  name: string,
  cells: ReadonlyArray<string> = CELLS,
  exempt: ReadonlyArray<string> = EXEMPT,
) => [{
  messageId: 'unsanctionedCell',
  data: {
    name,
    expected: expectedFor(cells, exempt),
    actual: UNSANCTIONED_ACTUAL,
    fix: UNSANCTIONED_FIX,
  },
}]

ruleTester.run('cell-suffix-required', cellSuffixRequired, {
  valid: [
    {
      name: 'Should_Allow_SourceFile_When_NamesWorkflowCell',
      code: '',
      filename: '/repo/pkg/src/place-order.workflow.ts',
    },
    {
      name: 'Should_Allow_SourceFile_When_NamesStoreCell',
      code: '',
      filename: '/repo/pkg/src/order.store.ts',
    },
    {
      name: 'Should_Allow_SourceFile_When_NamesKernelCell',
      code: '',
      filename: '/repo/pkg/src/money.kernel.ts',
    },
    {
      name: 'Should_Allow_MultiSegmentName_When_LastSegmentIsCell',
      code: '',
      filename: '/repo/pkg/src/place-order.v2.workflow.ts',
    },
    {
      name: 'Should_Allow_CellFile_When_MtsExtension',
      code: '',
      filename: '/repo/pkg/src/place-order.workflow.mts',
    },
    {
      name: 'Should_Allow_CellFile_When_CtsExtension',
      code: '',
      filename: '/repo/pkg/src/place-order.workflow.cts',
    },
    {
      name: 'Should_Allow_Barrel_When_NamedIndex',
      code: '',
      filename: '/repo/pkg/src/index.ts',
    },
    {
      name: 'Should_Allow_CompositionRoot_When_NamedMain',
      code: '',
      filename: '/repo/pkg/src/main.ts',
    },
    {
      name: 'Should_Allow_Barrel_When_NamedMod',
      code: '',
      filename: '/repo/pkg/src/mod.ts',
    },
    {
      name: 'Should_Allow_Component_When_TsxExtension',
      code: '',
      filename: '/repo/pkg/src/OrderButton.tsx',
    },
    {
      name: 'Should_Allow_AmbientDeclaration_When_DtsFile',
      code: '',
      filename: '/repo/pkg/src/globals.d.ts',
    },
    {
      name: 'Should_Allow_GeneratedFile_When_GeneratedSuffix',
      code: '',
      filename: '/repo/pkg/src/foo.generated.ts',
    },
    {
      name: 'Should_Allow_GeneratedFile_When_GeneratedSuffixAfterCell',
      code: '',
      filename: '/repo/pkg/src/order.schema.generated.ts',
    },
    {
      name: 'Should_Allow_TestFile_When_TestSuffix',
      code: '',
      filename: '/repo/pkg/src/money.test.ts',
    },
    {
      name: 'Should_Allow_TestFile_When_SpecSuffix',
      code: '',
      filename: '/repo/pkg/src/money.spec.ts',
    },
    {
      name: 'Should_Allow_AnyName_When_OutsideSrc',
      code: '',
      filename: '/repo/pkg/scripts/build-thing.ts',
    },
    {
      name: 'Should_Allow_TestInfrastructure_When_UnderDunderTestsDir',
      code: '',
      filename: '/repo/pkg/src/__tests__/_tester.ts',
    },
    {
      name: 'Should_Allow_ProjectSuffix_When_CellsOptionCarriesIt',
      code: '',
      filename: '/repo/pkg/src/no-barrels.config.ts',
      options: [{ cells: ['config'] }],
    },
    {
      name: 'Should_Allow_ProjectEntrypoint_When_ExemptOptionCarriesIt',
      code: '',
      filename: '/repo/pkg/src/server.ts',
      options: [{ exempt: ['server.ts'] }],
    },
  ],
  invalid: [
    {
      name: 'Should_Report_SourceFile_When_NoCellSuffix',
      code: '',
      filename: '/repo/pkg/src/money.ts',
      errors: unsanctioned('money.ts'),
    },
    {
      name: 'Should_Report_SourceFile_When_SuffixIsNotACell',
      code: '',
      filename: '/repo/pkg/src/money.helper.ts',
      errors: unsanctioned('money.helper.ts'),
    },
    {
      name: 'Should_Report_BareCellName_When_NoCapabilityPart',
      code: '',
      filename: '/repo/pkg/src/workflow.ts',
      errors: unsanctioned('workflow.ts'),
    },
    {
      name: 'Should_Report_NestedSourceFile_When_DeepUnderSrc',
      code: '',
      filename: '/repo/pkg/src/order/money.ts',
      errors: unsanctioned('money.ts'),
    },
    {
      name: 'Should_Report_DefaultCell_When_CellsOptionExcludesIt',
      code: '',
      filename: '/repo/pkg/src/place-order.workflow.ts',
      options: [{ cells: ['schema'] }],
      errors: unsanctioned('place-order.workflow.ts', ['schema']),
    },
    {
      name: 'Should_Report_DefaultExemptName_When_ExemptOptionExcludesIt',
      code: '',
      filename: '/repo/pkg/src/index.ts',
      options: [{ exempt: ['mod.ts'] }],
      errors: unsanctioned('index.ts', CELLS, ['mod.ts']),
    },
    {
      name: 'Should_Report_SourceFile_When_MtsWithoutCell',
      code: '',
      filename: '/repo/pkg/src/money.mts',
      errors: unsanctioned('money.mts'),
    },
    {
      name: 'Should_Report_SourceFile_When_CtsWithoutCell',
      code: '',
      filename: '/repo/pkg/src/money.cts',
      errors: unsanctioned('money.cts'),
    },
    {
      name: 'Should_Report_GeneratedName_When_MarkerIsWholeBasename',
      code: '',
      filename: '/repo/pkg/src/generated.ts',
      errors: unsanctioned('generated.ts'),
    },
    {
      name: 'Should_Report_GeneratedMarker_When_NotImmediatelyBeforeExtension',
      code: '',
      filename: '/repo/pkg/src/foo.generated.helper.ts',
      errors: unsanctioned('foo.generated.helper.ts'),
    },
    {
      name: 'Should_Report_SourceFile_When_UnderTestsDir',
      code: '',
      filename: '/repo/pkg/src/tests/fixtures.ts',
      errors: unsanctioned('fixtures.ts'),
    },
  ],
})
