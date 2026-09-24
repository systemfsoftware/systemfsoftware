import { Option, Result, Schema } from 'effect'
import { parseDocument } from 'yaml'

export const RuleFrontmatter = Schema.Struct({
  title: Schema.NonEmptyString,
  applies_when: Schema.NonEmptyArray(Schema.NonEmptyString),
  tags: Schema.Array(Schema.String),
})
export type RuleFrontmatter = typeof RuleFrontmatter.Type

export class RuleFileRefusal extends Schema.TaggedError<RuleFileRefusal>()('RuleFileRefusal', {
  path: Schema.String,
  reason: Schema.String,
}) {}

export class PackRule extends Schema.Class<PackRule>('PackRule')({
  packId: Schema.NonEmptyString,
  stem: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  appliesWhen: Schema.NonEmptyArray(Schema.NonEmptyString),
  tags: Schema.Array(Schema.String),
  body: Schema.String,
}) {}

export class Pack extends Schema.Class<Pack>('Pack')({
  id: Schema.NonEmptyString,
  rules: Schema.Array(PackRule),
}) {}

interface RuleFileFields {
  readonly path: string
  readonly packId: string
  readonly stem: string
  readonly text: string
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/

const yamlTextOf = (match: RegExpExecArray): string => match[1] ?? ''

const bodyTextOf = (match: RegExpExecArray): string => match[2] ?? ''

const frontmatterParts = (text: string): Option.Option<readonly [string, string]> => {
  const match = FRONTMATTER.exec(text)
  return match === null ? Option.none() : Option.some([yamlTextOf(match), bodyTextOf(match)])
}

const frontmatterOf = (yamlText: string): Option.Option<RuleFrontmatter> => {
  const document = parseDocument(yamlText)
  return document.errors.length === 0
    ? Schema.decodeUnknownOption(RuleFrontmatter)(document.toJS())
    : Option.none()
}

const assembleRule = (
  file: RuleFileFields,
  parts: readonly [string, string],
): Result.Result<PackRule, RuleFileRefusal> =>
  Option.match(frontmatterOf(parts[0]), {
    onNone: () =>
      Result.fail(
        new RuleFileRefusal({
          path: file.path,
          reason: 'frontmatter is not a title, a non-empty applies_when list, and tags',
        }),
      ),
    onSome: (frontmatter) =>
      Result.succeed(
        new PackRule({
          packId: file.packId,
          stem: file.stem,
          title: frontmatter.title,
          appliesWhen: frontmatter.applies_when,
          tags: frontmatter.tags,
          body: parts[1],
        }),
      ),
  })

export class RuleFile extends Schema.Class<RuleFile>('RuleFile')({
  path: Schema.String,
  packId: Schema.NonEmptyString,
  stem: Schema.NonEmptyString,
  text: Schema.String,
}) {
  /**
   * Decode a rule file's raw text: the `---`-delimited frontmatter parsed as
   * YAML, then the frontmatter fields and body decoded into a {@link PackRule}.
   * A file with no frontmatter block, unparseable YAML, or frontmatter without
   * a title and a non-empty `applies_when` list is refused with the file's path.
   */
  static decode(file: RuleFile): Result.Result<PackRule, RuleFileRefusal> {
    return Option.match(frontmatterParts(file.text), {
      onNone: () =>
        Result.fail(
          new RuleFileRefusal({ path: file.path, reason: 'no --- delimited frontmatter block' }),
        ),
      onSome: (parts) => assembleRule(file, parts),
    })
  }
}
