package evidence

import "testing"

/**
 * Verifies a merged identity documented on its first declaration.
 *
 * The identity's basis is whichever declaration comes first, so this is the
 * shape the rule is written around: one block, on the interface, with the
 * namespace half carrying nothing.
 *
 *  1. Document only the interface half of a merged identity.
 *  2. Run the rule with the default selection.
 *  3. Assert silence.
 */
func TestDocumentedAcceptsAMergedIdentityDocumentedFirst(t *testing.T) {
  assertSilent(t, runDocumentedRule(t, "src/ISale.ts", `
/** A sale offered to a customer. */
export interface ISale {
  /** Identifier of the sale. */
  id: string;
}
export namespace ISale {
  /** Creation input. */
  export interface ICreate {
    /** Identifier of the sale. */
    id: string;
  }
}
`, ""))
}

/**
 * Verifies a block on a later half does not satisfy the first declaration.
 *
 * This is the case that pins "the first declaration is the basis" rather than
 * "a block anywhere will do". A rule accepting any block would fall silent
 * here, and the identity a reader meets first would stay unexplained.
 *
 *  1. Leave the interface bare and document the namespace half.
 *  2. Run the rule.
 *  3. Assert the identity is reported.
 */
func TestDocumentedReportsAMergedIdentityDocumentedOnlyLater(t *testing.T) {
  assertReported(t, runDocumentedRule(t, "src/ISale.ts", `
export interface ISale {
  /** Identifier of the sale. */
  id: string;
}
/** A sale offered to a customer. */
export namespace ISale {
  /** Creation input. */
  export interface ICreate {
    /** Identifier of the sale. */
    id: string;
  }
}
`, ""), "Missing JSDoc on exported type 'ISale'")
}

/**
 * Verifies both halves carrying a block is not a problem.
 *
 * The first declaration decides, and nothing polices the rest. A rule that
 * counted blocks would report the common case of a companion namespace
 * explaining itself, which is documentation the author meant to write.
 *
 *  1. Document both halves of a merged identity.
 *  2. Run the rule.
 *  3. Assert silence.
 */
func TestDocumentedAcceptsBothHalvesOfAMergedIdentityDocumented(t *testing.T) {
  assertSilent(t, runDocumentedRule(t, "src/ISale.ts", `
/** A sale offered to a customer. */
export interface ISale {
  /** Identifier of the sale. */
  id: string;
}
/** Companion contracts of a sale. */
export namespace ISale {
  /** Creation input. */
  export interface ICreate {
    /** Identifier of the sale. */
    id: string;
  }
}
`, ""))
}

/**
 * Verifies a merged identity documented on neither half is reported once.
 *
 * The fourth position of the matrix, and the twin that keeps the accepting
 * cases from being satisfied by a rule that never fires.
 *
 *  1. Document neither half of a merged identity.
 *  2. Run the rule.
 *  3. Assert exactly one finding.
 */
func TestDocumentedReportsAMergedIdentityDocumentedNowhere(t *testing.T) {
  assertReported(t, runDocumentedRule(t, "src/ISale.ts", `
export interface ISale {
  /** Identifier of the sale. */
  id: string;
}
export namespace ISale {
  /** Current version. */
  export const version = "1";
}
`, ""), "Missing JSDoc on exported type 'ISale'")
}

/**
 * Verifies a const founds the identity its default export re-exposes.
 *
 * `export default x` declares nothing and materializes no unit, so the const is
 * the natural first declaration and no special case is needed. This is the
 * shape the plugin's own entry point uses.
 *
 *  1. Document the const and leave the default export bare.
 *  2. Run the rule.
 *  3. Assert silence.
 */
func TestDocumentedAcceptsAConstDocumentedBeforeItsDefaultExport(t *testing.T) {
  assertSilent(t, runDocumentedRule(t, "src/evidence.ts", `
/** The exported plugin descriptor. */
export const evidence = { name: "evidence" };
export default evidence;
`, ""))
}

/**
 * Verifies documenting the default export does not stand in for the const.
 *
 * The re-exposure is not where the identity is declared, so a block there
 * leaves the declaration itself unexplained.
 *
 *  1. Leave the const bare and document its default export.
 *  2. Run the rule.
 *  3. Assert the identity is reported.
 */
func TestDocumentedReportsAConstDocumentedOnlyAtItsDefaultExport(t *testing.T) {
  assertReported(t, runDocumentedRule(t, "src/evidence.ts", `
export const evidence = { name: "evidence" };
/** The exported plugin descriptor. */
export default evidence;
`, ""), "Missing JSDoc on exported property 'evidence'")
}

/**
 * Verifies the first signature founds an overload set.
 *
 * The signatures are one identity, and the convention is a block above the
 * first. Nothing is asked of the rest.
 *
 *  1. Document only the first of two signatures plus an implementation.
 *  2. Run the rule.
 *  3. Assert silence.
 */
func TestDocumentedAcceptsAnOverloadSetDocumentedOnItsFirstSignature(t *testing.T) {
  assertSilent(t, runDocumentedRule(t, "src/format.ts", `
/** Renders a value for display. */
export function format(value: string): string;
export function format(value: number): string;
export function format(value: string | number): string {
  return String(value);
}
`, ""))
}

/**
 * Verifies a block on every overload signature is fine.
 *
 * Per-signature JSDoc is a real language-service feature — an editor shows the
 * matching signature's block at a call site — and judging only the first
 * declaration leaves that untouched rather than forcing a choice between the
 * two.
 *
 *  1. Document every signature of an overload set.
 *  2. Run the rule.
 *  3. Assert silence.
 */
func TestDocumentedAcceptsEveryOverloadSignatureDocumented(t *testing.T) {
  assertSilent(t, runDocumentedRule(t, "src/format.ts", `
/** Renders a string for display. */
export function format(value: string): string;
/** Renders a number for display. */
export function format(value: number): string;
/** Renders either for display. */
export function format(value: string | number): string {
  return String(value);
}
`, ""))
}

/**
 * Verifies an overload set documented only on a later signature is reported.
 *
 * The twin proving the first signature is the basis rather than merely one
 * acceptable position among several.
 *
 *  1. Leave the first signature bare and document the second.
 *  2. Run the rule.
 *  3. Assert the callable is reported.
 */
func TestDocumentedReportsAnOverloadSetDocumentedOnlyLater(t *testing.T) {
  assertReported(t, runDocumentedRule(t, "src/format.ts", `
export function format(value: string): string;
/** Renders a number for display. */
export function format(value: number): string;
export function format(value: string | number): string {
  return String(value);
}
`, ""), "Missing JSDoc on exported function 'format'")
}

/**
 * Verifies an empty block on the first declaration is reported as empty.
 *
 * Only the first declaration is read, so a block with content on a later half
 * cannot rescue it — and the reader is looking straight at a block, which is
 * why the emptiness message exists rather than the missing one.
 *
 *  1. Leave an empty block on the interface and a real one on the namespace.
 *  2. Run the rule.
 *  3. Assert the emptiness diagnostic.
 */
func TestDocumentedReportsAnEmptyBlockOnTheFirstDeclaration(t *testing.T) {
  assertReported(t, runDocumentedRule(t, "src/ISale.ts", `
/** */
export interface ISale {
  /** Identifier of the sale. */
  id: string;
}
/** A sale offered to a customer. */
export namespace ISale {
  /** Creation input. */
  export interface ICreate {
    /** Identifier of the sale. */
    id: string;
  }
}
`, ""), "Empty JSDoc on exported type 'ISale'")
}
