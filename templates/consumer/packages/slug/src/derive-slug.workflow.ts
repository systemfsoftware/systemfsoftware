import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { DeriveSlug, NoSlugInText, SlugDecision, SlugDerived } from './derive-slug.schema.js'
import { Slug } from './Slug.schema.js'

const asciiWordsHyphenated = (text: string): string =>
  text
    .normalize('NFKD')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-|-$/gu, '')

export const deriveSlug = Workflow.make({
  command: DeriveSlug,
  decision: SlugDecision,
  error: Schema.Never,
  decide: (command): Result.Result<SlugDecision, never> => {
    const words = asciiWordsHyphenated(command.text)
    return Result.succeed(
      Match.value(words === '').pipe(
        Match.when(true, (): SlugDecision => new NoSlugInText({})),
        Match.when(false, (): SlugDecision => new SlugDerived({ slug: Slug.make(words) })),
        Match.exhaustive,
      ),
    )
  },
})
