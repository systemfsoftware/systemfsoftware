import type { McpExtension, McpExtensionReply } from '@systemfsoftware/effect-contract/mcp'
import { Clock, Context, DateTime, Effect, Match, Option, Schema } from 'effect'
import { McpSchema, McpServer } from 'effect/ai'

export const TASKS_EXTENSION_ID = 'io.modelcontextprotocol/tasks'

const TASK_TTL_MS = 3_600_000
const POLL_INTERVAL_MS = 500
const MISSING_REQUIRED_CLIENT_CAPABILITY = -32021
const INVALID_PARAMS = -32602
const PROTOCOL_ERROR = { code: -32603, message: 'the job failed at the protocol level' }
const TOOL_ERROR_TEXT = 'the job failed while running'

type Server = McpServer.McpServer['Service']
type TaskStatus = 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled'
type TaskGate = 'deadline' | 'inputs'

interface TaskRecord {
  readonly id: string
  readonly createdAt: number
  readonly gate: TaskGate
  readonly deadline: number
  readonly toolError: boolean
  readonly protocolError: boolean
  readonly inputs: Readonly<Record<string, Schema.JsonObject>>
  readonly responses: Record<string, Schema.JsonObject>
  readonly text: (task: TaskRecord) => string
  cancelled: boolean
}

interface ExtensionRequestLike {
  readonly method: string
  readonly params: Option.Option<Schema.JsonObject>
  readonly clientCapabilities: Option.Option<Schema.JsonObject>
}

let taskCounter = 0
const tasks = new Map<string, TaskRecord>()

const objectOf = (value: Schema.Json): Option.Option<Schema.JsonObject> =>
  Schema.decodeUnknownOption(Schema.JsonObject)(value)

const textBlock = (value: string): Schema.JsonObject => ({ type: 'text', text: value })

const isoOf = (millis: number): string => DateTime.formatIso(DateTime.makeUnsafe(millis))

const merged = (left: Schema.JsonObject, right: Schema.JsonObject): Schema.JsonObject =>
  Object.fromEntries([...Object.entries(left), ...Object.entries(right)])

const stringFieldOf = (object: Schema.JsonObject, key: string): Option.Option<string> =>
  Schema.decodeUnknownOption(Schema.String)(object[key] ?? null)

const pendingInputKeys = (task: TaskRecord): ReadonlyArray<string> =>
  Object.keys(task.inputs).filter((key) => task.responses[key] === undefined)

const pendingRequests = (task: TaskRecord): Schema.JsonObject =>
  Object.fromEntries(
    pendingInputKeys(task).flatMap((key) => {
      const request = task.inputs[key]
      return request === undefined ? [] : [[key, request] as const]
    }),
  )

const terminalStatus = (task: TaskRecord): TaskStatus =>
  Match.value(task.protocolError).pipe(
    Match.when(true, (): TaskStatus => 'failed'),
    Match.orElse((): TaskStatus => 'completed'),
  )

const gateStatus = (task: TaskRecord, now: number): TaskStatus =>
  Match.value(task.gate).pipe(
    Match.when('inputs', () => (pendingInputKeys(task).length === 0 ? 'completed' : 'input_required')),
    Match.orElse(() => (now >= task.deadline ? terminalStatus(task) : 'working')),
  )

const statusOf = (task: TaskRecord, now: number): TaskStatus =>
  Match.value(task.cancelled).pipe(
    Match.when(true, (): TaskStatus => 'cancelled'),
    Match.orElse(() => gateStatus(task, now)),
  )

const completedResult = (task: TaskRecord): Schema.JsonObject =>
  Match.value(task.toolError).pipe(
    Match.when(true, (): Schema.JsonObject => ({ content: [textBlock(TOOL_ERROR_TEXT)], isError: true })),
    Match.orElse((): Schema.JsonObject => ({ content: [textBlock(task.text(task))] })),
  )

