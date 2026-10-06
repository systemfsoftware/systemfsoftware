import { Schema } from 'effect'
import { StateId } from './TransitionDiagram.schema.js'

export class DiagramShapeInvalid extends Schema.TaggedError<DiagramShapeInvalid>()('DiagramShapeInvalid', {
  detail: Schema.String,
}) {
  override get message(): string {
    return `not a transition diagram: ${this.detail}`
  }
}

export class DuplicateStateId extends Schema.TaggedError<DuplicateStateId>()('DuplicateStateId', {
  id: StateId,
}) {
  override get message(): string {
    return `duplicate state id: ${this.id}`
  }
}

export class DanglingTransitionSource extends Schema.TaggedError<DanglingTransitionSource>()(
  'DanglingTransitionSource',
  {
    from: StateId,
    to: StateId,
  },
) {
  override get message(): string {
    return `transition from an undeclared state: ${this.from} -> ${this.to}`
  }
}

export class DanglingTransitionTarget extends Schema.TaggedError<DanglingTransitionTarget>()(
  'DanglingTransitionTarget',
  {
    from: StateId,
    to: StateId,
  },
) {
  override get message(): string {
    return `transition to an undeclared state: ${this.from} -> ${this.to}`
  }
}

export class MissingInitialState extends Schema.TaggedError<MissingInitialState>()('MissingInitialState', {}) {
  override get message(): string {
    return 'no state of kind initial'
  }
}
