import { dual } from 'effect/Function'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import { Flag, GlobalFlag } from 'effect/unstable/cli'

/**
 * The root `--debug` / `-d` global flag, mirroring upstream's command-line parser flag. It is a
 * `GlobalFlag.Setting` so a handler reads the parsed value with `yield* DebugFlag`; it carries a
 * default so an omitted flag supplies `false` rather than failing the parse.
 */
export const DebugFlag = GlobalFlag.Setting('debug')({
  flag: Flag.Boolean('debug').pipe(
    Flag.withAlias('d'),
    Flag.withDescription('Show the full call stack if an error occurs while executing the tool'),
    Flag.withDefault(false),
  ),
})

const hasStack = (value: unknown): value is { readonly stack: string } =>
  Predicate.hasProperty(value, 'stack') && Predicate.isString(value.stack)

export const failureTextOf: {
  (debug: boolean): (failure: { readonly message: string }) => string
  (failure: { readonly message: string }, debug: boolean): string
} = dual(2, (failure: { readonly message: string }, debug: boolean): string =>
  Option.some(failure).pipe(
    Option.filter(() => debug),
    Option.filter(hasStack),
    Option.match({ onNone: () => failure.message, onSome: (traced) => traced.stack }),
  ))
