---
"@systemfsoftware/effect-atom": major
---

The result and atom constructors no longer treat a lone options-looking object as a call for options, so `Result.success({})`, `Result.fail({})` and `Atom.make({})` now build a result or atom holding that object instead of returning a curried function. The option-taking forms moved to required-options variants: `Result.success(value, options)` is now `Result.successWith(value, options)` (also `Result.successWith(options)(value)`), `Result.fail(error, options)` is now `Result.failWith(error, options)`, and `Atom.make(x, options)` / `Atom.makeRead(x, options)` are now `Atom.makeWith(x, options)` / `Atom.makeReadWith(x, options)`, each also callable data-last as `Atom.makeWith(options)(x)`. One-argument calls keep working; the options-first `Atom.make(options)(x)` form is gone.
