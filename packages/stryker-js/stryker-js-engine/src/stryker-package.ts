import { Schema as S } from 'effect'

import pkgJson from '../package.json' with { type: 'json' }

import { PackageJsonSchema } from './stryker-package.schema.js'

const rawPackageJson: unknown = pkgJson
const pkg = S.decodeUnknownSync(PackageJsonSchema)(rawPackageJson)

export const strykerVersion = pkg.version
