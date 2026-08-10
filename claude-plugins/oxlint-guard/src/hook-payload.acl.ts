import * as ParseResult from 'effect/ParseResult'
import * as S from 'effect/Schema'
import { EditCommand, EditToolName } from './edit-command.schema.js'
import { HookPayload } from './hook-payload.shape.js'

const editedPath = (toolInput: Record<string, unknown> | undefined): string | undefined => {
  const value = toolInput?.['file_path']
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export const HookPayloadToEditCommand = S.transformOrFail(HookPayload, EditCommand, {
  strict: true,
  decode: (payload, _options, ast) => {
    const filePath = editedPath(payload.tool_input)
    return S.is(EditToolName)(payload.tool_name) && filePath !== undefined
      ? ParseResult.succeed<S.Schema.Encoded<typeof EditCommand>>({
        _tag: 'EditCommand',
        toolName: payload.tool_name,
        filePath,
        toolInput: payload.tool_input ?? {},
      })
      : ParseResult.fail(
        new ParseResult.Type(ast, payload, 'not an edit tool call carrying a non-empty tool_input.file_path'),
      )
  },
  encode: (command, _options, ast) =>
    ParseResult.fail(new ParseResult.Forbidden(ast, command, 'EditCommand is never encoded to a hook payload')),
})
