package evidence

import (
  "strings"
  "testing"
)

/**
 * Verifies the rule fires on a '@todo' tag and carries the tag's text.
 *
 * The anchor case. The text is what makes the finding a realize ledger rather
 * than a style nag: without it the author learns that something is owed but not
 * what, and the diagnostic has to say why the tag matters — a contract the
 * declaration has not realized yet — or a reader treats it as comment policing
 * and disables it.
 *
 *  1. Export one function whose JSDoc carries a single '@todo' with text.
 *  2. Run the rule.
 *  3. Assert one finding carrying the text and the repair.
 */
func TestTodoReportsAnUnrealizedContract(t *testing.T) {
  messages := runTodoRule(t, "src/persist.ts", `
/** @todo wire the persistence layer */
export function persist(value: string): string {
  return value;
}
`)
  assertReported(t, messages, "Unrealized '@todo': 'wire the persistence layer'")
  assertReported(t, messages, "Realize the declaration and remove the tag")
}

/**
 * Verifies the negative twin: a realized declaration is silent.
 *
 * Without it the case above is equally satisfied by a rule that reports every
 * documented declaration it sees. The block here holds prose and another tag,
 * so silence also proves the scan keys on the tag name rather than on any '@'.
 *
 *  1. Export a function documented with prose and a '@param' tag, no '@todo'.
 *  2. Run the rule.
 *  3. Assert silence.
 */
func TestTodoAcceptsARealizedDeclaration(t *testing.T) {
  assertSilent(t, runTodoRule(t, "src/persist.ts", `
/**
 * Persists a normalized value.
 *
 * @param value The value to persist.
 */
export function persist(value: string): string {
  return value;
}
`))
}

/**
 * Verifies two tags on one declaration produce one finding per tag.
 *
 * Each '@todo' names one distinct debt, so folding them into one finding would
 * let realizing half the contract clear the whole ledger — the report has to
 * shrink one line per realized promise, not vanish on the first.
 *
 *  1. Stack two '@todo' tags in one block.
 *  2. Run the rule.
 *  3. Assert two findings, each carrying its own text.
 */
func TestTodoReportsEachTagSeparately(t *testing.T) {
  messages := runTodoRule(t, "src/persist.ts", `
/**
 * @todo wire the persistence layer
 * @todo emit the audit event
 */
export function persist(value: string): string {
  return value;
}
`)
  if len(messages) != 2 {
    t.Fatalf("expected two findings, got %d:\n%s", len(messages), strings.Join(messages, "\n"))
  }
  assertReportedAmong(t, messages, "'wire the persistence layer'")
  assertReportedAmong(t, messages, "'emit the audit event'")
}

/**
 * Verifies the tag name matches case-insensitively.
 *
 * '@TODO' is the same promise shouted, and a case-sensitive scan would teach
 * authors that capitalizing a debt hides it from the build.
 *
 *  1. Write the tag as '@TODO'.
 *  2. Run the rule.
 *  3. Assert the finding carries the text.
 */
func TestTodoMatchesTheTagNameCaseInsensitively(t *testing.T) {
  messages := runTodoRule(t, "src/persist.ts", `
/** @TODO wire the persistence layer */
export function persist(value: string): string {
  return value;
}
`)
  assertReported(t, messages, "Unrealized '@todo': 'wire the persistence layer'")
}

/**
 * Verifies a longer tag opening with the same letters is not matched.
 *
 * The boundary negative of the case above: '@todos' is some other tool's tag,
 * and case-insensitive matching must not widen into prefix matching, or the
 * rule reports debts nobody recorded.
 *
 *  1. Write a '@todos' tag.
 *  2. Run the rule.
 *  3. Assert silence.
 */
func TestTodoIgnoresLongerTagNames(t *testing.T) {
  assertSilent(t, runTodoRule(t, "src/persist.ts", `
/** @todos are tracked elsewhere */
export function persist(value: string): string {
  return value;
}
`))
}

