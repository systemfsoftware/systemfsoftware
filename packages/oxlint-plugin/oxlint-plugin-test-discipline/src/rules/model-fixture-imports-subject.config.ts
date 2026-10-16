import { MESSAGE } from './path.config.js'

export const SUBJECT_IMPORT_NAME = 'a *.model.ts fixture that imports the package under test' as const

export const SUBJECT_IMPORT_EXPECTED =
  'a pure model that imports only effect, node builtins, and harness types' as const

export const SUBJECT_IMPORT_FIX =
  'delete the import; the model derives its state from the declared Schema it is given, so it needs no symbol from the package it stands in for' as const

export const RELATIVE_ESCAPE_NAME = 'a *.model.ts fixture that climbs out of the tests tree' as const

export const RELATIVE_ESCAPE_EXPECTED =
  'a relative import that stays inside the tests tree — a sibling fixture under tests/__fixtures__/' as const

export const RELATIVE_ESCAPE_FIX =
  'import the sibling fixture with ./<name>.js, or move the model; a model that reaches src/ is the implementation checking itself' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.model.ts fixture is the pure model a conformance check stands the implementation against, so it may not import the package whose tests it serves. The package is derived from the path: the directory the tests tree lives in. An import, re-export, dynamic import, or require of that package name — or of any subpath of it — is the implementation reaching its own oracle. A relative specifier is judged the same way lexically: resolved against the fixture directory, it must stay inside the tests tree, so ../../src/Lock.js is the implementation again while ./Locks.js is a sibling fixture.',
  },
  schema: [],
  messages: {
    subjectImport: MESSAGE,
    relativeEscape: MESSAGE,
  },
} as const
