import { createRequire } from 'module'
import { pathToFileURL } from 'node:url'
import path from 'path'
import { createVitest as createVitestOriginal } from 'vitest/node'

export interface ResolvedVitest {
  createVitest: typeof createVitestOriginal
  version: string
}

export type VitestResolver = (dir: string) => Promise<ResolvedVitest>

/** Falls back to the Vitest bundled with this package when `dir` has none. */
export const resolveVitest: VitestResolver = async (dir) => {
  try {
    const projectRequire = createRequire(path.join(dir, 'package.json'))
    const vitestNodePath = projectRequire.resolve('vitest/node')
    // Dynamic: the specifier is the *project's* Vitest, resolved at runtime from
    // `dir`. A static import would bind this package's own copy instead.
    const vitestNodeUrl = pathToFileURL(vitestNodePath).href
    const vitestNode: { createVitest?: typeof createVitestOriginal } = await import(vitestNodeUrl)
    return {
      createVitest: vitestNode.createVitest ?? createVitestOriginal,
      version: projectRequire(projectRequire.resolve('vitest/package.json')).version,
    }
  } catch {
    const bundledRequire = createRequire(import.meta.url)
    return {
      createVitest: createVitestOriginal,
      version: bundledRequire(bundledRequire.resolve('vitest/package.json')).version,
    }
  }
}

export type * from 'vitest/node'
