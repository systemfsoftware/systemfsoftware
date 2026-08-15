package evidence

import "testing"

/**
 * Verifies the name match: a file named after its single identity is silent.
 *
 * The positive anchor for every mismatch case below. Without it a rule that
 * fired unconditionally would still satisfy them.
 *
 *  1. Export one interface.
 *  2. Run the rule against a file of the same name.
 *  3. Assert silence.
 */
func TestSingularAcceptsFileNamedAfterItsIdentity(t *testing.T) {
  assertSilent(t, runSingularRule(t, "src/IShoppingSale.ts", `
export interface IShoppingSale {
  id: string;
}
`))
}

/**
 * Verifies the name match fires: an identity whose name differs from its file
 * is reported with both repairs.
 *
 * A diagnostic that named only the mismatch would leave the reader to guess
 * which side moves, and either side is valid here.
 *
 *  1. Export one function under a name the file does not carry.
 *  2. Run the rule.
 *  3. Assert the message offers the rename in both directions.
 */
func TestSingularReportsFileNameMismatch(t *testing.T) {
  messages := runSingularRule(t, "src/utils.ts", `
export function parseInput(value: string): string {
  return value;
}
`)
  assertReported(t, messages, "'utils.ts' declares 'parseInput'")
  assertReported(t, messages, "Rename the file to 'parseInput.ts'")
  assertReported(t, messages, "rename the identity to 'utils'")
}

/**
 * Verifies the matched name is the public one: an export alias moves the name
 * the file must carry.
 *
 * The alias is what a consumer imports, so the addressable name is the one the
 * bijection is about. Matching the local name instead would let a file be named
 * after something no consumer can reach.
 *
 *  1. Declare a local const and export it under another name.
 *  2. Run the rule against a file named after the alias.
 *  3. Assert silence.
 */
func TestSingularMatchesExportAliasRatherThanLocalName(t *testing.T) {
  assertSilent(t, runSingularRule(t, "src/Other.ts", `
const local = 1;
export { local as Other };
`))
}

/**
 * Verifies the alias twin: the same file named after the local name fires.
 *
 * One property away from the accepted case above, and the property is exactly
 * the one the rule claims to enforce.
 *
 *  1. Declare a local const and export it under another name.
 *  2. Run the rule against a file named after the local binding.
 *  3. Assert the public name is demanded.
 */
func TestSingularReportsAliasedIdentityUnderItsLocalName(t *testing.T) {
  messages := runSingularRule(t, "src/local.ts", `
const local = 1;
export { local as Other };
`)
  assertReported(t, messages, "'local.ts' declares 'Other'")
}

/**
 * Verifies the fallback name: an identity exposed only as a default takes its
 * declared name.
 *
 * `default` names no identity, so a file whose only exposure is a default
 * export has nothing addressable to match. Falling back to the declared name is
 * what makes `export default x` in `x.ts` legal.
 *
 *  1. Declare a local const and default-export it without exporting the name.
 *  2. Run the rule against a file named after the declaration.
 *  3. Assert silence.
 */
func TestSingularFallsBackToDeclaredNameForDefaultOnlyExposure(t *testing.T) {
  assertSilent(t, runSingularRule(t, "src/handler.ts", `
const handler = (): void => {};
export default handler;
`))
}

/**
 * Verifies a local exported under two names keeps both addresses.
 *
 * Exporting one declaration twice is legal, and collapsing the pair to a single
 * address would report a file legitimately named after the dropped one. That is
 * a false positive, which is the failure mode that gets a rule disabled.
 *
 *  1. Export one local const under two public names.
 *  2. Run the rule against a file named after each in turn.
 *  3. Assert both are silent.
 */
func TestSingularKeepsEveryPublicAddressOfOneDeclaration(t *testing.T) {
  source := `
const value = 1;
export { value as Alpha, value as Beta };
`
  assertSilent(t, runSingularRule(t, "src/Alpha.ts", source))
  assertSilent(t, runSingularRule(t, "src/Beta.ts", source))
}

/**
 * Verifies `export { x as default }` is the same exposure as `export default x`.
 *
 * Both forms expose one declaration under no addressable name. Treating the
 * list form as no exposure at all would let the rule miss the file entirely,
 * and a rule that silently sees nothing is indistinguishable from one that
 * passed.
 *
 *  1. Expose a local declaration through an export list as `default`.
 *  2. Run the rule against a file named after neither the declaration nor
 *     `default`.
 *  3. Assert the declared name is demanded.
 */
func TestSingularTreatsDefaultAliasAsExposureWithoutAddress(t *testing.T) {
  messages := runSingularRule(t, "src/entry.ts", `
const handler = (): void => {};
export { handler as default };
`)
  assertReported(t, messages, "'entry.ts' declares 'handler'")
}

/**
 * Verifies extension handling: a `.tsx` component matches its base name.
 *
 * The comparison strips one extension, so a component file must match without
 * the reader having to spell the extension into the identity.
 *
 *  1. Export one component from a `.tsx` file of the same name.
 *  2. Run the rule.
 *  3. Assert silence.
 */
func TestSingularMatchesTsxComponentBaseName(t *testing.T) {
  assertSilent(t, runSingularRule(t, "src/Button.tsx", `
export const Button = (): null => null;
`))
}

/**
 * Verifies case sensitivity: a base name differing only in case is a mismatch.
 *
 * Path identity is case-sensitive on every host in this product, and a
 * case-insensitive filesystem must not soften it — otherwise the same
 * repository passes on Windows and fails on Linux.
 *
 *  1. Export `Button` from `button.tsx`.
 *  2. Run the rule.
 *  3. Assert the mismatch is reported.
 */
func TestSingularTreatsFileNameCaseAsIdentity(t *testing.T) {
  messages := runSingularRule(t, "src/button.tsx", `
export const Button = (): null => null;
`)
  assertReported(t, messages, "'button.tsx' declares 'Button'")
}

/**
 * Verifies dotted infixes are not matched by prefix.
 *
 * Only the final extension is stripped, so `parse.helper.ts` compares against
 * `parse.helper`, which no identifier can equal. Stripping every extension
 * would silently accept two files claiming one identity name.
 *
 *  1. Export `parse` from `parse.helper.ts`.
 *  2. Run the rule.
 *  3. Assert the mismatch is reported against the full base name.
 */
func TestSingularComparesAgainstTheFullDottedBaseName(t *testing.T) {
  messages := runSingularRule(t, "src/parse.helper.ts", `
export const parse = (): void => {};
`)
  assertReported(t, messages, "'parse.helper.ts' declares 'parse'")
}
