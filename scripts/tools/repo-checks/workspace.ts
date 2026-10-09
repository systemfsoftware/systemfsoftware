// Reads the pnpm workspace declaration: the parsed pnpm-workspace.yaml and the
// package directories its `packages:` globs name. A glob matches a directory
// holding a package.json; a `!` glob removes matches; node_modules is never a
// package, as in pnpm.
import { expandGlob } from '@std/fs/expand-glob'
import { dirname, join } from '@std/path'
import { parse } from '@std/yaml'
import { Undecided } from './verdict.ts'

export const WORKSPACE_FILE = 'pnpm-workspace.yaml'

export type WorkspaceDocument = Readonly<Record<string, unknown>>

export const readWorkspace = async (root: string): Promise<WorkspaceDocument> => {
  const path = join(root, WORKSPACE_FILE)
  let doc: unknown
  try {
    doc = parse(await Deno.readTextFile(path))
  } catch (cause) {
    throw new Undecided(`${path}: unreadable YAML - ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new Undecided(`${path}: the document is not a mapping`)
  }
  return doc as WorkspaceDocument
}

const packageGlobs = (doc: WorkspaceDocument): readonly string[] => {
  const declared = doc['packages']
  if (!Array.isArray(declared) || declared.length === 0) {
    throw new Undecided(`${WORKSPACE_FILE}: no \`packages:\` sequence to enumerate`)
  }
  return declared.map((entry, i) => {
    if (typeof entry !== 'string') throw new Undecided(`${WORKSPACE_FILE}: entry #${i + 1} is not a string`)
    return entry.replace(/\/+$/, '')
  })
}

/** Absolute directories of the workspace's packages: each holds a package.json. */
export const workspacePackageDirs = async (root: string, doc: WorkspaceDocument): Promise<readonly string[]> => {
  const globs = packageGlobs(doc)
  const exclude = [
    '**/node_modules/**',
    ...globs.filter((glob) => glob.startsWith('!')).map((glob) => `${glob.slice(1)}/package.json`),
  ]
  const dirs = new Set<string>()
  for (const glob of globs.filter((glob) => !glob.startsWith('!'))) {
    for await (const entry of expandGlob(`${glob}/package.json`, { root, exclude, includeDirs: false })) {
      dirs.add(dirname(entry.path))
    }
  }
  if (dirs.size === 0) throw new Undecided(`${WORKSPACE_FILE}: no package directory matched its globs`)
  return [...dirs].sort()
}
