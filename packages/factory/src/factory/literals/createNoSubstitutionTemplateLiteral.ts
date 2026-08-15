import type { NoSubstitutionTemplateLiteral } from "../../ast";
import { make } from "../internal/make";

/**
 * Create a {@link NoSubstitutionTemplateLiteral}: a backtick template string
 * with no `${...}` substitutions.
 *
 * The `text` is the cooked content between the backticks. Because there are no
 * placeholders, the whole literal is a single span. The optional `rawText`
 * carries the source spelling before escape processing; the printer emits it
 * verbatim when present, and otherwise escapes the cooked `text` so it
 * re-parses to the same value.
 *
 * With `text` of `hello`, this prints:
 *
 * ```ts
 * `hello`;
 * ```
 *
 * @author Jeongho Nam - https://github.com/samchon
 * @param text The text.
 * @param rawText The rawText.
 * @returns The created node.
 */
export const createNoSubstitutionTemplateLiteral = (
  text: string,
  rawText?: string,
): NoSubstitutionTemplateLiteral =>
  make("NoSubstitutionTemplateLiteral", { text, rawText });
