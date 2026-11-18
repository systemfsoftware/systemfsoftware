import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { workflowPropertySubject } from '../workflow-property-subject.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const ROOT = realpathSync(mkdtempSync(join(tmpdir(), 'workflow-property-subject-')))

const files: Readonly<Record<string, string>> = {
  'packages/ledger/package.json': JSON.stringify({ name: '@acme/ledger', exports: { '.': './src/mod.ts' } }),
  'packages/ledger/src/settle.workflow.ts':
    'export const settle = (ledger) => ledger\nexport const closePeriod = (p) => p\n',
  'packages/ledger/src/entry.schema.ts': 'export const balanceOf = (e) => e\nexport const debit = (e) => e\n',
  'packages/ledger/src/digest.ts': 'export const digestOf = (e) => e\n',
  'packages/ledger/src/mod.ts':
    "export { settle } from './settle.workflow.js'\nexport * from './digest.js'\nexport * as Entries from './entry.schema.js'\nexport * as Settle from './settle.workflow.js'\n",
  'packages/ledger/src/laundered.workflow.ts': "export { balanceOf } from './entry.schema.js'\n",
  'packages/periods/package.json': JSON.stringify({
    name: '@acme/periods',
    exports: { './*': './src/*.ts', './flows/*': './src/flows/*.workflow.ts', './internal/*': null },
  }),
  'packages/periods/src/flows/close.workflow.ts': 'export const close = (p) => p\n',
  'packages/periods/src/flows/close.ts': 'export const close = (p) => p\n',
  'packages/periods/src/internal/open.workflow.ts': 'export const open = (p) => p\n',
  'packages/ledger/src/workflow/runner.ts': 'export const run = (r) => r\n',
  'packages/ledger/src/default.workflow.ts':
    "import { balanceOf } from './entry.schema.js'\nexport default balanceOf\n",
  'packages/ledger/src/aliased.workflow.ts':
    "import { balanceOf } from './entry.schema.js'\nconst alias = balanceOf\nexport { alias }\n",
  'packages/ledger/src/destructured.workflow.ts':
    'const helpers = { balanceOf: (e) => e }\nexport const { balanceOf } = helpers\n',
}

for (const [path, text] of Object.entries(files)) {
  mkdirSync(dirname(join(ROOT, path)), { recursive: true })
  writeFileSync(join(ROOT, path), text)
}

mkdirSync(join(ROOT, 'node_modules/@acme'), { recursive: true })
symlinkSync(join(ROOT, 'packages/periods'), join(ROOT, 'node_modules/@acme/periods'))

const FILE = join(ROOT, 'packages/ledger/src/__tests__/settle.workflow.property.test.ts')
const PLAIN_PROPERTY = join(ROOT, 'packages/ledger/src/__tests__/settle.property.test.ts')

const localError = (actual: string) => ({
  messageId: 'localSubject' as const,
  data: {
    name: 'a workflow property whose subject is declared in the test file',
    expected: 'a subject imported from the *.workflow.ts file the property tests',
    actual,
    fix:
      'delete the local declaration and pass the workflow function itself; a subject the test builds is the test checking itself',
  },
})

const foreignError = (actual: string) => ({
  messageId: 'foreignSubject' as const,
  data: {
    name: 'a workflow property whose subject is declared outside a workflow module',
    expected: 'a subject declared in a *.workflow.ts module, imported directly or through any re-export',
    actual,
    fix: 'test the workflow that owns the function, or move the property next to the module that declares it',
  },
})

