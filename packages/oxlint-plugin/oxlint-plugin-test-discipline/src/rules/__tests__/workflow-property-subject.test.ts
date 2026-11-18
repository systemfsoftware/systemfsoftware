import { workflowPropertySubject } from '../workflow-property-subject.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const FILE = '/repo/packages/ledger/src/__tests__/settle.workflow.property.test.ts'

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
    name: 'a workflow property whose subject is imported from a non-workflow file',
    expected: 'a subject imported from a *.workflow.ts (or *.workflow.js) module, by its relative path',
    actual,
    fix:
      'import the subject from the *.workflow.ts file that defines it, or move the property next to the module that owns the function',
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
      name: 'Should_Allow_NamespaceMember_When_NamespaceIsAWorkflowModule',
      code: `
        import * as Settle from './settle.workflow.js'
        it.effect.prop('∀l_Ledger_≡Balanced', { of: [], subject: Settle.settle }, (subject) => true)
      `,
      filename: FILE,
    },
    {
      name: 'Should_Allow_ExtensionlessSpecifier_When_ItNamesAWorkflowModule',
      code: `
        import { closePeriod } from '../close-period.workflow'
        it.prop('∀p_Period_≡Closed', { of: [], subject: closePeriod }, (subject) => true)
      `,
      filename: FILE,
    },
    {
      name: 'Should_Allow_AnySubject_When_FileIsNotAWorkflowProperty',
      code: `
        const helper = (a) => a
        it.prop('∀a_A_≡A', { of: [], subject: helper }, (subject) => true)
      `,
      filename: '/repo/packages/ledger/src/__tests__/entry.schema.property.test.ts',
    },
  ],
  invalid: [
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
      name: 'Should_Report_LocalSubject_When_SubjectIsAnInlineFunction',
      code: `
        import { settle } from '../settle.workflow.ts'
        it.prop('∀l_Ledger_≡Balanced', { of: [], subject: (ledger) => settle(ledger) }, (subject) => true)
      `,
      filename: FILE,
      errors: [localError('a subject built in the test file as an expression')],
    },
    {
      name: 'Should_Report_ForeignSubject_When_SubjectComesFromThePackageEntry',
      code: `
        import { digestOf } from '@acme/ledger'
        it.prop('∀e_Entries_≡DigestUnchangedByOrder', { of: [], subject: digestOf }, (subject) => true)
      `,
      filename: FILE,
      errors: [foreignError('the subject digestOf, imported from @acme/ledger')],
    },
    {
      name: 'Should_Report_ForeignSubject_When_SubjectComesFromASchemaModule',
      code: `
        import { balanceOf } from '../entry.schema.ts'
        it.prop('∀e_Entries_≡Balanced', { of: [], subject: balanceOf }, (subject) => true)
      `,
      filename: FILE,
      errors: [foreignError('the subject balanceOf, imported from ../entry.schema.ts')],
    },
    {
      name: 'Should_Report_ForeignSubject_When_WorkflowAppearsOnlyInADirectoryName',
      code: `
        import { run } from '../workflow/runner.ts'
        it.prop('∀r_Run_≡Done', { of: [], subject: run }, (subject) => true)
      `,
      filename: FILE,
      errors: [foreignError('the subject run, imported from ../workflow/runner.ts')],
    },
  ],
})
