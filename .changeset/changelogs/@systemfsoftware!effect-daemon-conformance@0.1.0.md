## 0.1.0

### Minor Changes

- First release. `Conformance.prove(driver)` runs a catalogue of scripted supervision scenarios against a medium and against the fiber reference, and reports, per scenario, whether the two traces agree within the medium's declared reporting level and group-stop guarantee, naming the first entry where they diverge.

  A driver can declare a `ScenarioBudget` for a medium slower than in-memory fibers: the scenario deadline, a start-timeout floor, and `livenessTickMillis`, which widens the supervisor's liveness tick on both the medium and the reference so the two traces stay comparable.
