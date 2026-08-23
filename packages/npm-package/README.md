# @systemfsoftware/npm-package

An npm package as an in-memory file tree. Build one from an authored file map, pack it to tarball bytes, and read one back — without touching the filesystem, spawning `npm pack`, or installing a compiler.

```bash
npm install @systemfsoftware/npm-package
```

## Build a package from a file map

`createPackage` takes a map of paths to file bodies and returns a `Package`. The map must contain a `package.json`. Relative paths land under `/node_modules/<name>/`; bodies may be text or bytes.

```ts
import { createPackage } from '@systemfsoftware/npm-package'

const pkg = createPackage({
  'package.json': JSON.stringify({ name: 'greeter', version: '1.0.0', main: './index.js' }),
  'index.js': 'module.exports.hi = () => "hi"',
  'index.d.ts': 'export declare const hi: () => string',
})

pkg.readFile('/node_modules/greeter/index.js')
pkg.listFiles()
```

A `Package` is a read-only view over its own file map: `readFile`, `tryReadFile`, `tryReadBytes`, `fileExists`, `directoryExists`, and `listFiles`. Overlaying one package on another returns a new `Package` whose colliding paths take the other's bodies, leaving both inputs untouched.

## Pack it to tarball bytes

`packPackage` produces gzipped ustar bytes in process — sorted entry names, zeroed mtime, and the `package/` prefix `npm pack` uses. `packTree` does the same directly from a file map when you have no `Package` in hand.

```ts
import { packPackage } from '@systemfsoftware/npm-package'

await Bun.write('greeter-1.0.0.tgz', packPackage(pkg))
```

Because the bytes are produced from the map you authored, packing runs no lifecycle scripts and never mutates a build output.

## Read one back

`createPackageFromTarballData` goes the other way: tarball bytes in, `Package` out. It reads the name and version from the archive's own `package.json` and re-roots every entry under `/node_modules/<name>/`.

```ts
import { createPackageFromTarballData } from '@systemfsoftware/npm-package'

const fromTarball = createPackageFromTarballData(await Bun.file('greeter-1.0.0.tgz').bytes())
fromTarball.packageName // 'greeter'
```

## Mount it as a filesystem

`toDirectoryJSON` projects the same tree to the directory map an in-memory filesystem accepts, so a tool that insists on real paths can run against an authored package.

```ts
import { toDirectoryJSON } from '@systemfsoftware/npm-package'

const files = toDirectoryJSON({ 'package.json': '{"name":"greeter","version":"1.0.0"}' })
```

## What this package does not do

It knows nothing about type resolution, `@types` companions, dependency graphs, or registries, and it declares no dependency on TypeScript. It models one package's files — not a `node_modules` tree, and not an install.

## License

Apache-2.0
