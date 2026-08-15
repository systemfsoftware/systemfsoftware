package evidence

import "testing"

/**
 * Verifies `export =` is the same exposure as a default export.
 *
 * TypeScript's export assignment reaches the rule through the same node kind as
 * `export default`, distinguished only by a flag the rule deliberately ignores.
 * Both expose one declaration under no addressable name, so both fall back to
 * the declared name.
 *
 *  1. Declare a local const and expose it with `export =`.
 *  2. Run the rule against a file named after the declaration, then against one
 *     that is not.
 *  3. Assert the declared name is what the file must carry.
 */
func TestSingularTreatsExportEqualsAsDefaultExposure(t *testing.T) {
  source := `
const bridge = { version: "1" };
export = bridge;
`
  assertSilent(t, runSingularRule(t, "src/bridge.ts", source))
  assertReported(
    t,
    runSingularRule(t, "src/entry.ts", source),
    "'entry.ts' declares 'bridge'",
  )
}

/**
 * Verifies anonymous default classes reach the anonymous branch.
 *
 * An unnamed class declaration carries the same export and default modifiers as
 * an unnamed function but arrives under a different node kind, so the branch
 * that names neither has to be reached from both.
 *
 *  1. Default-export an unnamed class.
 *  2. Run the rule.
 *  3. Assert the anonymous-default message.
 */
func TestSingularReportsAnonymousDefaultClasses(t *testing.T) {
  assertReported(
    t,
    runSingularRule(t, "src/Service.ts", `
export default class {}
`),
    "An anonymous default export has no name",
  )
}

/**
 * Verifies a named default class keeps its declared name.
 *
 * The negative twin of the anonymous class above: the branch must key on the
 * missing name, never on the default modifier, or every named default export
 * becomes a violation.
 *
 *  1. Default-export a named class.
 *  2. Run the rule against a file of that name.
 *  3. Assert silence.
 */
func TestSingularAcceptsNamedDefaultClasses(t *testing.T) {
  assertSilent(t, runSingularRule(t, "src/Service.ts", `
export default class Service {}
`))
}

/**
 * Verifies a dotted namespace declaration counts as its outer name.
 *
 * `export namespace Outer.Inner {}` looks like one declaration with a dotted
 * name and is actually nested module declarations, which is the shape that
 * panics an `As*` accessor reached without a kind check. The outer name is the
 * identity; the inner one is a member of it.
 *
 *  1. Declare a dotted namespace.
 *  2. Run the rule against a file named after the outer segment.
 *  3. Assert silence, and that the inner segment is not demanded.
 */
func TestSingularCountsDottedNamespacesAsTheirOuterName(t *testing.T) {
  source := `
export namespace Outer.Inner {
  export const value: string = "1";
}
`
  assertSilent(t, runSingularRule(t, "src/Outer.ts", source))
  assertReported(
    t,
    runSingularRule(t, "src/Inner.ts", source),
    "'Inner.ts' declares 'Outer'",
  )
}

/**
 * Verifies an ambient global augmentation is not an identity.
 *
 * `declare global` is a module declaration whose name is the identifier
 * `global`, so a rule reading the name alone would demand the file be called
 * `global.ts`.
 *
 *  1. Augment the global scope and declare nothing else public.
 *  2. Run the rule against an unrelated file name.
 *  3. Assert silence.
 */
func TestSingularIgnoresGlobalAugmentations(t *testing.T) {
  assertSilent(t, runSingularRule(t, "src/ambient.ts", `
declare global {
  interface Window {
    evidence: string;
  }
}
export {};
`))
}

/**
 * Verifies an empty source file is silent.
 *
 * The zero case for the whole rule: no statements means no identity, and a
 * walker that assumed at least one would fault on the emptiest input a project
 * can contain.
 *
 *  1. Parse a file with no statements.
 *  2. Run the rule.
 *  3. Assert silence.
 */
func TestSingularAcceptsEmptyFiles(t *testing.T) {
  assertSilent(t, runSingularRule(t, "src/blank.ts", ""))
}

/**
 * Verifies the index exemption is keyed on the base name, not the extension.
 *
 * A project's entry point is `index.ts`, `index.tsx`, `index.mts`, or
 * `index.cts` depending on its module setup, and an exemption that matched only
 * one of them would report the others for a name no identifier can have.
 *
 *  1. Declare one differently named identity in each index extension.
 *  2. Run the rule.
 *  3. Assert every extension is exempt from the name match.
 */
func TestSingularExemptsEveryIndexExtension(t *testing.T) {
  source := `
export const evidence = { name: "evidence" };
`
  for _, path := range []string{
    "src/index.ts",
    "src/index.tsx",
    "src/index.mts",
    "src/index.cts",
  } {
    assertSilent(t, runSingularRule(t, path, source))
  }
}

/**
 * Verifies the name match covers the module extensions the graph already reads.
 *
 * `.mts` and `.cts` are ordinary source files to this rule, and a comparison
 * that stripped only `.ts` would leave `handler.mts` comparing as
 * `handler.mts`, reporting a correctly named file.
 *
 *  1. Declare one identity in an `.mts` and a `.cts` file of the same name.
 *  2. Run the rule.
 *  3. Assert both are silent.
 */
func TestSingularStripsModuleExtensionsBeforeMatching(t *testing.T) {
  source := `
export const handler = (): void => {};
`
  assertSilent(t, runSingularRule(t, "src/handler.mts", source))
  assertSilent(t, runSingularRule(t, "src/handler.cts", source))
}

/**
 * Verifies the count diagnostic wins over the anonymous-default one.
 *
 * A file with both problems gets one finding, and it must be the structural
 * one: the extra identity has to move before the file's name can mean anything,
 * and stacking two findings on one file teaches readers to skim them.
 *
 *  1. Declare two identities beside an anonymous default.
 *  2. Run the rule.
 *  3. Assert exactly one finding, naming the count.
 */
func TestSingularReportsTheCountBeforeTheAnonymousDefault(t *testing.T) {
  assertReported(t, runSingularRule(t, "src/pair.ts", `
export const alpha = 1;
export const beta = 2;
export default (): void => {};
`), "declares exactly one public identity")
}
