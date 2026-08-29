/// <reference types="node" />

import { builtinModules } from 'node:module'

/**
 * First-party package-name validation — the documented npm name rules with the
 * exact `errors`/`warnings` split `validate-npm-package-name@5.0.1` produces,
 * so the spec parser's acceptance boundary is unchanged: only `errors` block a
 * spec, `warnings` are the rules npm no longer enforces on existing packages.
 * @internal
 */
const blacklistedNames = ['node_modules', 'favicon.ico']
const specialCharacters = /[~'!()*]/
const scopedPackagePattern = /^(?:@([^/]+?)[/])?([^/]+?)$/

/**
 * The npm name rules' verdict: `errors` block a spec, `warnings` do not.
 * @internal
 */
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

  // Warnings name what npm used to allow and no longer recommends.
  if (builtinModules.includes(lowered)) warnings.push(`${name} is a core module name`)
  if (name.length > 214) warnings.push('name can no longer contain more than 214 characters')
  if (lowered !== name) warnings.push('name can no longer contain capital letters')
  if (specialCharacters.test(name.split('/').slice(-1)[0])) {
    warnings.push('name can no longer contain special characters ("~\'!()*")')
  }

  if (encodeURIComponent(name) !== name) {
    // Maybe it's a scoped package name, like @user/package
    const scoped = name.match(scopedPackagePattern)
    const bothPartsUrlFriendly = scoped !== null &&
      scoped[1] !== undefined && encodeURIComponent(scoped[1]) === scoped[1] &&
      scoped[2] !== undefined && encodeURIComponent(scoped[2]) === scoped[2]
    if (!bothPartsUrlFriendly) errors.push('name can only contain URL-friendly characters')
  }

  return { errors, warnings }
}
