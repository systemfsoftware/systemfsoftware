/**
 * The template and construction nodes, checked at the type level.
 *
 * Each block below is a hole the two new nodes could have left open. The type-level ones are
 * `@ts-expect-error`, so this file failing to typecheck means a refusal stopped refusing; the runtime
 * ones live in `template-new.run.ts`, because a rejection the compiler makes cannot be observed by
 * reading a type.
 */
import { construct, constructIn, kernel, lit, nothing, tpl } from '../../../scripts/tools/cell.ts'

// ---------------------------------------------------------------- accepted

/** A template over pure holes requires nothing, so a kernel takes it. */
export const accepted = kernel({
  imports: [],
  declarations: [
    { name: 'greeting', term: tpl(['hello ', '!'], lit('world')) },
    { name: 'empty', term: tpl(['no holes here']) },
    { name: 'collection', term: construct('Map') },
    { name: 'message', term: construct('Error', lit('boom')) },
  ],
})

// ---------------------------------------------------------------- refused

/** `new Date()` reads the clock. It is not in the vetted set, and the call is where that lands. */
// @ts-expect-error 'Date' is not a PureConstructor
export const clock = construct('Date')

/** Neither is a foreign class, however inert it looks — nothing vetted it. */
// @ts-expect-error 'ApplyProfileDecision' is not a PureConstructor
export const foreign = construct('ApplyProfileDecision')

/**
 * An imported constructor is admitted by its import's stated requirement, and a kernel takes it.
 *
 * This is the case that matters for the population: `new StepError(…)`, `new AST.Refinement(…)` and
 * `new Cause.TimeoutException(…)` all appear in shipped kernel cells, and none of them is a global.
 */
export const imported = kernel({
  imports: [
    { module: 'effect/Cause', namespace: 'Cause', requires: nothing },
    { module: './step-error.kernel.js', values: ['StepError'], requires: nothing },
  ],
  declarations: [
    { name: 'timeout', term: constructIn('Cause.TimeoutException', lit('too slow')) },
    { name: 'failure', term: constructIn('StepError', lit('nope')) },
  ],
})

/**
 * `constructIn` takes any name, because the scope check is the compiler's and cannot be a type.
 *
 * The type therefore accepts this; `template-new.run.ts` is where the unscoped name is refused.
 */
export const unscoped = constructIn('NotDeclaredHere')
