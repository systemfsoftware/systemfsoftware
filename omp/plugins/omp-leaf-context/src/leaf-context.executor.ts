/**
 * Executor cell — the impure shell.
 *
 * Probes the filesystem the same way the deleted hook did (`exists` on
 * `AGENTS.md` up the directory chain), hands the ordered candidate list to
 * the pure workflow, and on a would-inject decision reads the leaf's content
 * to materialize the `Inject` payload. Every I/O failure surfaces as a
 * `LeafContextError` on the error channel — never a silent `Skip`.
 *
 * The filesystem seam (`LeafFs`) keeps the shell testable against
 * `@systemfsoftware/effect-memfs`; production binds `nodeLeafFs`
 * (`node:fs/promises`).
 */
import { Result } from 'effect'
import { readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path/posix'
import { decide, governingLeaf, Inject, LeafContextError, Skip } from './leaf-context.workflow.js'

export interface LeafFs {
  readonly exists: (absolutePath: string) => Promise<boolean>
  readonly readFile: (absolutePath: string) => Promise<string>
}

export const nodeLeafFs: LeafFs = {
  exists: async (p) => {
    try {
      await stat(p)
      return true
    } catch {
      return false
    }
  },
  readFile: async (p) => readFile(p, 'utf8'),
}

/**
 * Project-root-relative form of a tool target, or `null` when the target is
 * outside the project root. Ported from the hook; hardened against `..`
 * traversal segments (escapee targets are treated as outside the root).
 */
export const relativeToRoot = (target: string, root: string): string | null => {
  if (isAbsolute(target)) {
    if (!target.startsWith(root + '/')) return null
    return target.slice(root.length + 1)
  }
  if (target.length === 0 || target.split('/').includes('..')) return null
  return target
}

/**
 * Ordered, existing leaf candidates for a root-relative target: walk
 * `dirname(relTarget)` upward while `dir !== '.'`, skipping anything equal to
 * or under `repos/`, probing each `<dir>/AGENTS.md`. The walk bound means the
 * root `AGENTS.md` is never a candidate, exactly as in the hook.
 */
export const findExistingLeafCandidates = async (
  relTarget: string,
  root: string,
  fs: LeafFs,
): Promise<readonly string[]> => {
  const found: string[] = []
  let dir = dirname(relTarget)
  while (dir !== '.' && dir !== '/' && dir.length > 0) {
    const vendored = dir.startsWith('repos/') && dir.length > 'repos/'.length
    if (!vendored && (await fs.exists(join(root, dir, 'AGENTS.md')))) {
      found.push(`${dir}/AGENTS.md`)
    }
    dir = dirname(dir)
  }
  return found
}

export interface RunLeafContextArgs {
  readonly root: string
  readonly relTarget: string | null
  readonly injected: ReadonlySet<string>
  readonly fs: LeafFs
}

export const runLeafContext = async (
  args: RunLeafContextArgs,
): Promise<Result.Result<Inject | Skip, LeafContextError>> => {
  try {
    if (args.relTarget === null) return Result.succeed(new Skip())
    const candidates = await findExistingLeafCandidates(args.relTarget, args.root, args.fs)
    const leaf = governingLeaf(candidates)
    const content = leaf === null ? '' : await args.fs.readFile(join(args.root, leaf))
    return decide({ relTarget: args.relTarget, leaf, content, injected: args.injected })
  } catch (error) {
    const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown failure'
    return Result.fail(new LeafContextError({ detail }))
  }
}
