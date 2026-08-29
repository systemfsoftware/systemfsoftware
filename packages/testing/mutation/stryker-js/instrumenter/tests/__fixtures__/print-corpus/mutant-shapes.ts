// Shapes the mutators synthesize as mutant replacements: string literals with
// hostile content (quotes, backticks, newlines), empty template replacements,
// boolean and numeric literal mutations, regex replacements with flags.
const emptyString = ''
const withSingle = "it's here"
const withDouble = 'say "hi"'
const withBacktick = 'has `tick` inside'
const withNewline = 'line one\nline two'
const withBackslash = 'path\\segment'
const negated = -1
const boolean = true
const notBoolean = false
const emptyTemplate = ``
const tagged = tag`raw ${inside}`
const reWithFlags = /Stryker was here/gi

export {
  boolean,
  emptyString,
  emptyTemplate,
  negated,
  notBoolean,
  reWithFlags,
  tagged,
  withBackslash,
  withBacktick,
  withDouble,
  withNewline,
  withSingle,
}
