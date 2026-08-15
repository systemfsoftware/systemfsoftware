/**
 * `src/internal/hook-session.kernel.ts`, as a term.
 *
 * A cell whose entire content is interfaces, which is the cleanest case for a kernel: a type is a
 * declaration with nothing to compute, so there is no function body for the language to fail to
 * express. Two details needed care. `isError?: boolean | undefined` is spelled with the
 * `orUndefined` member flag because the repo runs `exactOptionalPropertyTypes`, under which
 * `?: boolean` and `?: boolean | undefined` are different types and different texts. And
 * `InputEvent['source']` reads a type off an imported type by key, which is the `indexed` node —
 * the string index renders quoted, as the author wrote it.
 */
import { kernel, nothing } from '../../../../../scripts/tools/cell.ts'
import { t } from '../../../../../scripts/tools/term.ts'

const program = kernel({
  imports: [
    { module: '@oh-my-pi/pi-coding-agent', types: ['InputEvent'], typeOnly: true, requires: nothing },
  ],
  declarations: [
    {
      kind: 'interface',
      name: 'HookSession',
      doc: [
        'The slice of the harness these operations actually depend on. Narrowing here',
        'keeps the executor off the full `ExtensionContext` union surface and lets a',
        'caller — production or test — supply exactly what is used, with no cast.',
      ],
      members: [
        { name: 'cwd', type: t.string },
        {
          name: 'sessionManager',
          type: t.object([{ name: 'getSessionId', type: { fn: { params: [], returns: t.string } } }]),
        },
        {
          name: 'ui',
          type: t.object([{
            name: 'notify',
            type: {
              fn: {
                params: [
                  { name: 'message', type: t.string },
                  {
                    name: 'type',
                    type: t.union(t.literal('info'), t.literal('warning'), t.literal('error')),
                    optional: true,
                  },
                ],
                returns: t.void,
              },
            },
          }]),
        },
      ],
    },
    {
      kind: 'interface',
      name: 'HookToolCall',
      members: [
        { name: 'toolName', type: t.string },
        { name: 'toolCallId', type: t.string },
        {
          name: 'input',
          type: t.ref('object'),
          doc: ['The harness types this per tool, so it is decoded rather than asserted.'],
        },
      ],
    },
    {
      kind: 'interface',
      name: 'HookToolResult',
      extends: ['HookToolCall'],
      members: [
        { name: 'content', type: t.unknown },
        { name: 'isError', type: t.boolean, optional: true, orUndefined: true },
      ],
    },
    {
      kind: 'interface',
      name: 'HookPrompt',
      members: [
        { name: 'text', type: t.string },
        { name: 'source', type: { indexed: { of: t.ref('InputEvent'), index: 'source' } } },
        { name: 'images', type: { indexed: { of: t.ref('InputEvent'), index: 'images' } }, optional: true },
      ],
    },
  ],
})

export default program
