import { MESSAGE } from './path.config.js'

export const NO_SUBJECT_IMPORT_NAME = 'a *.integration.test.ts that reaches no package code' as const
export const NO_SUBJECT_IMPORT_EXPECTED = 'an import of the package code under test' as const
export const NO_SUBJECT_IMPORT_ACTUAL =
  'a behaviour file whose every runtime import is vitest, @effect/vitest, the gherkin spec package, effect, a Node builtin, or the file itself' as const
export const NO_SUBJECT_IMPORT_FIX =
  'a behaviour test exercises a use case, so it has to reach the package. A file that imports nothing but its runner and effect is asserting over values it built in the same file. Ask whether the assertion tests anything at all: if it restates a literal, delete the scenario; if it states an invariant that holds over generated inputs, move it to a *.property.test.ts beside the cell that decides it. Type-only imports never count - they are erased before anything runs - while a side-effect import (import "../src/x.js", import {} from "../src/x.js") does count, because it executes that module.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.integration.test.ts must import the package under test, not only its runner and effect, so the scenario exercises code that ships rather than values the test built itself.',
  },
  schema: [],
  messages: {
    noSubjectImport: MESSAGE,
  },
} as const
