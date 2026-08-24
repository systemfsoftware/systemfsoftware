import * as weaponRegex from 'weapon-regex'

/**
 * The mutations of a regular expression pattern.
 *
 * Pure: a pattern and its flags in, replacement patterns out. No I/O, no clock,
 * no throwing — a pattern this cannot parse yields no mutants, which is the
 * honest answer for a literal whose syntax the engine does not model.
 *
 * The transformation set is fixed and small, and each member changes exactly
 * one thing about the pattern:
 *
 * | family                  | example                  |
 * | ----------------------- | ------------------------ |
 * | anchor removal          | `^abc$` -> `abc$`, `^abc` |
 * | character class negation| `[abc]` <-> `[^abc]`      |
 * | predefined class negation| `\d` <-> `\D`, `\p{L}` <-> `\P{L}` |
 * | quantifier removal      | `a+`, `a*`, `a{2,3}` -> `a` |
 * | lookaround negation     | `(?=a)` <-> `(?!a)`, `(?<=a)` <-> `(?<!a)` |
 *
 * Alternation and grouping are deliberately untouched: swapping a branch or
 * dropping a group produces mutants that survive for reasons unrelated to the
 * test suite's strength, which inflates a score rather than measuring one.
 *
 * The order is part of the contract, because a mutant's identity in a report is
 * its position: anchors first, then each remaining position left to right with
 * quantifier removal ahead of class negation.
 */
export function mutateRegexPattern(pattern: string, flags: string | undefined): readonly string[] {
  if (pattern.length === 0) {
    return []
  }
  try {
    return weaponRegex.mutate(pattern, flags, { mutationLevels: [1] }).map((mutant) => mutant.pattern)
  } catch {
    return []
  }
}
