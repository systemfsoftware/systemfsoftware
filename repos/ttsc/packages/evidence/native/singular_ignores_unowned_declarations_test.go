package evidence

import "testing"

/**
 * Verifies barrel handling falls out of ownership: a file that only re-exports
 * owns nothing and is silent.
 *
 * This is deliberately not an exemption. Re-exports declare nothing here, so a
 * barrel already counts zero — writing a barrel exemption instead would also
 * excuse a barrel that declares three identities of its own.
 *
 *  1. Re-export a namespace, a star, and a named binding from other modules.
 *  2. Run the rule against a file named after none of them.
 *  3. Assert silence.
 */
func TestSingularIgnoresPureBarrelFiles(t *testing.T) {
  assertSilent(t, runSingularRule(t, "src/exports.ts", `
export * from "./alpha";
export * as beta from "./beta";
export { gamma } from "./gamma";
export type { IDelta } from "./delta";
`))
}

/**
 * Verifies the index exemption is limited to the name: an index file may own
 * one identity of any name.
 *
 * The plugin's own entry point is exactly this shape — one declared identity
 * beside re-export barrels — and no identifier can be named `index`.
 *
 *  1. Declare one identity and re-export two barrels from an index file.
 *  2. Run the rule.
 *  3. Assert silence.
 */
func TestSingularExemptsIndexFilesFromTheNameMatch(t *testing.T) {
  assertSilent(t, runSingularRule(t, "src/index.ts", `
export * from "./structures/index";
export const evidence = { name: "evidence" };
export default evidence;
`))
}

/**
 * Verifies the index exemption does not extend to counting.
 *
 * The name match is what an index file cannot satisfy; the one-identity limit
 * is unrelated, and exempting it would turn every barrel into a legal dumping
 * ground.
 *
 *  1. Declare two identities in an index file.
 *  2. Run the rule.
 *  3. Assert the count is still enforced.
 */
func TestSingularStillCountsIdentitiesInIndexFiles(t *testing.T) {
  messages := runSingularRule(t, "src/index.ts", `
export const alpha = 1;
export const beta = 2;
`)
  assertReported(t, messages, "declares exactly one public identity")
}

/**
 * Verifies module augmentation is not an identity.
 *
 * An augmentation names another module with a string literal. Counting it would
 * report every typings file that tightens a dependency's interface, and this
 * repository ships one.
 *
 *  1. Augment another module and declare nothing else.
 *  2. Run the rule against a file named after the augmented interface.
 *  3. Assert silence.
 */
func TestSingularIgnoresModuleAugmentationOnlyFiles(t *testing.T) {
  assertSilent(t, runSingularRule(t, "src/ITtscLintRuleOptionsMap.ts", `
declare module "@ttsc/lint" {
  interface ITtscLintRuleOptionsMap {
    "evidence/graph": unknown;
  }
}
`))
}

/**
 * Verifies non-exported declarations are invisible to the rule.
 *
 * The rule is about the public surface. A module with helpers and one export
 * must be judged on the export alone, or every implementation file with private
 * helpers becomes a violation.
 *
 *  1. Declare two local helpers beside one exported identity.
 *  2. Run the rule against a file named after the export.
 *  3. Assert silence.
 */
func TestSingularIgnoresNonExportedDeclarations(t *testing.T) {
  assertSilent(t, runSingularRule(t, "src/publish.ts", `
const cache = new Map<string, string>();
function normalize(value: string): string {
  return value.trim();
}
export const publish = (value: string): string => normalize(value) + cache.size;
`))
}

/**
 * Verifies an alias of an imported binding is a re-export, not an identity.
 *
 * The declaration lives in the other module, so this file owns nothing. A rule
 * keyed on the export list alone would count it and demand the file be renamed
 * after someone else's declaration.
 *
 *  1. Import a binding and re-expose it under a new name.
 *  2. Run the rule against a file named after neither.
 *  3. Assert silence.
 */
func TestSingularIgnoresAliasesOfImportedBindings(t *testing.T) {
  assertSilent(t, runSingularRule(t, "src/facade.ts", `
import { alpha } from "./alpha";
export { alpha as Renamed };
export default alpha;
`))
}

/**
 * Verifies the anonymous default diagnostic.
 *
 * An anonymous default exposes something no file name can match and no consumer
 * can address by name, so it needs its own message rather than a mismatch
 * complaint naming an empty identity.
 *
 *  1. Default-export an anonymous arrow function.
 *  2. Run the rule.
 *  3. Assert the anonymous-default message.
 */
func TestSingularReportsAnonymousDefaultExpressions(t *testing.T) {
  messages := runSingularRule(t, "src/handler.ts", `
export default (): void => {};
`)
  assertReported(t, messages, "An anonymous default export has no name")
}

/**
 * Verifies the anonymous default diagnostic covers unnamed declarations.
 *
 * `export default function () {}` is a declaration rather than an expression,
 * so it reaches the rule down a different branch than the arrow above and would
 * otherwise pass unreported.
 *
 *  1. Default-export an unnamed function declaration.
 *  2. Run the rule.
 *  3. Assert the anonymous-default message.
 */
func TestSingularReportsAnonymousDefaultDeclarations(t *testing.T) {
  messages := runSingularRule(t, "src/handler.ts", `
export default function () {}
`)
  assertReported(t, messages, "An anonymous default export has no name")
}

/**
 * Verifies a named default declaration keeps its declared name.
 *
 * `export default function handler() {}` exposes only `default`, but the
 * declaration is named, so the file is the file of `handler` — the negative
 * twin that keeps the anonymous branch from swallowing named declarations.
 *
 *  1. Default-export a named function declaration.
 *  2. Run the rule against a file of that name.
 *  3. Assert silence.
 */
func TestSingularAcceptsNamedDefaultDeclarations(t *testing.T) {
  assertSilent(t, runSingularRule(t, "src/handler.ts", `
export default function handler(): void {}
`))
}

/**
 * Verifies an empty module marker is not an identity.
 *
 * `export {}` exists to make a file a module and declares nothing. Treating an
 * export list as ownership regardless of its contents would report it.
 *
 *  1. Write only an empty export list.
 *  2. Run the rule.
 *  3. Assert silence.
 */
func TestSingularIgnoresEmptyExportMarkers(t *testing.T) {
  assertSilent(t, runSingularRule(t, "src/ambient.ts", `
export {};
`))
}