const statusFields = (task: TaskRecord, status: TaskStatus): Schema.JsonObject =>
  Match.value(status).pipe(
    Match.when('completed', (): Schema.JsonObject => ({ result: completedResult(task) })),
    Match.when('failed', (): Schema.JsonObject => ({ error: PROTOCOL_ERROR })),
    Match.when('input_required', (): Schema.JsonObject => ({ inputRequests: pendingRequests(task) })),
    Match.orElse((): Schema.JsonObject => ({})),
  )

const taskFields = (task: TaskRecord, now: number): Schema.JsonObject => ({
  taskId: task.id,
  status: statusOf(task, now),
  createdAt: isoOf(task.createdAt),
  lastUpdatedAt: isoOf(now),
  ttlMs: TASK_TTL_MS,
  pollIntervalMs: POLL_INTERVAL_MS,
})

const taskEnvelopeOf = (task: TaskRecord, now: number): Schema.JsonObject =>
  merged({ resultType: 'task' }, taskFields(task, now))

const detailedTaskOf = (task: TaskRecord, now: number): Schema.JsonObject =>
  merged({ resultType: 'complete' }, merged(taskFields(task, now), statusFields(task, statusOf(task, now))))

interface TaskSeed {
  readonly gate: TaskGate
  readonly afterMs: number
  readonly toolError?: boolean | undefined
  readonly protocolError?: boolean | undefined
  readonly inputs?: Readonly<Record<string, Schema.JsonObject>> | undefined
  readonly responses?: Readonly<Record<string, Schema.JsonObject>> | undefined
  readonly text: (task: TaskRecord) => string
}

const startTask = (seed: TaskSeed, now: number): TaskRecord => {
  taskCounter += 1
  const task: TaskRecord = {
    id: `task-${taskCounter}`,
    createdAt: now,
    gate: seed.gate,
    deadline: now + seed.afterMs,
    toolError: seed.toolError === true,
    protocolError: seed.protocolError === true,
    inputs: seed.inputs ?? {},
    responses: Object.assign({}, seed.responses),
    text: seed.text,
    cancelled: false,
  }
  tasks.set(task.id, task)
  return task
}

const taskOfId = (taskId: string): Option.Option<TaskRecord> => Option.fromUndefinedOr(tasks.get(taskId))

const responseName = (task: TaskRecord): string =>
  Option.getOrElse(
    Option.flatMap(
      Option.fromUndefinedOr(task.responses['user_name']),
      (response) =>
        Option.flatMap(Option.fromUndefinedOr(response['content']), objectOf).pipe(
          Option.flatMap((content) => stringFieldOf(content, 'name')),
        ),
    ),
    () => 'friend',
  )

const argumentOf = (args: Option.Option<Schema.JsonObject>, key: string, fallback: string): string =>
  Option.getOrElse(Option.flatMap(args, (value) => stringFieldOf(value, key)), () => fallback)

const numberOf = (args: Option.Option<Schema.JsonObject>, key: string, fallback: number): number =>
  Option.getOrElse(
    Option.flatMap(args, (value) => Schema.decodeUnknownOption(Schema.Finite)(value[key] ?? null)),
    () => fallback,
  )

/** A tool that is dispatched as a task once the client declares the extension. */
export interface TaskTool {
  readonly name: string
  readonly description: string
  readonly inputSchema: McpSchema.ToolJson
  readonly taskSupport: 'never' | 'optional' | 'required'
  readonly mrtrFirst?: boolean | undefined
  readonly syncText: (args: Option.Option<Schema.JsonObject>) => string
  readonly seed: (args: Option.Option<Schema.JsonObject>) => TaskSeed
}

const emptySchema: McpSchema.ToolJson = { type: 'object', properties: {} }

const objectSchema = (properties: Readonly<Record<string, Schema.JsonObject>>): McpSchema.ToolJson => ({
  type: 'object',
  properties,
})

const elicitationRequest = (message: string, property: string, type: 'string' | 'boolean'): Schema.JsonObject => ({
  method: 'elicitation/create',
  params: {
    message,
    requestedSchema: { type: 'object', properties: { [property]: { type } } },
  },
})

