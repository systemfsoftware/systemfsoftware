#!/usr/bin/env -S deno run --allow-read

import { expandGlob } from '@std/fs/expand-glob'
import { relative } from '@std/path'

export type SourceFile = {
  readonly path: string
  readonly text: string
}

export type Declaration = {
  readonly name: string
  readonly path: string
}

export type Verdict = {
  readonly declarations: readonly Declaration[]
  readonly orphans: readonly Declaration[]
}

const blank = (match: string): string => match.replace(/[^\n]/g, ' ')

const MODULE_SPECIFIER_STATEMENTS = [
  /^[ \t]*import\b[\s\S]*?from[ \t]*['"][^'"\n]*['"][^\n]*$/gm,
  /^[ \t]*import[ \t]*['"][^'"\n]*['"][^\n]*$/gm,
  /^[ \t]*export\b[^\n=]*?from[ \t]*['"][^'"\n]*['"][^\n]*$/gm,
  /^[ \t]*export[ \t]*\{[^}]*\}[ \t]*;?[ \t]*$/gm,
]

export const stripModuleSpecifiers = (text: string): string =>
  MODULE_SPECIFIER_STATEMENTS.reduce((acc, pattern) => acc.replace(pattern, blank), text)

const COMMENTS_AND_LITERALS =
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\[\s\S]|[^`\\])*`/g

export const stripCommentsAndLiterals = (text: string): string => text.replace(COMMENTS_AND_LITERALS, blank)

const DECLARATION = /export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*Span\s*\.\s*declare\s*[(<]/g

export const declarationsIn = (file: SourceFile): readonly Declaration[] =>
  [...stripCommentsAndLiterals(file.text).matchAll(DECLARATION)].map((match) => ({
    name: match[1] ?? '',
    path: file.path,
  }))

const TAXONOMY_MAKE = /Taxonomy\s*\.\s*make\s*\(/g

const openerDelta = (char: string): number => (char === '(' ? 1 : char === ')' ? -1 : 0)

const closingParen = (code: string, open: number): number => {
  const step = (index: number, depth: number): number => {
    if (index >= code.length) return code.length - 1
    const next = depth + openerDelta(code[index] ?? '')
    return next === 0 ? index : step(index + 1, next)
  }
  return step(open, 0)
}

export const stripTaxonomyMembership = (code: string): string =>
  [...code.matchAll(TAXONOMY_MAKE)]
    .map((match) => {
      const open = match.index + match[0].length - 1
      return { open, close: closingParen(code, open) }
    })
    .reduce(
      (acc, region) =>
        acc.slice(0, region.open) + blank(acc.slice(region.open, region.close + 1)) +
        acc.slice(region.close + 1),
      code,
    )

const DECLARATION_SITE = /export\s+const\s+[A-Za-z_$][\w$]*\s*(?::[^=\n]+)?=\s*Span\s*\.\s*declare\s*[(<]/g

export const scannableCode = (file: SourceFile): string =>
  stripTaxonomyMembership(stripCommentsAndLiterals(stripModuleSpecifiers(file.text)))
    .replace(DECLARATION_SITE, blank)

const referenceOf = (name: string): RegExp => new RegExp(`(?<![\\w$.])${name}(?![\\w$])`, 'g')

const usesDeclaration = (declaration: Declaration, files: readonly SourceFile[]): boolean =>
  files.some((file) => referenceOf(declaration.name).test(scannableCode(file)))

export const census = (sources: readonly SourceFile[], everyFile: readonly SourceFile[]): Verdict => {
  const declarations = sources.flatMap(declarationsIn)
  return {
    declarations,
    orphans: declarations.filter((declaration) => !usesDeclaration(declaration, everyFile)),
  }
}

export const render = (verdict: Verdict): string =>
  verdict.orphans
    .map((orphan) =>
      `${orphan.path}: declared span ${orphan.name} is never started and no spec observes it. ` +
      'A declaration earns its place by a start call site or a relation that inspects it; ' +
      'taxonomy membership is not a use.'
    )
    .join('\n')

const DECLARATION_ROOTS = ['packages/*/src/**/*.ts', 'examples/*/src/**/*.ts']
const USE_ROOTS = [
  ...DECLARATION_ROOTS,
  'packages/*/tests/**/*.ts',
  'packages/*/test-types/**/*.ts',
  'examples/*/tests/**/*.ts',
  'examples/*/test-types/**/*.ts',
]

const readFiles = async (root: string, globs: readonly string[]): Promise<readonly SourceFile[]> => {
  const files: SourceFile[] = []
  for (const glob of globs) {
    for await (const entry of expandGlob(glob, { root, includeDirs: false })) {
      files.push({ path: relative(root, entry.path), text: await Deno.readTextFile(entry.path) })
    }
  }
  return files
}

if (import.meta.main) {
  const root = Deno.cwd()
  const verdict = census(await readFiles(root, DECLARATION_ROOTS), await readFiles(root, USE_ROOTS))
  const failed = verdict.orphans.length > 0
  const report = failed
    ? `${render(verdict)}\n${verdict.orphans.length} orphaned of ${verdict.declarations.length} declared span(s).`
    : `check-declared-span-usage: ${verdict.declarations.length} declared span(s), every one used.`
  await Deno.stdout.write(new TextEncoder().encode(`${report}\n`))
  Deno.exit(failed ? 1 : 0)
}
