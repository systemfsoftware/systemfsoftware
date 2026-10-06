import { Schema } from 'effect'

export class UnitRollback extends Schema.TaggedError<UnitRollback>()('UnitRollback', {}) {
  override get message(): string {
    return 'the unit of work rolled its transaction back'
  }
}
