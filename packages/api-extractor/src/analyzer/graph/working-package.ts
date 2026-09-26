import type * as ts from 'typescript'

import type { INodePackageJson } from './package-index.js'

export interface IWorkingPackageOptions {
  readonly packageFolder: string
  readonly packageJson: INodePackageJson
  readonly entryPointSourceFile: ts.SourceFile
}

export interface WorkingPackage {
  readonly packageFolder: string
  readonly packageJson: INodePackageJson
  readonly entryPointSourceFile: ts.SourceFile
  readonly name: string
}

export const makeWorkingPackage = (options: IWorkingPackageOptions): WorkingPackage => ({
  packageFolder: options.packageFolder,
  packageJson: options.packageJson,
  entryPointSourceFile: options.entryPointSourceFile,
  name: options.packageJson.name ?? '',
})
