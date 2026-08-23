import { Effect } from 'effect'
import ts from 'typescript'
import type { CheckPackageOptions } from '../CheckPackage.js'
import type { Package } from '../CreatePackage.js'
import type {
  BuildTool,
  EntrypointInfo,
  EntrypointResolutionAnalysis,
  ModuleKind,
  Resolution,
  ResolutionKind,
  ResolutionOption,
} from '../Types.js'
import { allBuildTools, getResolutionKinds } from '../Utils.js'
import { type CompilerHost, type CompilerHosts } from './MultiCompilerHost.js'

const extensions = new Set(['.jsx', '.tsx', '.js', '.ts', '.mjs', '.cjs', '.mts', '.cjs'])

function getEntrypoints(fs: Package, exportsObject: unknown, options: CheckPackageOptions | undefined): string[] {
  if (options?.entrypoints) {
    return options.entrypoints.map((e) => formatEntrypointString(e, fs.packageName))
  }
  if (exportsObject === undefined && fs) {
    const rootDir = `/node_modules/${fs.packageName}`
    const proxies = getProxyDirectories(rootDir, fs)
    if (proxies.length === 0) {
      if (options?.entrypointsLegacy) {
        return fs
          .listFiles()
          .filter((f) => !ts.isDeclarationFileName(f) && extensions.has(f.slice(f.lastIndexOf('.'))))
          .map((f) => '.' + f.slice(rootDir.length))
      }
      return ['.']
    }
    return proxies
  }
  const detectedSubpaths = getSubpaths(exportsObject)
  if (detectedSubpaths.length === 0 && hasExportTarget(exportsObject)) {
    detectedSubpaths.push('.')
  }
  const included = unique([
    ...detectedSubpaths,
    ...(options?.includeEntrypoints?.map((e) => formatEntrypointString(e, fs.packageName)) ?? []),
  ])
  if (!options?.excludeEntrypoints) {
    return included
  }
  return included.filter((entrypoint) => {
    return !options?.excludeEntrypoints?.some((exclusion) => {
      if (typeof exclusion === 'string') {
        return formatEntrypointString(exclusion, fs.packageName) === entrypoint
      }
      return exclusion.test(entrypoint)
    })
  })
}

function formatEntrypointString(path: string, packageName: string) {
  return (
    path === '.' || path.startsWith('./')
      ? path
      : path === packageName
      ? '.'
      : path.startsWith(`${packageName}/`)
      ? `.${path.slice(packageName.length)}`
      : `./${path}`
  ).trim()
}

function getSubpaths(exportsObject: unknown): string[] {
  if (exportsObject === null || typeof exportsObject !== 'object' || Array.isArray(exportsObject)) {
    return []
  }
  const keys = Object.keys(exportsObject)
  if (keys[0]?.startsWith('.')) {
    return keys.filter((key) => hasExportTarget(Object.getOwnPropertyDescriptor(exportsObject, key)?.value))
  }
  return keys.flatMap((key) => getSubpaths(Object.getOwnPropertyDescriptor(exportsObject, key)?.value))
}

function hasExportTarget(exportsObject: unknown): boolean {
  if (exportsObject === null || exportsObject === undefined) {
    return false
  }
  if (typeof exportsObject !== 'object') {
    return true
  }
  if (Array.isArray(exportsObject)) {
    return exportsObject.some(hasExportTarget)
  }
  return Object.keys(exportsObject).some((key) =>
    hasExportTarget(Object.getOwnPropertyDescriptor(exportsObject, key)?.value)
  )
}