const greetTool: TaskTool = {
  name: 'greet',
  description: 'Sync-only greeting tool',
  inputSchema: objectSchema({ name: { type: 'string' } }),
  taskSupport: 'never',
  syncText: (args) => `Hello, ${argumentOf(args, 'name', 'World')}!`,
  seed: (args) => ({
    gate: 'deadline',
    afterMs: 0,
    text: (task) => `Hello, ${argumentOf(args, 'name', 'World')} as ${task.id}`,
  }),
}

export const taskTools: ReadonlyArray<TaskTool> = [
  {
    name: 'slow_compute',
    description: 'Task-supporting tool that sleeps for the requested number of seconds',
    inputSchema: objectSchema({ seconds: { type: 'number' }, label: { type: 'string' } }),
    taskSupport: 'optional',
    syncText: (args) => `Computed ${argumentOf(args, 'label', 'job')} synchronously`,
    seed: (args) => ({
      gate: 'deadline',
      afterMs: numberOf(args, 'seconds', 1) * 1_000,
      text: (task) => `Computed ${argumentOf(args, 'label', 'job')} as ${task.id}`,
    }),
  },
  {
    name: 'failing_job',
    description: 'TaskSupport=required tool that reports a tool execution error',
    inputSchema: emptySchema,
    taskSupport: 'required',
    syncText: () => TOOL_ERROR_TEXT,
    seed: () => ({ gate: 'deadline', afterMs: 1_000, toolError: true, text: () => TOOL_ERROR_TEXT }),
  },
  {
    name: 'protocol_error_job',
    description: 'Task-supporting tool that fails at the protocol level',
    inputSchema: emptySchema,
    taskSupport: 'optional',
    syncText: () => 'started',
    seed: () => ({ gate: 'deadline', afterMs: 1_000, protocolError: true, text: () => '' }),
  },
  {
    name: 'confirm_delete',
    description: 'Task-supporting tool that asks for confirmation before deleting a file',
    inputSchema: objectSchema({ filename: { type: 'string' } }),
    taskSupport: 'optional',
    syncText: (args) => `Deleted ${argumentOf(args, 'filename', 'file')}`,
    seed: (args) => ({
      gate: 'inputs',
      afterMs: 0,
      inputs: { confirm: elicitationRequest('Please confirm', 'ok', 'boolean') },
      text: (task) => `Deleted ${argumentOf(args, 'filename', 'file')} as ${task.id}`,
    }),
  },
  {
    name: 'multi_input',
    description: 'Task-supporting tool that asks two questions in parallel',
    inputSchema: emptySchema,
    taskSupport: 'optional',
    syncText: () => 'collected',
    seed: () => ({
      gate: 'inputs',
      afterMs: 0,
      inputs: {
        first: elicitationRequest('What is your name?', 'name', 'string'),
        second: elicitationRequest('What is your favourite colour?', 'colour', 'string'),
      },
      text: (task) => `Hello, ${responseName(task)}!`,
    }),
  },
  {
    name: 'test_tool_with_task',
    description: 'MRTR round first, then a task on the final round',
    inputSchema: emptySchema,
    taskSupport: 'optional',
    mrtrFirst: true,
    syncText: () => 'pending input',
    seed: () => ({
      gate: 'inputs',
      afterMs: 0,
      inputs: { user_name: elicitationRequest('What is your name?', 'name', 'string') },
      text: (task) => `Hello, ${responseName(task)}! The task finished for you.`,
    }),
  },
]

const toolOfName = (name: string): Option.Option<TaskTool> =>
  Option.fromUndefinedOr([greetTool, ...taskTools].find((tool) => tool.name === name))

const taskIdOf = (params: Option.Option<Schema.JsonObject>): Option.Option<string> =>
  Option.flatMap(params, (value) => stringFieldOf(value, 'taskId'))

const argumentsOf = (params: Option.Option<Schema.JsonObject>): Option.Option<Schema.JsonObject> =>
  Option.flatMap(params, (value) => Option.flatMap(Option.fromUndefinedOr(value['arguments']), objectOf))

