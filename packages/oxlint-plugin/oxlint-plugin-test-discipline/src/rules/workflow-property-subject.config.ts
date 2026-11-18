import { MESSAGE } from './path.config.js'

export const WORKFLOW_PROPERTY_SUFFIX = '.workflow.property.test.ts' as const

export const LOCAL_SUBJECT_NAME = 'a workflow property whose subject is declared in the test file' as const

export const LOCAL_SUBJECT_EXPECTED = 'a subject imported from the *.workflow.ts file the property tests' as const

export const LOCAL_SUBJECT_FIX =
  'delete the local declaration and pass the workflow function itself; a subject the test builds is the test checking itself' as const

export const FOREIGN_SUBJECT_NAME = 'a workflow property whose subject is imported from a non-workflow file' as const

export const FOREIGN_SUBJECT_EXPECTED =
  'a subject imported from a *.workflow.ts (or *.workflow.js) module, by its relative path' as const

export const FOREIGN_SUBJECT_FIX =
  'import the subject from the *.workflow.ts file that defines it, or move the property next to the module that owns the function' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.workflow.property.test.ts file states laws of a workflow, so every it.prop subject must be a binding imported from a *.workflow.ts or *.workflow.js module. A subject declared in the test file (a helper, an inline function, a call) is the test checking its own code, and a subject imported from any other module (a package entry, a schema, another layer) tests a function the workflow does not own. The subject is read lexically: the root identifier of the subject expression must be an import binding whose specifier names a workflow module.',
  },
  schema: [],
  messages: {
    localSubject: MESSAGE,
    foreignSubject: MESSAGE,
  },
} as const
