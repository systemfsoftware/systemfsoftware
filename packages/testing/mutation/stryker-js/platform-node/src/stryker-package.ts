import * as S from 'effect/Schema'
import pkgJson from '../package.json' with { type: 'json' }
import { deepFreeze } from './Config.js'

import { PackageJsonSchema } from './stryker-package.schema.js'

const rawPackageJson: unknown = pkgJson
const pkg = deepFreeze(S.decodeUnknownSync(PackageJsonSchema)(rawPackageJson))

export const strykerVersion = pkg.version
export const strykerEngines = pkg.engines
