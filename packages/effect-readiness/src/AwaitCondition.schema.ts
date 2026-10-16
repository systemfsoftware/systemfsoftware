import { Schema } from 'effect'
import { Condition } from './Condition.schema.js'
import { ProbeTarget } from './ProbeTarget.schema.js'

export class AwaitCondition extends Schema.TaggedClass<AwaitCondition>()('AwaitCondition', {
  target: ProbeTarget,
  condition: Condition,
}) {}