function getProxyDirectories(rootDir: string, fs: Package) {
  const vendorDirectories = new Set<string>()
  const proxyDirectories: string[] = []
  const files = fs.listFiles().sort((a, b) => a.length - b.length)
  for (const file of files) {
    if (file.startsWith(rootDir) && file.endsWith('/package.json')) {
      try {
        const packageJson: unknown = JSON.parse(fs.readFile(file))
        const packageName: unknown = Object.getOwnPropertyDescriptor(packageJson, 'name')?.value
        if (
          typeof packageName === 'string' &&
          packageName &&
          !packageName.startsWith(fs.packageName)
        ) {
          // Name unrelated to the root package, this is a vendored package
          const vendorDir = file.slice(0, file.lastIndexOf('/'))
          vendorDirectories.add(vendorDir)
        } else if (
          Object.getOwnPropertyDescriptor(packageJson, 'main') !== undefined && !isInsideVendorDirectory(file)
        ) {
          // No name or name starting with root package name, this is intended to be an entrypoint
          const proxyDir = '.' + file.slice(rootDir.length, file.lastIndexOf('/'))
          proxyDirectories.push(proxyDir)
        }
      } catch {}
    }
  }

  return proxyDirectories.sort((a, b) => {
    return ts.comparePathsCaseInsensitive(a, b)
  })

  function isInsideVendorDirectory(file: string) {
    return !!ts.forEachAncestorDirectory(file, (dir) => {
      if (vendorDirectories.has(dir)) {
        return true
      }
    })
  }
}
/** @internal */
export const getEntrypointInfo = (
  packageName: string,
  fs: Package,
  hosts: CompilerHosts,
  options: CheckPackageOptions | undefined,
): Effect.Effect<Record<string, EntrypointInfo>> =>
  Effect.gen(function*() {
    const packageJson: unknown = JSON.parse(fs.readFile(`/node_modules/${packageName}/package.json`))
    const exportsObject: unknown = Object.getOwnPropertyDescriptor(packageJson, 'exports')?.value
    let entrypoints = getEntrypoints(fs, exportsObject, options)
    if (fs.typesPackage) {
      const typesPackageJson: unknown = JSON.parse(
        fs.readFile(`/node_modules/${fs.typesPackage.packageName}/package.json`),
      )
      const typesExportsObject: unknown = Object.getOwnPropertyDescriptor(typesPackageJson, 'exports')?.value
      const typesEntrypoints = getEntrypoints(fs, typesExportsObject, options)
      entrypoints = unique([...entrypoints, ...typesEntrypoints])
    }
    const result: Record<string, EntrypointInfo> = {}
    for (const entrypoint of entrypoints) {
      const resolutions: Record<ResolutionKind, EntrypointResolutionAnalysis> = {
        node10: yield* getEntrypointResolution(packageName, hosts.node10, 'node10', entrypoint),
        'node16-cjs': yield* getEntrypointResolution(packageName, hosts.node16, 'node16-cjs', entrypoint),
        'node16-esm': yield* getEntrypointResolution(packageName, hosts.node16, 'node16-esm', entrypoint),
        bundler: yield* getEntrypointResolution(packageName, hosts.bundler, 'bundler', entrypoint),
      }
      result[entrypoint] = {
        subpath: entrypoint,
        resolutions,
        hasTypes: Object.values(resolutions).some((r) => r.resolution?.isTypeScript),
        isWildcard: !!resolutions.bundler.isWildcard,
      }
    }
    return result
  })

const getEntrypointResolution = (
  packageName: string,
  host: CompilerHost,
  resolutionKind: ResolutionKind,
  entrypoint: string,
): Effect.Effect<EntrypointResolutionAnalysis> =>
  Effect.gen(function*() {
    if (entrypoint.includes('*')) {
      return { name: entrypoint, resolutionKind, isWildcard: true }
    }
    const moduleSpecifier = packageName + entrypoint.substring(1)
    const importingFileName = resolutionKind === 'node16-esm' ? '/index.mts' : '/index.ts'
    const resolutionMode = resolutionKind === 'node16-esm'
      ? ts.ModuleKind.ESNext
      : resolutionKind === 'node16-cjs'
      ? ts.ModuleKind.CommonJS
      : undefined
    const resolution = tryResolve()
    const implementationResolution = tryResolve(true)
    const files = resolution
      ? (yield* host.createPrimaryProgram(resolution.fileName)).getSourceFiles().map((f) => f.fileName)
      : undefined

    return {
      name: entrypoint,
      resolutionKind,
      resolution,
      implementationResolution,
      files,
    }

    function tryResolve(noDtsResolution?: boolean): Resolution | undefined {
      const { resolution, trace } = host.resolveModuleName(
        moduleSpecifier,
        importingFileName,
        resolutionMode,
        noDtsResolution,
      )
      const fileName = resolution.resolvedModule?.resolvedFileName
      if (!fileName) {
        return undefined
      }

      return {
        fileName,
        isJson: resolution.resolvedModule.extension === ts.Extension.Json,
        isTypeScript: ts.hasTSFileExtension(resolution.resolvedModule.resolvedFileName),
        trace,
      }
    }
  })
function unique<T>(array: readonly T[]): T[] {
  return array.filter((value, index) => array.indexOf(value) === index)
}
/** @internal */
export function getBuildTools(packageJson: {
  devDependencies?: Record<string, string>
}): Partial<Record<BuildTool, string>> {
  if (!packageJson.devDependencies) {
    return {}
  }
  const result: Partial<Record<BuildTool, string>> = {}
  for (const buildTool of allBuildTools) {
    if (buildTool in packageJson.devDependencies) {
      result[buildTool] = packageJson.devDependencies[buildTool]
    }
  }
  return result
}
/** @internal */
export function getModuleKinds(
  entrypoints: Record<string, EntrypointInfo>,
  resolutionOption: ResolutionOption,
  hosts: CompilerHosts,
): Record<string, ModuleKind> {
  const host = hosts[resolutionOption]
  const result: Record<string, ModuleKind> = {}
  for (const resolutionKind of getResolutionKinds(resolutionOption)) {
    for (const entrypoint of Object.values(entrypoints)) {
      const resolution = entrypoint.resolutions[resolutionKind]
      for (const fileName of resolution.files ?? []) {
        if (!result[fileName]) {
          const moduleKind = host.getModuleKindForFile(fileName)
          if (moduleKind) {
            result[fileName] = moduleKind
          }
        }
      }
      if (resolution.implementationResolution) {
        const fileName = resolution.implementationResolution.fileName
        if (!result[fileName]) {
          const moduleKind = host.getModuleKindForFile(fileName)
          if (moduleKind) {
            result[fileName] = moduleKind
          }
        }
      }
    }
  }
  return result
}
