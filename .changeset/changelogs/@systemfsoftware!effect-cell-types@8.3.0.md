## 8.3.0

### Minor Changes

- Cells are pipeable: every cell value composes through the instance method as well as the module duals. New arrows `mapError`, `orElse`, and `tap` recover over and observe the infrastructure error channel only, `flatMap` threads the response with the input channel fixed, `zipWith` combines two cells over one input, `match` folds the run outcome into a cell whose error channel is `never`, and `andThen` gains a function overload that feeds the response to the next cell as its input. New constructors `succeed`, `fail`, `fromEffect`, `suspend`, and `id` lift constants, failures, effects, and deferred cells into arrows. The Do chain `Do`, `bind`, `bindTo`, and `let` composes cells as do-notation over the accumulated record.
