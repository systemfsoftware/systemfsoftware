import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'

import type { Message, ModelRequest } from '../model/model.schema.js'

export const redactMessage = (redact: (text: string) => string) => (message: Message): Message =>
  Match.valueTags(message, {
    UserMessage: (user): Message => ({
      ...user,
      content: Arr.map(user.content, (part) =>
        Match.valueTags(part, {
          TextPart: (text): typeof part => ({ ...text, text: redact(text.text) }),
          ImagePart: (image): typeof part => image,
        })),
    }),
    AssistantMessage: (assistant): Message => ({ ...assistant, text: redact(assistant.text) }),
    ToolMessage: (tool): Message => ({ ...tool, content: redact(tool.content) }),
  })

export const redactRequest = (redact: (text: string) => string) => (request: ModelRequest): ModelRequest => ({
  ...request,
  system: redact(request.system),
  messages: Arr.map(request.messages, redactMessage(redact)),
})
