// Reads the pnpm workspace declaration: the parsed pnpm-workspace.yaml and the
// package directories its `packages:` globs name.
import { join } from '@std/path'
import { parse } from '@std/yaml'
import { exists, Undecided } from './verdict.ts'

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
    if (!entry.endsWith('/*')) {
      throw new Undecided(`${WORKSPACE_FILE}: only \`<dir>/*\` globs are understood; got ${entry}`)
    }
    return entry.slice(0, -2)
  })
}

/** Absolute directories of the workspace's packages: each holds a package.json. */
export const workspacePackageDirs = async (root: string, doc: WorkspaceDocument): Promise<readonly string[]> => {
  const dirs = new Set<string>()
  for (const parent of packageGlobs(doc)) {
    const prefix = join(root, parent)
    if (!(await exists(prefix))) continue
    for await (const entry of Deno.readDir(prefix)) {
      const dir = join(prefix, entry.name)
      if (entry.isDirectory && (await exists(join(dir, 'package.json')))) dirs.add(dir)
    }
  }
  if (dirs.size === 0) throw new Undecided(`${WORKSPACE_FILE}: no package directory matched its globs`)
  return [...dirs].sort()
}
