/**
 * LeafFs — the filesystem seam for leaf delivery, under `internal/` (private,
 * the one place the extension performs I/O).
 *
 * Production binds `nodeLeafFs` (`node:fs/promises`); tests bind
 * `@systemfsoftware/effect-memfs` through the same small surface.
 */
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path/posix'

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
 * Ordered, existing leaf candidates for a root-relative target: walk
 * `dirname(relTarget)` upward while `dir !== '.'`, skipping anything equal to
 * or under `repos/` (the top-level `repos` node included — deliberate
 * tightening over the hook, which probed `<root>/repos/AGENTS.md`), probing
 * each `<dir>/AGENTS.md`. The first hit is the governing leaf (deepest
 * first), matching the hook's early return; the walk bound means the root
 * `AGENTS.md` is never a candidate.
 */
export const findExistingLeafCandidates = async (
  relTarget: string,
  root: string,
  fs: LeafFs,
): Promise<readonly string[]> => {
  const found: string[] = []
  let dir = dirname(relTarget)
  while (dir !== '.' && dir !== '/' && dir.length > 0) {
    const vendored = dir === 'repos' || dir.startsWith('repos/')
    if (!vendored && (await fs.exists(join(root, dir, 'AGENTS.md')))) {
      found.push(`${dir}/AGENTS.md`)
      break
    }
    dir = dirname(dir)
  }
  return found
}
