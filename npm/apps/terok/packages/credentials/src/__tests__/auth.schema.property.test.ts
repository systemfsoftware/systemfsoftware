import { refutes } from '@systemfsoftware/effect-schema-law'
import { FastCheck as fc } from 'effect'
import { AuthEntry, AuthMethod } from '../auth.schema.js'

refutes(AuthMethod, {
  AuthMethodUnknown: fc.constant('sso'),
})

refutes(AuthEntry, {
  AuthEntryMissingMethods: fc.record({
    name: fc.string(),
    label: fc.string(),
    llmProvider: fc.string(),
  }),
  AuthEntryUnknownMethod: fc.record({
    name: fc.string(),
    label: fc.string(),
    llmProvider: fc.string(),
    methods: fc.array(fc.constant('basic'), { maxLength: 2 }),
  }),
})
