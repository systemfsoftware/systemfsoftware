import { Schema as S } from 'effect'

export const Options = S.Struct({})
export type Options = S.Schema.Type<typeof Options>

export const BARREL_NAMES: readonly string[] = ['index', 'mod']

export const BARREL_EXPECTED = 'a leaf import, so the import table keeps deciding at every intra-package edge' as const
export const BARREL_FIX =
  'name the file the barrel re-exports, not the directory — the table must see the cell actually reached' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A behaviour-bearing cell cannot import a directory barrel, so the import table keeps deciding at every intra-package edge.',
    details:
      'A barrel launders an edge. The linter observes one import at a time, so when a cell imports `../Lock/index.js` the import table sees a directory name carrying no cell suffix and cannot judge what was actually reached. Requiring leaf imports inside a package keeps every edge classifiable.\n\n' +
      'A relative specifier names a barrel when its final path segment, after stripping the optional module extension, is a sanctioned barrel name (`index`, `mod`) or resolves to a directory — the same final-segment derivation the sibling `cell-import-boundary` rule performs via the shared `finalPathStem`, so the two rules cannot drift. The classification is textual and resolution-agnostic: it never consults the filesystem.\n\n' +
      'The rule acts exactly where the import table acts: the caller must be a cell (a filename carrying a cell suffix) and not a member of the shared non-production caller set (test/spec files, observer cells, tooling directories). A barrel import from a test file is therefore clean, as is any import of an external package, which no table row judges.',
  },
  schema: [Options],
  messages: {
    barrelImport: '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
