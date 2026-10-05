import { it } from '@systemfsoftware/vitest'
import { Result, Schema } from 'effect'
import { optIn } from '../optIn.js'
import { PassWithNoTests } from '../OptIn.schema.js'

const NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const OWNER_PATTERN = /^@[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const isReason = (reason: string): boolean => reason === reason.trim() && reason.length >= 10

const granted = PassWithNoTests.make({})

const acceptsName = (name: string): boolean =>
  Result.isSuccess(optIn({ name, owner: '@valid-owner', reason: 'a sufficiently long reason', grant: granted }))

const acceptsOwner = (owner: string): boolean =>
  Result.isSuccess(optIn({ name: 'valid-name', owner, reason: 'a sufficiently long reason', grant: granted }))

const acceptsReason = (reason: string): boolean =>
  Result.isSuccess(optIn({ name: 'valid-name', owner: '@valid-owner', reason, grant: granted }))

it.prop(
  '∀name_OptInName_≡Kebab',
  { of: [Schema.String], subject: acceptsName },
  (subject, [name]) => subject('valid-name') && subject(name) === NAME_PATTERN.test(name),
)

it.prop(
  '∀owner_Owner_≡Handle',
  { of: [Schema.String], subject: acceptsOwner },
  (subject, [owner]) => subject('@valid-owner') && subject(owner) === OWNER_PATTERN.test(owner),
)

it.prop(
  '∀reason_Reason_≡Length',
  { of: [Schema.String], subject: acceptsReason },
  (subject, [reason]) => subject('exactly ten') && subject(reason) === isReason(reason),
)
