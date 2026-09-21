import { Effect, Schema as S } from 'effect'
import { MESSAGE, NESTED_TEST_DIR } from './path.config.js'

export const Options = S.Struct({
  sanctionedDirs: S.NonEmptyArray(S.String).pipe(
    S.withDecodingDefaultType(Effect.succeed([NESTED_TEST_DIR] as const)),
  ),
})

export type Options = S.Schema.Type<typeof Options>

export interface Detail {
  readonly expected: string
  readonly actual: string
  readonly fix: string
}

export const testFileInSrcDetail = (dir: string): Detail => ({
  expected:
    `src/**/${dir}/<stem>.workflow.property.test.ts beside the <stem>.workflow.ts it covers, or an in-source import.meta.vitest block`,
  actual:
    `a test file under src/ that is neither the schema-laws entry point nor a <stem>.workflow.property.test.ts inside a ${dir} directory`,
  fix:
    `pick the arm matching what this file exercises. A workflow law -> rename to <stem>.workflow.property.test.ts inside src/<path>/${dir}/. A kernel/policy/schema property or characterization suite -> convert it to an in-source \`if (import.meta.vitest)\` block in the module it covers. The package public surface -> move outside src/ to tests/<name>.integration.test.ts. No arm matches -> delete this file`,
})

export const propertyTestLocationDetail = (dir: string): Detail => ({
  expected:
    `src/**/${dir}/<stem>.workflow.property.test.ts — a property test one directory down from the workflow it covers, never beside it`,
  actual:
    `a property test under src/ that is not a single-segment <stem>.workflow.property.test.ts inside a ${dir} directory`,
  fix:
    `a workflow law -> rename to <stem>.workflow.property.test.ts inside src/<path>/${dir}/. A kernel/policy/schema property suite -> convert it to an in-source \`if (import.meta.vitest)\` block in the module it covers. Relative imports shift one level when moving into ${dir}: ./<cell>.js -> ../<cell>.js`,
})

export const SCHEMA_TEST_DETAIL: Detail = {
  expected:
    'no authored test under this name — the generated schema-laws.test.ts carries the ruleOfSchemas pair for every exported schema',
  actual: 'an authored *.schema.test.ts restating generated coverage',
  fix:
    'delete it. The generated laws already state round-trip identity and encode stability. What they cannot state is rejection — every input they draw comes from the arbitrary the schema itself supplies — so a refusal belongs in an in-source if (import.meta.vitest) block in the schema file, never here',
}

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Under src/, the only sanctioned test file is a single-segment <stem>.workflow.property.test.ts inside a sanctioned test directory, plus the generated schema-laws.test.ts entry point. Every other test file is banned: a kernel, policy, or schema suite becomes an in-source import.meta.vitest block, and a public-surface test moves outside src/ as an integration test. The sanctioned directory list is the sanctionedDirs option, defaulting to the one directory this repo runs.',
  },
  schema: [S.toJsonSchemaDocument(Options).schema],
  messages: {
    testFileInSrc: MESSAGE,
    schemaTestInSrc: MESSAGE,
    propertyTestOutsideTestsDir: MESSAGE,
  },
} as const
