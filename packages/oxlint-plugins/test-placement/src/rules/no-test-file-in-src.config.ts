import { Effect, Schema as S } from 'effect'
import { COLOCATABLE_CELLS, MESSAGE, NESTED_TEST_DIR } from './path.config.js'

const SANCTIONED_CELLS = COLOCATABLE_CELLS.join(', ')

export const Options = S.Struct({
  sanctionedDirs: S.NonEmptyArray(S.String).pipe(
    S.withDecodingDefaultType(Effect.succeed([NESTED_TEST_DIR] as const)),
  ),
  /**
   * Admits a colocated test whose stem names NO cell — the plain
   * `<domain>.test.ts` clanka/effect-torch shape. A consumer that has
   * dismantled its suffix taxonomy (structure carried by the cell library's
   * brand checks instead of filenames) opts in; every default is unchanged
   * for consumers that keep the taxonomy. TP4 is untouched: the schema
   * suffix stays forbidden outright regardless of this option.
   */
  admitPlainStems: S.Boolean.pipe(S.withDecodingDefaultType(Effect.succeed(false as const))),
})

export type Options = S.Schema.Type<typeof Options>

export interface Detail {
  readonly expected: string
  readonly actual: string
  readonly fix: string
}

export const testFileInSrcDetail = (dir: string): Detail => ({
  expected:
    `src/**/${dir}/<cell>.test.ts or <cell>.property.test.ts on a sanctioned cell suffix, or the generated schema-laws.test.ts entry point`,
  actual:
    `a test file under src/ that is neither the schema-laws entry point nor a test naming a sanctioned cell inside a ${dir} directory`,
  fix:
    `pick the arm matching what this file exercises. A sanctioned cell (${SANCTIONED_CELLS}) -> move to src/<path>/${dir}/<cell>.test.ts in whichever form the behaviour needs, e.g. src/order/${dir}/confirm-order.workflow.property.test.ts for a law or src/order/${dir}/confirm-order.workflow.test.ts to pin existing behaviour. The package public surface -> move outside src/ to ${dir}/<name>.integration.test.ts. A private, non-exported binding -> delete this file and inline its assertions as an \`if (import.meta.vitest)\` block in the module declaring that binding. No arm matches -> delete this file`,
})

export const propertyTestLocationDetail = (dir: string): Detail => ({
  expected: `src/**/${dir}/<name> — a property test one directory down from the cell it covers, never beside it`,
  actual: `a property test beside its source under src/, outside any ${dir} directory`,
  fix:
    `move the file down one directory into ${dir}: src/<path>/<name> -> src/<path>/${dir}/<name>. The suffix is already sanctioned; only the directory is wrong. Relative imports shift one level: ./<cell>.js -> ../<cell>.js`,
})

export const SCHEMA_TEST_DETAIL: Detail = {
  expected:
    'no authored test under this name — the generated schema-laws.test.ts carries the ruleOfSchemas pair for every exported schema',
  actual: 'an authored *.schema.test.ts restating generated coverage',
  fix:
    'delete it. The generated laws already state round-trip identity and encode stability. What they cannot state is rejection — every input they draw comes from the arbitrary the schema itself supplies — so a refusal belongs in <name>.schema.property.test.ts, never here',
}

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Under src/, the only sanctioned test files are a test whose stem names a colocatable cell inside a sanctioned test directory — in whichever form the behaviour needs, a law or a characterization test — and the generated schema-laws.test.ts entry point. A property test beside its source is reported for location alone. *.schema.test.ts is forbidden outright; a test naming no cell must move outside src/ as an integration test or become an in-source vitest block testing private code. The sanctioned directory list is the sanctionedDirs option, defaulting to the one directory this repo runs; admitPlainStems (default false) additionally admits a colocated test whose stem names no cell, for a consumer that has dismantled its suffix taxonomy.',
  },
  schema: [S.toJsonSchemaDocument(Options).schema],
  messages: {
    testFileInSrc: MESSAGE,
    schemaTestInSrc: MESSAGE,
    propertyTestOutsideTestsDir: MESSAGE,
  },
} as const
