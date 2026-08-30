/// <reference types="vitest/import-meta" />
import { ModuleNotFound, ProjectModules, type ProjectModulesShape } from '@systemfsoftware/project-modules'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

const makeProjectModules = (projectDir: string): ProjectModulesShape => {
  const nodeModule = process.getBuiltinModule('node:module')
  const nodePath = process.getBuiltinModule('node:path')
  const nodeUrl = process.getBuiltinModule('node:url')
  const requireFromProject = nodeModule.createRequire(
    nodeUrl.pathToFileURL(nodePath.resolve(projectDir, 'package.json')),
  )
  return {
    resolve: (specifier) =>
      Effect.try({
        try: () => requireFromProject.resolve(specifier),
        catch: () => new ModuleNotFound({ specifier, projectDir }),
      }),
    import: (specifier) =>
      Effect.tryPromise({
        try: () => import(nodeUrl.pathToFileURL(requireFromProject.resolve(specifier)).href),
        catch: () => new ModuleNotFound({ specifier, projectDir }),
      }),
  }
}

/**
 * The Node implementation of {@link ProjectModules}, resolving specifiers from
 * `projectDir` exactly as a module evaluated there would.
 *
 * `projectDir` is resolved to an absolute path, so a relative value is read
 * against the process working directory.
 *
 * @param projectDir the directory whose module tree resolves the specifiers
 * @since 0.1.0
 */
export const ProjectModulesLive = (projectDir: string): Layer.Layer<ProjectModules> =>
  Layer.succeed(ProjectModules, makeProjectModules(projectDir))

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { expect, it } = await import('@effect/vitest')

  const modules = makeProjectModules(import.meta.dirname)

  it.effect('Should_ResolveADependencyOfTheAdapter_When_TheSpecifierExists', () =>
    Effect.gen(function*() {
      const manifestPath = yield* modules.resolve('effect/package.json')
      expect(manifestPath.endsWith('effect/package.json')).toBe(true)
    }))

  it.effect('Should_ImportADependencyOfTheAdapter_When_TheSpecifierExists', () =>
    Effect.gen(function*() {
      const imported = yield* modules.import('effect/package.json')
      expect(typeof imported === 'object' && imported !== null).toBe(true)
    }))

  it.effect('Should_FailWithModuleNotFound_When_TheSpecifierIsUnknown', () =>
    Effect.gen(function*() {
      const result = yield* modules.resolve('definitely-not-a-package-anywhere-xyz').pipe(Effect.result)
      expect(result._tag).toBe('Failure')
    }))
}
