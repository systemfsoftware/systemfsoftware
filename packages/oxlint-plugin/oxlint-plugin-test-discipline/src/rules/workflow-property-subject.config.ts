import { MESSAGE } from './path.config.js'

export const WORKFLOW_PROPERTY_SUFFIX = '.workflow.property.test.ts' as const

export const LOCAL_SUBJECT_NAME = 'a workflow property whose subject is declared in the test file' as const

export const LOCAL_SUBJECT_EXPECTED = 'a subject imported from the *.workflow.ts file the property tests' as const

export const LOCAL_SUBJECT_FIX =
  'delete the local declaration and pass the workflow function itself; a subject the test builds is the test checking itself' as const

export const FOREIGN_SUBJECT_NAME = 'a workflow property whose subject is declared outside a workflow module' as const

export const FOREIGN_SUBJECT_EXPECTED =
  'a subject declared in a *.workflow.ts module, imported directly or through any re-export' as const

export const FOREIGN_SUBJECT_FIX =
  'test the workflow that owns the function, or move the property next to the module that declares it' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Every it.prop subject in a workflow property must be declared in a *.workflow.ts module. The rule follows the subject through lexical scope, an options variable, imports, package entries and re-exports to the file that declares it. A subject declared in the test file (a helper, an alias, an inline function, a call) is the test checking its own code; a subject declared in any other module tests a function no workflow owns. It applies to *.workflow.property.test.ts files and to any test file where some property subject is a workflow.',
  },
  schema: [],
  messages: {
    localSubject: MESSAGE,
    foreignSubject: MESSAGE,
  },
} as const
