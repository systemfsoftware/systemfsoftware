import { Schema } from 'effect'

export const TaskSplit = Schema.Literals(['dev', 'test'])
export type TaskSplit = typeof TaskSplit.Type

export class Task extends Schema.Class<Task>('Task')({
  id: Schema.NonEmptyString,
  text: Schema.String,
  split: TaskSplit,
  dimensions: Schema.Record(Schema.String, Schema.String),
}) {}

export class TaskSet extends Schema.Class<TaskSet>('TaskSet')({
  version: Schema.Literal(1),
  tasks: Schema.Array(Task),
}) {}
