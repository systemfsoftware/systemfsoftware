## 0.2.0

### Minor Changes

- The generated obligation scan now carries its own deadline instead of borrowing your suite's.

  The scan's cost grows with the number of obligations your exported schemas reach, and it is
  CPU-bound, so on a busy machine it takes far longer than the same scan on an idle one. Until now
  the only way to give it room was to widen the timeout for every test in the package, which meant
  a genuinely hung test of your own also got the wider budget.

  The deadline defaults to ten minutes and rides the generated test itself, so your own timeout
  settings are free to describe your own tests again. Pass `timeoutMs` to choose a different one.
