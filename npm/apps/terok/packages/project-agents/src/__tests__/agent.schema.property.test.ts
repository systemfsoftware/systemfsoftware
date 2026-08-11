import { refutes } from '@systemfsoftware/effect-schema-law'
import { FastCheck as fc } from 'effect'
import { AgentLabel, AgentName } from '../agent.schema.js'

refutes(AgentName, {
  AgentNameInvalid: fc.constantFrom('Claude', 'claude!', '-x', 'a b'),
})

refutes(AgentLabel, {
  AgentLabelEmpty: fc.constant(''),
})
