#!/usr/bin/env -S deno run --allow-read --allow-write=. --allow-env
/**
 * What the two new nodes refuse and what they emit, checked by running the compiler.
 *
 * Three of these are rejections a type cannot express — an unbalanced template, a local constructor
 * naming nothing — and the fourth is the emitted text, which is the only thing that settles whether a
 * template's escaping is right. Reading the compiler would not tell me either.
 */
import { constructIn, kernel, lit, nothing, tpl } from '../../../scripts/tools/cell.ts'
import { ROLE } from '../../../scripts/tools/role-brand.ts'
import { compileProgram, parseProgram } from '../../../scripts/tools/term-compile.ts'

const compile = (program: unknown): string => compileProgram(parseProgram(program))

const rejects = (label: string, program: unknown, fragment: string): string | undefined => {
  try {
    compile(program)
    return `${label}: compiled, and it should not have`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return message.includes(fragment) ? undefined : `${label}: rejected for the wrong reason — ${message}`
  }
}

const emits = (label: string, program: unknown, expected: string): string | undefined => {
  const out = compile(program).trim()
  return out === expected ? undefined : `${label}: emitted ${JSON.stringify(out)}, wanted ${JSON.stringify(expected)}`
}

const main = (): number => {
  const failures = [
    // A template's shape: one more piece of text than there are holes. The unbalanced term cannot come
    // from `tpl`, which is the point of `tpl`, so it is hand-built — and the brand has to be applied by
    // hand with it, because the compiler checks the brand first and a spread does not carry it (a role
    // stamps it non-enumerably, so `{ ...program }` silently loses it).
    rejects(
      'unbalanced template',
      {
        [ROLE]: 'kernel',
        imports: [],
        declarations: [{ kind: 'term', name: 'x', term: { template: { quasis: ['a'], exprs: [{ lit: 1 }] } } }],
      },
      'one more piece of text than there are holes',
    ),

    // A scoped constructor names a declaration or an import; naming neither is a defect scope knows.
    rejects(
      'constructor out of scope',
      kernel({ imports: [], declarations: [{ name: 'x', term: constructIn('Missing') }] }),
      "'Missing' is neither declared here nor imported",
    ),

    // A qualified name is in scope through its root, which is what a namespace import binds.
    emits(
      'namespace-qualified construction',
      kernel({
        imports: [{ module: 'effect/Cause', namespace: 'Cause', requires: nothing }],
        declarations: [{ name: 'x', term: constructIn('Cause.TimeoutException', lit('slow')) }],
      }),
      "import * as Cause from 'effect/Cause'\n\nexport const x = new Cause.TimeoutException('slow')",
    ),

    // The emitted text, including the three escapes a template needs.
    emits(
      'template escaping',
      kernel({ imports: [], declarations: [{ name: 'x', term: tpl(['a`b\\c${d} ', ''], lit(1)) }] }),
      'export const x = `a\\`b\\\\c\\${d} ${1}`',
    ),

    emits(
      'template with no holes',
      kernel({ imports: [], declarations: [{ name: 'x', term: tpl(['plain']) }] }),
      'export const x = `plain`',
    ),
  ].filter((f) => f !== undefined)

  for (const failure of failures) console.error(`  ${failure}`)
  console.log(`template-new.run: ${failures.length === 0 ? 'every claim holds' : `${failures.length} failure(s)`}`)
  return failures.length === 0 ? 0 : 1
}

if (import.meta.main) Deno.exitCode = main()