/**
 * Verifies a bare tag with no text still fires, without an empty quote.
 *
 * A stub can carry '@todo' alone, and the debt is no less real for being
 * unnamed. The message drops the text clause rather than quoting an empty
 * string, because ": ''" names nothing and reads like a rendering bug.
 *
 *  1. Write a '@todo' with no remainder.
 *  2. Run the rule.
 *  3. Assert the finding fires and carries no empty quote.
 */
func TestTodoReportsABareTagWithoutText(t *testing.T) {
  messages := runTodoRule(t, "src/persist.ts", `
/** @todo */
export function persist(value: string): string {
  return value;
}
`)
  assertReported(t, messages, "Unrealized '@todo'. ")
  for _, message := range messages {
    if strings.Contains(message, "''") {
      t.Fatalf("a bare tag rendered an empty quote:\n%s", message)
    }
  }
}

/**
 * Verifies a tag's text ends where the next JSDoc tag begins.
 *
 * The block boundary rule the declaration parser follows: continuation lines
 * belong to the tag above, and any other '@'-opening line closes it. Without
 * the boundary the finding would swallow '@param' documentation into the debt.
 *
 *  1. Follow a multi-line '@todo' with a '@param' tag.
 *  2. Run the rule.
 *  3. Assert one finding whose text joins the continuation and excludes the param.
 */
func TestTodoStopsTheTextAtTheNextTag(t *testing.T) {
  messages := runTodoRule(t, "src/persist.ts", `
/**
 * @todo wire the persistence layer
 * and emit the audit event
 * @param value The value to persist.
 */
export function persist(value: string): string {
  return value;
}
`)
  assertReported(t, messages, "'wire the persistence layer and emit the audit event'")
  for _, message := range messages {
    if strings.Contains(message, "@param") {
      t.Fatalf("the finding swallowed the following tag:\n%s", message)
    }
  }
}

/**
 * Verifies a non-exported declaration is reported too.
 *
 * The rule has no selection: a debt on a local helper is as unrealized as one
 * on an export, and exempting private code would make "private" the place
 * unrealized contracts go to hide.
 *
 *  1. Put a '@todo' on a local helper beside a realized export.
 *  2. Run the rule.
 *  3. Assert one finding carrying the helper's tag text.
 */
func TestTodoReportsNonExportedDeclarations(t *testing.T) {
  messages := runTodoRule(t, "src/persist.ts", `
/** @todo tune the cache size */
function normalize(value: string): string {
  return value.trim();
}
/** Persists a normalized value. */
export function persist(value: string): string {
  return normalize(value);
}
`)
  assertReported(t, messages, "Unrealized '@todo': 'tune the cache size'")
}

/**
 * Verifies nested declarations are read: an interface property's block counts.
 *
 * The whole file is the population, and a nested block is where a stubbed
 * member's debt actually sits. A scan that stopped at top-level statements
 * would let every property and method stub ship silently.
 *
 *  1. Put a '@todo' on an interface property, under a realized interface block.
 *  2. Run the rule.
 *  3. Assert one finding carrying the property's tag text.
 */
func TestTodoReportsTagsOnNestedDeclarations(t *testing.T) {
  messages := runTodoRule(t, "src/ISale.ts", `
/** A sale offered to a customer. */
export interface ISale {
  /** @todo settle the currency model */
  price: number;
}
`)
  assertReported(t, messages, "Unrealized '@todo': 'settle the currency model'")
}

/**
 * Verifies one shared block on a multi-binding statement reports once per tag.
 *
 * TypeScript cascades a variable statement's leading block onto the statement
 * and each declaration under it, so a walk that read every attachment would
 * state the same debt several times. The dedupe has to key on the physical
 * block, not on the node it was reached through.
 *
 *  1. Put one '@todo' block above a statement declaring two bindings.
 *  2. Run the rule.
 *  3. Assert exactly one finding.
 */
func TestTodoReportsASharedBlockOnce(t *testing.T) {
  messages := runTodoRule(t, "src/limits.ts", `
/** @todo confirm both ceilings with the pricing team */
export const maximumItems = 10,
  maximumCoupons = 2;
`)
  assertReported(t, messages, "Unrealized '@todo': 'confirm both ceilings with the pricing team'")
}
