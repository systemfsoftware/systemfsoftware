import { Package } from '../../src/CreatePackage.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function posixJoin(base: string, relative: string): string {
  return relative.startsWith('/') ? relative : `${base}/${relative}`
}

export function createTestPackage(
  files: Record<string, string>,
  packageName = 'test',
  packageVersion = '1.0.0',
): Package {
  const packageFiles: Record<string, string> = {}
  for (const [name, content] of Object.entries(files)) {
    if (name.startsWith('/')) {
      assert(name.startsWith(`/node_modules/${packageName}/`), `Unexpected absolute fixture path: ${name}`)
      packageFiles[name] = content
    } else {
      packageFiles[posixJoin(`/node_modules/${packageName}`, name)] = content
    }
  }

  const pkg = new Package(packageFiles, packageName, packageVersion)
  assert(pkg.fileExists(`/node_modules/${packageName}/package.json`), 'Must contain package.json')
  return pkg
}
