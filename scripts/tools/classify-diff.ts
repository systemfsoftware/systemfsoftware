// classify-diff - decide whether a pull request changes only documentation.
//
//   classify-diff --event <github.event_name> [--paths <file>] [--docs-globs <globs>]
//
// `--paths` names a file of NUL-separated repository paths (`git diff --name-only -z`); an absent, unreadable
// or empty file is a diff the classifier cannot place. `--docs-globs` replaces the default docs set with a
// newline- or comma-separated glob list. Under Actions, GITHUB_OUTPUT gets only fixed tokens: `scope` (`docs-only`
// or `full`) and the `reason` code. A path is text from the diff and can hold a newline, so the first path outside
// the docs set goes to stdout alone, JSON-quoted. Every doubt resolves to `full`, which runs everything.

import { parseArgs } from '@std/cli/parse-args'
import { globToRegExp } from '@std/path'

const DEFAULT_DOCS_GLOBS: readonly string[] = ['docs/**', '*.md', '**/AGENTS.md', '**/CLAUDE.md']

type Verdict =
  | { readonly scope: 'docs-only'; readonly reason: 'docs-only' }
  | { readonly scope: 'full'; readonly reason: 'not-a-pull-request' | 'diff-unreadable' | 'no-paths' }
  | { readonly scope: 'full'; readonly reason: 'outside-docs'; readonly path: string }

export const parseGlobs = (text: string): readonly string[] =>
  text.split(/[\n,]/).map((glob) => glob.trim()).filter((glob) => glob.length > 0)

/** `paths` is undefined when the diff could not be read. */
export const classify = (
  event: string,
  paths: readonly string[] | undefined,
  globs: readonly string[] = DEFAULT_DOCS_GLOBS,
): Verdict => {
  if (event !== 'pull_request') return { scope: 'full', reason: 'not-a-pull-request' }
  if (paths === undefined) return { scope: 'full', reason: 'diff-unreadable' }
  if (paths.length === 0) return { scope: 'full', reason: 'no-paths' }
  const docs = globs.map((glob) => globToRegExp(glob, { extended: true, globstar: true }))
  const outside = paths.find((path) => !docs.some((pattern) => pattern.test(path)))
  return outside === undefined
    ? { scope: 'docs-only', reason: 'docs-only' }
    : { scope: 'full', reason: 'outside-docs', path: outside }
}

const readPaths = async (file: string | undefined): Promise<readonly string[] | undefined> => {
  if (file === undefined) return undefined
  try {
    return (await Deno.readTextFile(file)).split('\0').filter((path) => path.length > 0)
  } catch {
    return undefined
  }
}

if (import.meta.main) {
  const args = parseArgs(Deno.args, { string: ['event', 'paths', 'docs-globs'] })
  const globs = args['docs-globs'] === undefined || args['docs-globs'].trim() === ''
    ? DEFAULT_DOCS_GLOBS
    : parseGlobs(args['docs-globs'])
  const verdict = classify(args.event ?? '', await readPaths(args.paths), globs)
  const path = verdict.reason === 'outside-docs' ? ` path=${JSON.stringify(verdict.path)}` : ''
  console.log(`scope=${verdict.scope} reason=${verdict.reason}${path}`)
  const output = Deno.env.get('GITHUB_OUTPUT')
  if (output !== undefined) {
    await Deno.writeTextFile(output, `scope=${verdict.scope}\nreason=${verdict.reason}\n`, { append: true })
  }
}