const responsesOf = (
  params: Option.Option<Schema.JsonObject>,
): Option.Option<Readonly<Record<string, Schema.JsonObject>>> =>
  Option.flatMap(params, (value) =>
    Option.flatMap(
      Option.fromUndefinedOr(value['inputResponses']),
      Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.JsonObject)),
    ))

const negotiated = (capabilities: Option.Option<Schema.JsonObject>): boolean =>
  Option.exists(
    Option.flatMap(capabilities, (value) => Option.flatMap(Option.fromUndefinedOr(value['extensions']), objectOf)),
    (extensions) => extensions[TASKS_EXTENSION_ID] !== undefined,
  )

const errorReply = (
  code: number,
  message: string,
  data?: Schema.JsonObject,
): Effect.Effect<Option.Option<McpExtensionReply>> =>
  Effect.succeedSome(
    data === undefined
      ? { _tag: 'ExtensionError', code, message }
      : { _tag: 'ExtensionError', code, message, data },
  )

const unnegotiated = (): Effect.Effect<Option.Option<McpExtensionReply>> =>
  errorReply(MISSING_REQUIRED_CLIENT_CAPABILITY, `the client did not declare ${TASKS_EXTENSION_ID}`, {
    requiredCapabilities: { extensions: { [TASKS_EXTENSION_ID]: {} } },
  })

const declined: Effect.Effect<Option.Option<never>> = Effect.succeedNone

const taskEnvelopeReply = (
  tool: TaskTool,
  request: ExtensionRequestLike,
): Effect.Effect<Option.Option<McpExtensionReply>> =>
  Effect.map(Clock.currentTimeMillis, (now) =>
    Option.some({
      _tag: 'ExtensionResult',
      result: taskEnvelopeOf(
        startTask(
          {
            ...tool.seed(argumentsOf(request.params)),
            responses: Option.getOrElse(responsesOf(request.params), () => ({})),
          },
          now,
        ),
        now,
      ),
    }))

const hasInputResponses = (request: ExtensionRequestLike): boolean =>
  Option.exists(responsesOf(request.params), (responses) => Object.keys(responses).length > 0)

const claimToolOn = (request: ExtensionRequestLike, tool: TaskTool): Effect.Effect<Option.Option<McpExtensionReply>> =>
  Match.value(request).pipe(
    Match.when(() => tool.taskSupport === 'never', () => declined),
    Match.when(
      () => tool.taskSupport === 'required' && !negotiated(request.clientCapabilities),
      () => unnegotiated(),
    ),
    Match.when(() => !negotiated(request.clientCapabilities), () => declined),
    Match.when(() => tool.mrtrFirst === true && !hasInputResponses(request), () => declined),
    Match.orElse(() => taskEnvelopeReply(tool, request)),
  )

const claimTool = (request: ExtensionRequestLike, name: string): Effect.Effect<Option.Option<McpExtensionReply>> =>
  Option.match(toolOfName(name), {
    onNone: () => declined,
    onSome: (tool) => claimToolOn(request, tool),
  })

const withTask = (
  request: ExtensionRequestLike,
  handle: (task: TaskRecord, now: number) => McpExtensionReply,
): Effect.Effect<Option.Option<McpExtensionReply>> =>
  Match.value(negotiated(request.clientCapabilities)).pipe(
    Match.when(false, () => unnegotiated()),
    Match.orElse(() =>
      Option.match(taskIdOf(request.params), {
        onNone: () => errorReply(INVALID_PARAMS, 'taskId must be a string'),
        onSome: (taskId) =>
          Option.match(taskOfId(taskId), {
            onNone: () => errorReply(INVALID_PARAMS, `No task with id ${taskId}`),
            onSome: (task) => Effect.map(Clock.currentTimeMillis, (now) => Option.some(handle(task, now))),
          }),
      })
    ),
  )

const cancelledReply = (task: TaskRecord): McpExtensionReply => {
  task.cancelled = true
  return { _tag: 'ExtensionResult', result: { resultType: 'complete' } }
}

const resumedReply = (task: TaskRecord, params: Option.Option<Schema.JsonObject>): McpExtensionReply => {
  Object.assign(task.responses, Option.getOrElse(responsesOf(params), () => ({})))
  return { _tag: 'ExtensionResult', result: { resultType: 'complete' } }
}

