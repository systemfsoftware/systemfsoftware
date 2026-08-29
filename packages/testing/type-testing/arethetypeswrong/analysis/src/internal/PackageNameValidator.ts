/// <reference types="node" />

import { builtinModules } from 'node:module'

const blacklistedNames = ['node_modules', 'favicon.ico']
const specialCharacters = /[~'!()*]/
const scopedPackagePattern = /^(?:@([^/]+?)[/])?([^/]+?)$/

/** @internal */
export interface PackageNameValidation {
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
}

/** @internal */
export const validatePackageName = (name: string): PackageNameValidation => {
  const errors: string[] = []
  const warnings: string[] = []

  if (name.length === 0) errors.push('name length must be greater than zero')
  if (name.startsWith('.')) errors.push('name cannot start with a period')
  if (name.startsWith('_')) errors.push('name cannot start with an underscore')
  if (name.trim() !== name) errors.push('name cannot contain leading or trailing spaces')

  const lowered = name.toLowerCase()
  if (blacklistedNames.includes(lowered)) errors.push(`${lowered} is a blacklisted name`)

  if (builtinModules.includes(lowered)) warnings.push(`${name} is a core module name`)
  if (name.length > 214) warnings.push('name can no longer contain more than 214 characters')
  if (lowered !== name) warnings.push('name can no longer contain capital letters')
  if (specialCharacters.test(name.split('/').slice(-1)[0])) {
    warnings.push('name can no longer contain special characters ("~\'!()*")')
  }

  if (encodeURIComponent(name) !== name) {
    const scoped = name.match(scopedPackagePattern)
    const bothPartsUrlFriendly = scoped !== null &&
      scoped[1] !== undefined && encodeURIComponent(scoped[1]) === scoped[1] &&
      scoped[2] !== undefined && encodeURIComponent(scoped[2]) === scoped[2]
    if (!bothPartsUrlFriendly) errors.push('name can only contain URL-friendly characters')
  }

  return { errors, warnings }
}
