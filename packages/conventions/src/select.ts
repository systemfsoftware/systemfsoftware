import * as fs from 'node:fs'
import * as path from 'node:path'

const GLOB_CHARACTERS = /[*?[\]]/

export const isGlob = (candidate: string): boolean => GLOB_CHARACTERS.test(candidate)

export interface SelectionOptions {
  readonly roots: ReadonlyArray<string>
  readonly target: string
  readonly ignores: ReadonlyArray<string>
  readonly cwd: string
}

const ALWAYS_EXCLUDED: Record<string, true> = {
  '.git': true,
  'node_modules': true,
}

const segmentToRegex = (segment: string): string =>
  segment.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')

const ignoreMatcher = (pattern: string): (candidate: string) => boolean => {
  const prefix = pattern.replace(/\/+$/, '').replace(/\/\*\*$/, '')
  const anchored = prefix.split('/').map(segmentToRegex).join('/')
  const regex = new RegExp(`^${anchored}(/.*)?$`)
  return (candidate: string) => regex.test(candidate)
}

const walk = (
  absoluteDir: string,
  target: string,
  prefix: string,
  relativeDir: string,
  matchers: ReadonlyArray<(candidate: string) => boolean>,
): readonly string[] => {
  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true })
  const collected: string[] = []
  for (const entry of entries) {
    if (ALWAYS_EXCLUDED[entry.name] !== true) {
      const withinRoot = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`
      const candidate = prefix === '' ? withinRoot : `${prefix}/${withinRoot}`
      if (!matchers.some((matches) => matches(candidate))) {
        const absolute = path.join(absoluteDir, entry.name)
        if (entry.isDirectory()) {
          collected.push(...walk(absolute, target, prefix, withinRoot, matchers))
        } else if (entry.name === target) {
          collected.push(absolute)
        }
      }
    }
  }
  return collected
}
export const selectFiles = (options: SelectionOptions): readonly string[] => {
  const matchers = options.ignores.map(ignoreMatcher)
  const files: string[] = []
  for (const root of options.roots) {
    const absoluteRoot = path.resolve(options.cwd, root.replace(/\/\*\*\/[^/]*$/, '').replace(/\/\*$/, ''))
    const prefix = path.relative(options.cwd, absoluteRoot)
    if (fs.existsSync(absoluteRoot)) files.push(...walk(absoluteRoot, options.target, prefix, '', matchers))
  }
  return [...new Set(files)].sort()
}
