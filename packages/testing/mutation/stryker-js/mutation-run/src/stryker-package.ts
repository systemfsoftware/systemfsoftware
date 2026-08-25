import fs from 'fs'
import { fileURLToPath, URL } from 'url'

import * as S from 'effect/Schema'
import { deepFreeze } from './config/config-freeze.js'

import { PackageJsonSchema } from './stryker-package.schema.js'

const rawPackageJson: unknown = JSON.parse(
  fs.readFileSync(
    fileURLToPath(new URL('../package.json', import.meta.url)),
    'utf-8',
  ),
)
const pkg = deepFreeze(S.decodeUnknownSync(PackageJsonSchema)(rawPackageJson))

export const strykerVersion = pkg.version
export const strykerEngines = pkg.engines
