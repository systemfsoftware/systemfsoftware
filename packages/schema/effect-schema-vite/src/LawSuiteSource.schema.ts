import { Schema } from 'effect'

/** @since 1.4.0 */
export const LawSuiteSource = Schema.String.pipe(
  Schema.annotate({
    identifier: 'LawSuiteSource',
    description: 'The generated law-suite module body',
    title: 'Law Suite Source',
  }),
  Schema.brand('LawSuiteSource'),
)

export type LawSuiteSource = Schema.Schema.Type<typeof LawSuiteSource>
