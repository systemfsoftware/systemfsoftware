import { RegExpParser, visitRegExpAST } from '@eslint-community/regexpp'

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
    const f = flags ?? ''
    const parser = new RegExpParser()
    const ast = parser.parsePattern(pattern, undefined, undefined, {
      unicode: f.includes('u'),
      unicodeSets: f.includes('v'),
    })
    const bol: Array<{ start: number; end: number; text: string }> = []
    const eol: Array<{ start: number; end: number; text: string }> = []
    const rest: Array<{ start: number; end: number; text: string; priority: number }> = []

    visitRegExpAST(ast, {
      onAssertionEnter(node) {
        if (node.kind === 'start') {
          const splice = { start: node.start, end: node.end, text: '' }
          const mutated = pattern.slice(0, splice.start) + splice.text + pattern.slice(splice.end)
          if (mutated.length === 0) {
            return
          }
          bol.push(splice)
        } else if (node.kind === 'end') {
          const splice = { start: node.start, end: node.end, text: '' }
          const mutated = pattern.slice(0, splice.start) + splice.text + pattern.slice(splice.end)
          if (mutated.length === 0) {
            return
          }
          eol.push(splice)
        } else if (node.kind === 'lookahead' || node.kind === 'lookbehind') {
          const offset = node.kind === 'lookahead' ? 2 : 3
          const pos = node.start + offset
          const text = node.negate ? '=' : '!'
          rest.push({ start: pos, end: pos + 1, text, priority: 1 })
        }
      },
      onCharacterClassEnter(node) {
        const pos = node.start + 1
        if (node.negate) {
          rest.push({ start: pos, end: pos + 1, text: '', priority: 1 })
        } else {
          rest.push({ start: pos, end: pos, text: '^', priority: 1 })
        }
      },
      onCharacterSetEnter(node) {
        if (node.kind === 'digit' || node.kind === 'space' || node.kind === 'word') {
          const pos = node.start + 1
          const cur = node.raw[1] ?? ''
          const toggled = cur === cur.toUpperCase() ? cur.toLowerCase() : cur.toUpperCase()
          rest.push({ start: pos, end: pos + 1, text: toggled, priority: 2 })
        } else if (node.kind === 'property') {
          const pos = node.start + 1
          const cur = node.raw[1] ?? ''
          const toggled = cur === 'p' ? 'P' : 'p'
          rest.push({ start: pos, end: pos + 1, text: toggled, priority: 2 })
        }
      },
      onQuantifierEnter(node) {
        rest.push({ start: node.start, end: node.end, text: node.element.raw, priority: 0 })
      },
    })

    rest.sort((a, b) => a.start - b.start || a.priority - b.priority)
    const all = [...bol, ...eol, ...rest]
    return all.map((s) => pattern.slice(0, s.start) + s.text + pattern.slice(s.end))
  } catch {
    return []
  }
}
