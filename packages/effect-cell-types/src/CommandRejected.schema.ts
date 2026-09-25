import * as Schema from 'effect/Schema'

export class CommandRejected extends Schema.TaggedError<CommandRejected>()('CommandRejected', {
  issue: Schema.String,
}) {
  override get message(): string {
    return this.issue
  }
}

const commandRejectedMessageOf = (issue: string): string => new CommandRejected({ issue }).message

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀i_CommandRejectedMessage_=Issue',
    { of: [Schema.String], subject: commandRejectedMessageOf },
    (subject, [issue]) => subject(issue) === issue,
  )
}