ruleTester.run('workflow-property-subject', workflowPropertySubject, {
  valid: [
    {
      name: 'Should_Allow_Subject_When_ImportedFromAWorkflowModule',
      code: `
        import { settle } from '../settle.workflow.ts'
        it.prop('∀l_Ledger_≡Balanced', { of: [], subject: settle }, (subject) => true)
      `,
      filename: FILE,
    },
    {
      name: 'Should_Allow_Subject_When_PackageEntryReExportsAWorkflowFunction',
      code: `
        import { settle } from '@acme/ledger'
        it.prop('∀l_Ledger_≡Balanced', { of: [], subject: settle }, (subject) => true)
      `,
      filename: FILE,
    },
    {
      name: 'Should_Allow_NamespaceMember_When_MemberIsDeclaredInAWorkflowModule',
      code: `
        import * as Settle from '../settle.workflow.js'
        it.effect.prop('∀l_Ledger_≡Balanced', { of: [], subject: Settle.settle }, (subject) => true)
      `,
      filename: FILE,
    },
    {
      name: 'Should_Allow_MemberOfANamespaceReExport_When_MemberIsDeclaredInAWorkflowModule',
      code: `
        import { Settle } from '@acme/ledger'
        it.prop('∀l_Ledger_≡Balanced', { of: [], subject: Settle.settle }, (subject) => true)
      `,
      filename: FILE,
    },
    {
      name: 'Should_Allow_ExtensionlessSpecifier_When_ItNamesAWorkflowModule',
      code: `
        import { closePeriod } from '../settle.workflow'
        it.prop('∀p_Period_≡Closed', { of: [], subject: closePeriod }, (subject) => true)
      `,
      filename: FILE,
    },
    {
      name: 'Should_Allow_OptionsVariable_When_ItsSubjectIsAWorkflowFunction',
      code: `
        import { settle } from '../settle.workflow.ts'
        const options = { of: [], subject: settle }
        it.prop('∀l_Ledger_≡Balanced', options, (subject) => true)
      `,
      filename: FILE,
    },
    {
      name: 'Should_Allow_AnySubject_When_NoPropertyInTheFileTestsAWorkflow',
      code: `
        const helper = (a) => a
        it.prop('∀a_A_≡A', { of: [], subject: helper }, (subject) => true)
      `,
      filename: join(ROOT, 'packages/ledger/src/__tests__/entry.schema.property.test.ts'),
    },
    {
      name: 'Should_Allow_Subject_When_TheLongestExportsPatternNamesAWorkflow',
      code: `
        import { close } from '@acme/periods/flows/close'
        it.prop('∀p_Period_≡Closed', { of: [], subject: close }, (subject) => true)
      `,
      filename: FILE,
    },
    {
      name: 'Should_Allow_Subject_When_OptionsAreAsConst',
      code: `
        import { settle } from '../settle.workflow.ts'
        const options = { of: [], subject: settle } as const
        it.prop('∀l_Ledger_≡Balanced', options, (subject) => true)
        it.prop('∀l_Ledger_≡Settled', { of: [], subject: settle } satisfies object, (subject) => true)
      `,
      filename: FILE,
    },
    {
      name: 'Should_Allow_ConstPredicate_When_ItIsNotAnOptionsObject',
      code: `
        import { settle } from '../settle.workflow.ts'
        const check = (subject) => true
        it.prop('∀l_Ledger_≡Balanced', { of: [], subject: settle }, check)
      `,
      filename: FILE,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_ForeignSubject_When_ExportsBlockTheSubpath',
      code: `
        import { open } from '@acme/periods/internal/open.workflow'
        it.prop('∀p_Period_≡Opened', { of: [], subject: open }, (subject) => true)
      `,
      filename: FILE,
      errors: [
        foreignError(
          'the subject open, imported from @acme/periods/internal/open.workflow, which the rule could not resolve',
        ),
      ],
    },
    {
      name: 'Should_Report_ForeignSubject_When_AWorkflowDefaultExportsASchemaFunction',
      code: `
        import balanceOf from '../default.workflow.ts'
        it.prop('∀e_E_≡E', { of: [], subject: balanceOf }, (subject) => true)
      `,
      filename: FILE,
      errors: [
        foreignError('the subject balanceOf, imported from ../default.workflow.ts and declared in entry.schema.ts'),
      ],
    },
    {
      name: 'Should_Report_ForeignSubject_When_AWorkflowExportsAnAliasOfASchemaFunction',
      code: `
        import { alias } from '../aliased.workflow.ts'
        it.prop('∀e_E_≡E', { of: [], subject: alias }, (subject) => true)
      `,
      filename: FILE,
      errors: [foreignError('the subject alias, imported from ../aliased.workflow.ts and declared in entry.schema.ts')],
    },
    {
      name: 'Should_Report_ForeignSubject_When_AWorkflowExportsADestructuredBinding',
      code: `
        import { balanceOf } from '../destructured.workflow.ts'
        it.prop('∀e_E_≡E', { of: [], subject: balanceOf }, (subject) => true)
      `,
      filename: FILE,
      errors: [
        foreignError(
          'the subject balanceOf, imported from ../destructured.workflow.ts, whose declaration the rule could not trace past destructured.workflow.ts',
        ),
      ],
    },
    {
      name: 'Should_Report_ForeignSubject_When_TheWorkflowDoesNotExportTheName',
      code: `
        import { missing } from '../settle.workflow.ts'
        it.prop('∀e_E_≡E', { of: [], subject: missing }, (subject) => true)
      `,
      filename: FILE,
      errors: [
        foreignError(
          'the subject missing, imported from ../settle.workflow.ts, whose declaration the rule could not trace past settle.workflow.ts',
        ),
      ],
    },
    {
      name: 'Should_Report_LocalSubject_When_OptionsAreAReassignableLet',
      code: `
        import { settle } from '../settle.workflow.ts'
        let options = { of: [], subject: settle }
        options = { of: [], subject: (l) => l }
        it.prop('∀e_E_≡E', options, (subject) => true)
      `,
      filename: FILE,
      errors: [localError('a subject hidden behind a spread, a computed key or a non-literal options value')],
    },
    {
      name: 'Should_Report_LocalSubject_When_AsConstOptionsHoldALocalHelper',
      code: `
        import { settle } from '../settle.workflow.ts'
        const helper = (l) => l
        it.prop('∀e_E_≡E', { of: [], subject: helper } as const, (subject) => true)
      `,
      filename: FILE,
      errors: [localError('the subject helper, declared in the test file')],
    },
    {
      name: 'Should_Report_LocalSubject_When_SubjectIsAHelperDeclaredInTheTest',
      code: `
        import { debit } from '../entry.schema.ts'
        const everyEntryOf = (amount) => [debit({ amount })]
        it.prop('∀e_Entries_≡Debited', { of: [], subject: everyEntryOf }, (subject) => true)
      `,
      filename: FILE,
      errors: [localError('the subject everyEntryOf, declared in the test file')],
    },
    {
      name: 'Should_Report_LocalSubject_When_ALocalBindingShadowsAWorkflowImport',
      code: `
        import { settle } from '../settle.workflow.ts'
        describe('ledger', () => {
          const settle = (ledger) => ledger
          it.prop('∀l_Ledger_≡Balanced', { of: [], subject: settle }, (subject) => true)
        })
      `,
      filename: FILE,
      errors: [localError('the subject settle, declared in the test file')],
    },
    {
      name: 'Should_Report_LocalSubject_When_SubjectIsAnInlineFunction',
      code: `
        import { settle } from '../settle.workflow.ts'
        it.prop('∀l_Ledger_≡Balanced', { of: [], subject: (ledger) => settle(ledger) }, (subject) => true)
      `,
      filename: FILE,
      errors: [localError('a subject built in the test file as an expression')],
    },
    {
      name: 'Should_Report_LocalSubject_When_OptionsHideTheSubjectBehindASpread',
      code: `
        import { settle } from '../settle.workflow.ts'
        const base = { subject: (l) => l }
        it.prop('∀l_Ledger_≡Balanced', { of: [], ...base }, (subject) => true)
      `,
      filename: FILE,
      errors: [localError('a subject hidden behind a spread, a computed key or a non-literal options value')],
    },
    {
      name: 'Should_Report_LocalSubject_When_SubjectIsAMemberOfANamedImport',
      code: `
        import { settle } from '../settle.workflow.ts'
        it.prop('∀l_Ledger_≡Balanced', { of: [], subject: settle.withRetries }, (subject) => true)
      `,
      filename: FILE,
      errors: [localError('the subject settle.withRetries, a member of an imported value')],
    },
    {
      name: 'Should_Report_ForeignSubject_When_PackageEntryReExportsANonWorkflowFunction',
      code: `
        import { digestOf } from '@acme/ledger'
        it.prop('∀e_Entries_≡DigestUnchangedByOrder', { of: [], subject: digestOf }, (subject) => true)
      `,
      filename: FILE,
      errors: [foreignError('the subject digestOf, imported from @acme/ledger and declared in digest.ts')],
    },
    {
      name: 'Should_Report_ForeignSubject_When_NamespaceReExportMemberIsASchemaFunction',
      code: `
        import { Entries } from '@acme/ledger'
        it.prop('∀e_Entries_≡Balanced', { of: [], subject: Entries.balanceOf }, (subject) => true)
      `,
      filename: FILE,
      errors: [
        foreignError('the subject Entries.balanceOf, imported from @acme/ledger and declared in entry.schema.ts'),
      ],
    },
    {
      name: 'Should_Report_ForeignSubject_When_SubjectComesFromASchemaModule',
      code: `
        import { balanceOf } from '../entry.schema.ts'
        it.prop('∀e_Entries_≡Balanced', { of: [], subject: balanceOf }, (subject) => true)
      `,
      filename: FILE,
      errors: [foreignError('the subject balanceOf, imported from ../entry.schema.ts and declared in entry.schema.ts')],
    },
    {
      name: 'Should_Report_ForeignSubject_When_AWorkflowFileOnlyReExportsASchemaFunction',
      code: `
        import { balanceOf } from '../laundered.workflow.ts'
        it.prop('∀e_Entries_≡Balanced', { of: [], subject: balanceOf }, (subject) => true)
      `,
      filename: FILE,
      errors: [
        foreignError('the subject balanceOf, imported from ../laundered.workflow.ts and declared in entry.schema.ts'),
      ],
    },
    {
      name: 'Should_Report_ForeignSubject_When_WorkflowAppearsOnlyInADirectoryName',
      code: `
        import { run } from '../workflow/runner.ts'
        it.prop('∀r_Run_≡Done', { of: [], subject: run }, (subject) => true)
      `,
      filename: FILE,
      errors: [foreignError('the subject run, imported from ../workflow/runner.ts and declared in runner.ts')],
    },
    {
      name: 'Should_Report_LocalSubject_When_ARenamedFileStillTestsAWorkflow',
      code: `
        import { settle } from '../settle.workflow.ts'
        const everyLedgerOf = (l) => [l]
        it.prop('∀l_Ledger_≡Balanced', { of: [], subject: settle }, (subject) => true)
        it.prop('∀l_Ledgers_≡Listed', { of: [], subject: everyLedgerOf }, (subject) => true)
      `,
      filename: PLAIN_PROPERTY,
      errors: [localError('the subject everyLedgerOf, declared in the test file')],
    },
    {
      name: 'Should_Report_ForeignSubject_When_TheSpecifierResolvesToNoFile',
      code: `
        import { settle } from '../missing.workflow.ts'
        it.prop('∀l_Ledger_≡Balanced', { of: [], subject: settle }, (subject) => true)
      `,
      filename: FILE,
      errors: [
        foreignError('the subject settle, imported from ../missing.workflow.ts, which the rule could not resolve'),
      ],
    },
  ],
})
