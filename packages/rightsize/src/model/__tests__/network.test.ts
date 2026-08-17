/**
 * Rejection properties for the network alias charset — `[a-zA-Z0-9]` start,
 * then `[a-zA-Z0-9._-]*` (R12 alias-charset validation: docker's bridge and
 * an emulating backend's `/etc/hosts` rewrite both need a hostname-safe
 * alphabet). Generators draw the domain's complement: the empty name, a
 * leading separator, and a charset outsider spliced into an otherwise-valid
 * alias — the splice positions the illegal character inside the body rather
 * than at an edge where it could pass by luck.
 */
import { refutes } from '@systemfsoftware/effect-schema-law'
import { FastCheck as fc } from 'effect/testing'
import { NetworkAlias } from '../network.js'

/** A valid alias prefix — kept so the splice below positions the illegal character inside an otherwise-valid name. */
const aliasPrefix = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)

/** One character the alias charset refuses (the complement class). */
const aliasOutsider = fc.stringMatching(/^[^a-zA-Z0-9._-]$/)

refutes(NetworkAlias, {
  EmptyAlias: fc.constant(''),
  LeadingSeparator: fc.constantFrom('-x', '_x', '.x'),
  IllegalChar: fc.tuple(aliasPrefix, aliasOutsider, aliasPrefix).map(([head, out, tail]) => `${head}${out}${tail}`),
})
