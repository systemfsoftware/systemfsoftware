import { generate } from '../babel/babel-generator.js'
import { type TSAst, type TsxAst } from '../syntax/index.js'

import { type Printer } from './index.js'

export const print: Printer<TSAst | TsxAst> = (file) => {
  return generate(file.root, {
    decoratorsBeforeExport: true,
    sourceMaps: false,
  }).code
}
