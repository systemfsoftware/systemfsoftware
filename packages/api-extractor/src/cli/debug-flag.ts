import { Flag, GlobalFlag } from 'effect/unstable/cli'

export const DebugFlag = GlobalFlag.Setting('debug')({
  flag: Flag.Boolean('debug').pipe(
    Flag.withAlias('d'),
    Flag.withDescription('Show the full call stack if an error occurs while executing the tool'),
    Flag.withDefault(false),
  ),
})