const handleToolCall = (request: ExtensionRequestLike): Effect.Effect<Option.Option<McpExtensionReply>> =>
  Option.match(Option.flatMap(request.params, (value) => stringFieldOf(value, 'name')), {
    onNone: () => declined,
    onSome: (name) => claimTool(request, name),
  })

/**
 * The SEP-2663 surface: the declared capability, the `tasks/*` methods, and the
 * dispatch rule that turns a call to a task-supporting tool into a task.
 */
export const tasksExtension: McpExtension = {
  capability: { id: TASKS_EXTENSION_ID, settings: {} },
  handle: (request) =>
    Match.value(request.method).pipe(
      Match.when('tools/call', () => handleToolCall(request)),
      Match.when('tasks/get', () => withTask(request, (task, now) => resultReplyTask(task, now))),
      Match.when('tasks/cancel', () => withTask(request, cancelledReply)),
      Match.when('tasks/update', () => withTask(request, (task) => resumedReply(task, request.params))),
      Match.orElse(() => declined),
    ),
}

const resultReplyTask = (task: TaskRecord, now: number): McpExtensionReply => ({
  _tag: 'ExtensionResult',
  result: detailedTaskOf(task, now),
})

const syncCallResult = (tool: TaskTool, args: Option.Option<Schema.JsonObject>): McpSchema.CallToolResult =>
  Match.value(tool.taskSupport).pipe(
    Match.when(
      'required',
      () => new McpSchema.CallToolResult({ content: [{ type: 'text', text: tool.syncText(args) }], isError: true }),
    ),
    Match.orElse(() => new McpSchema.CallToolResult({ content: [{ type: 'text', text: tool.syncText(args) }] })),
  )

const elicitationInputRequest = (message: string): McpSchema.McpInputRequest => ({
  method: 'elicitation/create',
  params: {
    message,
    requestedSchema: { type: 'object', properties: { name: { type: 'string' } } },
  },
})

const nameOfResponse = (response: Schema.Json): string =>
  Option.getOrElse(
    Option.flatMap(objectOf(response), (fields) => Option.fromUndefinedOr(fields['content'])).pipe(
      Option.flatMap(objectOf),
      Option.flatMap((content) => stringFieldOf(content, 'name')),
    ),
    () => 'friend',
  )

const completedCall = (text: string): McpSchema.CallToolResult =>
  new McpSchema.CallToolResult({ content: [{ type: 'text', text }] })

const mrtrFirstCall = (): Effect.Effect<
  McpSchema.CallToolResult | McpSchema.InputRequired,
  never,
  McpSchema.McpRequestContext
> =>
  Effect.gen(function*() {
    const context = yield* McpSchema.McpRequestContext
    return yield* Option.match(Option.fromUndefinedOr(context.inputResponses?.['user_name']), {
      onNone: () =>
        Effect.succeed(
          new McpSchema.InputRequired({
            inputRequests: { user_name: elicitationInputRequest('What is your name?') },
          }),
        ),
      onSome: (response) => Effect.succeed(completedCall(`Hello, ${nameOfResponse(response)}!`)),
    })
  })

const callToolSync = (
  tool: TaskTool,
  payload: Schema.Json,
): Effect.Effect<McpSchema.CallToolResult | McpSchema.InputRequired, never, McpSchema.McpRequestContext> =>
  Match.value(tool.mrtrFirst === true).pipe(
    Match.when(true, () => mrtrFirstCall()),
    Match.orElse(() => Effect.succeed(syncCallResult(tool, objectOf(payload)))),
  )

/** Registers every task tool plus `greet`, so `tools/list` advertises them. */
export const registerTaskTools = (server: Server): Effect.Effect<void> =>
  Effect.forEach(
    [greetTool, ...taskTools],
    (tool) =>
      server.addTool({
        tool: new McpSchema.Tool({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }),
        annotations: Context.empty(),
        handle: (payload: Schema.Json) => callToolSync(tool, payload),
      }),
    { discard: true },
  )
