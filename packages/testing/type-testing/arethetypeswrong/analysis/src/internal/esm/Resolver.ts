import type { Package } from '@systemfsoftware/npm-package'
import { Option, Schema } from 'effect'
import { PackageJsonSchema } from './Resolver.schema.js'

/** @internal */
export interface ResolveResult {
  format: string | undefined
  url: URL
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const decodePackageJson = Schema.decodeUnknownOption(PackageJsonSchema)

const readJson = (fs: Package, root: string): Schema.Schema.Type<typeof PackageJsonSchema> | undefined => {
  const content = fs.tryReadFile(`${root}package.json`)
  if (content === undefined) return undefined
  const parsed: unknown = JSON.parse(content)
  const decoded = decodePackageJson(parsed)
  return Option.isSome(decoded) ? decoded.value : undefined
}

const findRoot = (fs: Package, start: string): string | undefined => {
  let current = start
  while (true) {
    const slashIndex = current.lastIndexOf('/')
    const dir = slashIndex <= 0 ? '/' : current.slice(0, slashIndex + 1)
    if (fs.fileExists(`${dir}package.json`.replace('//', '/'))) return dir
    if (dir === '/') return undefined
    current = dir.slice(0, -1)
  }
}

const getFormat = (fs: Package, filePath: string): string | undefined => {
  if (filePath.endsWith('.mjs')) return 'module'
  if (filePath.endsWith('.cjs')) return 'commonjs'
  if (filePath.endsWith('.json')) return 'json'
  if (filePath.endsWith('.js')) {
    const root = findRoot(fs, filePath)
    if (root !== undefined) {
      const pjson = readJson(fs, root)
      if (pjson?.type === 'module') return 'module'
    }
    return 'commonjs'
  }
  return undefined
}

const cjsExtensions = ['.js', '.json', '.node'] as const

const resolveStringTarget = (
  fs: Package,
  root: string,
  target: string,
  match: string | null,
  conds: readonly string[],
  isImports: boolean,
): string | undefined => {
  let resolved = target
  if (match !== null) {
    if (!resolved.includes('*')) return undefined
    resolved = resolved.replace('*', match)
  } else if (resolved.includes('*')) return undefined
  if (!resolved.startsWith('./') && !resolved.startsWith('/')) {
    if (!isImports) return undefined
    const barePackagePath = `/node_modules/${resolved}/`.replace(/\/+/g, '/')
    if (!fs.directoryExists(barePackagePath)) return undefined
    const barePjson = readJson(fs, barePackagePath)
    if (barePjson?.main && typeof barePjson.main === 'string') {
      const mainPath = `${barePackagePath}${barePjson.main.startsWith('./') ? barePjson.main.slice(2) : barePjson.main}`
      if (fs.fileExists(mainPath)) return mainPath
    }
    if (fs.fileExists(`${barePackagePath}index.js`)) return `${barePackagePath}index.js`
    return undefined
  }
  if (resolved.toLowerCase().includes('node_modules') || resolved.includes('%2f') || resolved.includes('%5c')) {
    return undefined
  }
  return `${root}${resolved.slice(2)}`
}

const resolveArrayTarget = (
  fs: Package,
  root: string,
  target: unknown[],
  match: string | null,
  conds: readonly string[],
  isImports: boolean,
): string | undefined => {
  for (const item of target) {
    const result = resolvePackageTarget(fs, root, item, match, conds, isImports)
    if (result !== undefined) return result
  }
  return undefined
}

const resolveObjectTarget = (
  fs: Package,
  root: string,
  target: Record<string, unknown>,
  match: string | null,
  conds: readonly string[],
  isImports: boolean,
): string | undefined => {
  for (const condition of [...conds, 'default']) {
    if (condition in target) {
      const result = resolvePackageTarget(fs, root, target[condition], match, conds, isImports)
      if (result !== undefined) return result
    }
  }
  return undefined
}

const resolvePackageTarget = (
  fs: Package,
  root: string,
  target: unknown,
  match: string | null,
  conds: readonly string[],
  isImports: boolean,
): string | undefined => {
  if (typeof target === 'string') return resolveStringTarget(fs, root, target, match, conds, isImports)
  if (target === null) return undefined
  if (Array.isArray(target)) return resolveArrayTarget(fs, root, target, match, conds, isImports)
  if (isObjectRecord(target)) {
    return resolveObjectTarget(fs, root, target, match, conds, isImports)
  }
  return undefined
}

const resolveExports = (
  fs: Package,
  root: string,
  exp: unknown,
  sub: string,
  conds: readonly string[],
): string | undefined => {
  if (typeof exp === 'string') {
    if (sub !== '.' && sub !== './') return undefined
    return resolvePackageTarget(fs, root, exp, null, conds, false)
  }
  if (!isObjectRecord(exp)) return undefined
  const rec = exp
  if (sub in rec) return resolvePackageTarget(fs, root, rec[sub], null, conds, false)
  const patternKeys = Object.keys(rec).filter(key => key.includes('*')).sort((a, b) => {
    const aStar = a.indexOf('*'), bStar = b.indexOf('*')
    if (aStar !== bStar) return bStar - aStar
    return b.length - a.length
  })
  for (const key of patternKeys) {
    const starIndex = key.indexOf('*'), prefix = key.slice(0, starIndex), suffix = key.slice(starIndex + 1)
    if (sub.startsWith(prefix) && sub.endsWith(suffix) && sub.length >= key.length - 1) {
      const patternMatch = sub.slice(prefix.length, sub.length - suffix.length)
      if (
        patternMatch.toLowerCase().includes('node_modules') || patternMatch.includes('%2f') ||
        patternMatch.includes('%5c')
      ) return undefined
      const result = resolvePackageTarget(fs, root, rec[key], patternMatch, conds, false)
      if (result !== undefined) return result
    }
  }
  return undefined
}

const tryLegacy = (
  fs: Package,
  root: string,
  pjson: Schema.Schema.Type<typeof PackageJsonSchema>,
): string | undefined => {
  if (typeof pjson.main === 'string') {
    const mainPath = `${root}${pjson.main.startsWith('./') ? pjson.main.slice(2) : pjson.main}`
    if (fs.fileExists(mainPath)) return mainPath
    if (fs.fileExists(`${mainPath}.js`)) return `${mainPath}.js`
    const indexPath = `${mainPath}/index.js`
    if (fs.fileExists(indexPath)) return indexPath
    throw new Error('Not found')
  }
  const indexPath = `${root}index.js`
  if (fs.fileExists(indexPath)) return indexPath
  return undefined
}

const resolveFromPackage = (
  fs: Package,
  packagePath: string,
  subpath: string,
  conds: readonly string[],
): ResolveResult | undefined => {
  const pjson = readJson(fs, packagePath)
  if (pjson === undefined) return undefined
  if (pjson.exports !== undefined) {
    const resolved = resolveExports(fs, packagePath, pjson.exports, subpath, conds)
    if (resolved !== undefined) {
      const format = getFormat(fs, resolved)
      return { format, url: new URL(`file://${resolved}`) }
    }
    if (isObjectRecord(pjson.exports) && subpath in pjson.exports && pjson.exports[subpath] === null) {
    }
    return undefined
  }
  if (subpath === '.' || subpath === './') {
    const legacy = tryLegacy(fs, packagePath, pjson)
    if (legacy !== undefined) {
      const format = getFormat(fs, legacy)
      return { format, url: new URL(`file://${legacy}`) }
    }
  }
  return undefined
}

const resolveBare = (
  fs: Package,
  spec: string,
  parent: string,
  conds: readonly string[],
): ResolveResult | undefined => {
  const slashIndex = spec.indexOf('/')
  let packageName: string
  let subpath: string
  if (spec.startsWith('@')) {
    const secondSlash = spec.indexOf('/', slashIndex + 1)
    if (secondSlash === -1) {
      packageName = spec
      subpath = '.'
    } else {
      packageName = spec.slice(0, secondSlash)
      subpath = `.${spec.slice(secondSlash)}`
    }
  } else {
    if (slashIndex === -1) {
      packageName = spec
      subpath = '.'
    } else {
      packageName = spec.slice(0, slashIndex)
      subpath = `.${spec.slice(slashIndex)}`
    }
  }
  let current = parent
  while (true) {
    const dirSlash = current.lastIndexOf('/')
    const dir = dirSlash <= 0 ? '/' : current.slice(0, dirSlash + 1)
    const packagePath = `${dir}node_modules/${packageName}/`.replace(/\/+/g, '/')
    if (fs.directoryExists(packagePath)) {
      const result = resolveFromPackage(fs, packagePath, subpath, conds)
      if (result !== undefined) return result
    }
    if (dir === '/') break
    current = dir.slice(0, -1)
  }
  return undefined
}

const resolveRel = (fs: Package, spec: string, parent: URL): ResolveResult | undefined => {
  const parentDir = parent.pathname.slice(0, parent.pathname.lastIndexOf('/') + 1)
  const targetPath = new URL(spec, `file://${parentDir}`).pathname
  if (fs.fileExists(targetPath)) {
    const format = getFormat(fs, targetPath)
    return { format, url: new URL(`file://${targetPath}`) }
  }
  for (const ext of cjsExtensions) {
    const withExt = `${targetPath}${ext}`
    if (fs.fileExists(withExt)) {
      const format = getFormat(fs, withExt)
      return { format, url: new URL(`file://${withExt}`) }
    }
  }
  const dirPath = targetPath.endsWith('/') ? targetPath : `${targetPath}/`
  if (fs.fileExists(`${dirPath}index.js`)) {
    const format = getFormat(fs, `${dirPath}index.js`)
    return { format, url: new URL(`file://${dirPath}index.js`) }
  }
  return undefined
}

const resolveImp = (fs: Package, spec: string, parent: string, conds: readonly string[]): ResolveResult | undefined => {
  const root = findRoot(fs, parent)
  if (root === undefined) return undefined
  const pjson = readJson(fs, root)
  if (pjson === undefined || pjson.imports === undefined) return undefined
  const maybeImports = pjson.imports
  if (!isObjectRecord(maybeImports)) return undefined
  if (!(spec in maybeImports)) return undefined
  const resolved = resolvePackageTarget(fs, root, maybeImports[spec], null, conds, true)
  if (resolved === undefined) return undefined
  const format = getFormat(fs, resolved)
  return { format, url: new URL(`file://${resolved}`) }
}

const resolveSelf = (
  fs: Package,
  spec: string,
  parent: string,
  conds: readonly string[],
): ResolveResult | undefined => {
  const root = findRoot(fs, parent)
  if (root === undefined) return undefined
  const pjson = readJson(fs, root)
  if (pjson === undefined || typeof pjson.name !== 'string') return undefined
  const subpath = spec === pjson.name ? '.' : `.${spec.slice(pjson.name.length)}`
  if (spec !== pjson.name && !spec.startsWith(`${pjson.name}/`)) return undefined
  if (pjson.exports === undefined) return undefined
  const resolved = resolveExports(fs, root, pjson.exports, subpath, conds)
  if (resolved === undefined) return undefined
  const format = getFormat(fs, resolved)
  return { format, url: new URL(`file://${resolved}`) }
}

/** @internal */
export const cjsResolve = (fs: Package, spec: string, parent: URL): ResolveResult => {
  const parentPath = parent.pathname
  if (spec.startsWith('#')) {
    const result = resolveImp(fs, spec, parentPath, ['node', 'require', 'module-sync'])
    if (result !== undefined) return result
  }
  const selfResult = resolveSelf(fs, spec, parentPath, ['node', 'require', 'module-sync'])
  if (selfResult !== undefined) return selfResult
  if (spec === '.' || spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')) {
    const result = resolveRel(fs, spec, parent)
    if (result !== undefined) return result
    throw new Error('Not found')
  }
  if (!spec.startsWith('#')) {
    const result = resolveBare(fs, spec, parentPath, ['node', 'require', 'module-sync'])
    if (result !== undefined) return result
    throw new Error('Not found')
  }
  throw new Error('Not found')
}

/** @internal */
export const esmResolve = (fs: Package, spec: string, parent: URL): ResolveResult => {
  const parentPath = parent.pathname
  if (spec.startsWith('#')) {
    const result = resolveImp(fs, spec, parentPath, ['node', 'import'])
    if (result !== undefined) return result
    throw new Error('Not found')
  }
  const selfResult = resolveSelf(fs, spec, parentPath, ['node', 'import'])
  if (selfResult !== undefined) return selfResult
  if (spec === '.' || spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')) {
    const result = resolveRel(fs, spec, parent)
    if (result !== undefined) return result
    throw new Error('Not found')
  }
  if (!spec.startsWith('#')) {
    const result = resolveBare(fs, spec, parentPath, ['node', 'import'])
    if (result !== undefined) return result
    throw new Error('Not found')
  }
  throw new Error('Not found')
}
