import type { Package } from '@systemfsoftware/npm-package'
import ts from 'typescript'

export function containsTypes(pkg: Package, directory = '/'): boolean {
  return pkg.listFiles(directory).some(ts.hasTSFileExtension)
}

export interface TypesCompanionInfo {
  readonly packageName: string
  readonly packageVersion: string
  readonly resolvedUrl?: string
}

export interface PackageWithCompanion {
  readonly pkg: Package
  readonly companion: TypesCompanionInfo
}

export function withTypesCompanion(pkg: Package, typesPkg: Package): PackageWithCompanion {
  return {
    pkg: pkg.withOverlay(typesPkg),
    companion: {
      packageName: typesPkg.packageName,
      packageVersion: typesPkg.packageVersion,
      resolvedUrl: typesPkg.resolvedUrl,
    },
  }
}

export function isPackageWithCompanion(value: unknown): value is PackageWithCompanion {
  return typeof value === 'object' && value !== null && 'pkg' in value && 'companion' in value
}
