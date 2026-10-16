# Constitution

Read every law by its purpose: where its words and its harm part ways, the harm decides.

## Model the domain

```yaml
- id: CONST-D1
  law: Close your types so an illegal value cannot be constructed.
  why: A value the type could have refused reaches runtime, and every check downstream trusts it.
  example:
    wrong: A lock helper took a lock spec and a nullable adapter, so a spec that required the lock, paired with no adapter, ran its body unlocked.
    right: One union of the valid spec-and-adapter pairs made the unlocked case impossible to construct.
- id: CONST-D2
  law: Give every distinct failure its own tagged variant.
  why: Callers cannot branch on the real failure, and distinct errors collapse into one case.
  example:
    wrong: Generator exhaustion and a real counterexample both became one "refuted" error built from a placeholder, so a property that never ran read as refuted.
    right: Exhaustion is its own tagged error, and a refutation cannot be built without a real counterexample.
- id: CONST-D4
  law: Model mutually exclusive states as a tagged union, one variant per state carrying only its own fields; keep a plain nullable for a value absent the same way in every state.
  why: A state machine hides in a record, and the compiler cannot reject an invalid mix of fields.
  example:
    wrong: "CheckerDecision { results, needsRetest }: the state is read off a field."
    right: CheckFinished | RetestRequired, the second variant produced by the decider's retest branch.
```

## Shape the code

```yaml
- id: CONST-B1
  law: Keep effects at the edges, as values.
  why: An effect inside a decision cannot be tested without the world it touches, and a defect hides at the seam.
  example:
    wrong: The config resolver read a file, decided, resolved the next specifier and recursed inside one async function.
    right: A pure step returns the next read as data, and a thin shell performs it.
- id: CONST-B4
  law: Let the shell import the core, and wire every implementation at one composition root; the core never imports the shell, a database, or a framework.
  why: A decision chained to infrastructure cannot be tested or replaced.
  example:
    wrong: A CLI adapter imported the Node standard-IO layer and provided it to itself, below the composition root.
    right: The adapter declares that it needs standard IO, and the composition root provides it.
- id: CONST-N1
  law: Organise code by what it does, and name every file and folder for its job; a name must answer "of what?".
  why: One change scatters across the tree, and a bucket named for a layer says nothing a reader can check.
  example:
    wrong: Packages were nested into role tiers (core, testing, lint) that grouped packages sharing nothing a reader could check.
    right: The tiers were reverted; folders name product families.
- id: CONST-N3
  law: Give each module one responsibility, and split it when its tests need elaborate setup.
  why: Nobody can reason about the whole module, and its tests grow brittle.
  example:
    wrong: One module held a config type, its text parser, a process-wide cache with a test-only reset, and the file read, so its tests needed a fake file system.
    right: It split into a schema, a translator and an executor that does the read, and each is tested on its own.
- id: CONST-S1
  law: Fix the root cause; when the design is wrong, restructure it.
  why: A patched symptom comes back.
  example:
    wrong: Every transaction rollback was mapped to a version conflict, so any bug in the transaction looked like a race and retries walked an order into a rollback the customer never earned.
    right: The duplicate check moved inside the serializable transaction, and only a real serialization failure retries.
- id: CONST-S2
  law: Justify every choice by these laws, never by the file next to it or a prior plan's wording.
  why: An unexamined default hardens into a rule, and each copy seeds the next.
  example:
    wrong: A planning session wrote an adapter's package name into law, and every later import and plan inherited the misnaming.
    right: Authority traces to the architecture; the package was renamed for what it does and the old name deleted in the same change.
- id: CONST-S4
  law: Treat every line as a liability; delete, unify, or make the bad state unconstructable before you add.
  why: The codebase only grows, and rot survives every patch.
  example:
    wrong: A suffix-keyed copy-paste rule fleet grew to 100 rules across 21 plugins; one plugin shipped five rules against zero files.
    right: The whole fleet was deleted in one change, thirteen plugin packages and about 31,000 lines.
```

## Prove it

```yaml
- id: CONST-T8
  law: Test the published surface with real inputs and outputs.
  why: A test that stops short of what ships stays green while the shipped artifact is broken.
  example:
    wrong: Tests imported the package's source, so it published with no built output and no consumer could import it.
    right: The package ships its build, and the pack check reads what each tarball contains.
- id: CONST-T10
  law: Take every expected value from an oracle the code under test did not produce - a spec literal, an independent fixture, a law between two views, or a second implementation.
  why: A test that compares the code with itself cannot fail when the code is wrong.
  example:
    wrong: A snapshot of 500 observed depths moved whenever the generator, the schema, or the seed moved.
    right: The snapshot kind was deleted rather than re-recorded.
- id: CONST-T3
  law: Make every test able to fail when the behaviour it names breaks.
  why: A suite that notices nothing certifies nothing, and a toothless test hides among the ones that work.
  example:
    wrong: Round-trip laws drew their inputs from the schema's own generator, so every widened pattern survived.
    right: Rejection properties whose inputs come from the domain contract killed the survivors.
- id: CONST-T12
  law: Decide what applies to code (which checks, tests and requirements) from what it is and does, never from its name or location.
  why: A rename or a move silently drops a requirement, or applies one where it does not belong, while everything stays green.
  example:
    wrong: Mutation targets were chosen by a path label; when fixtures moved, five were enrolled, one built to fail.
    right: A target is selected by what it is, a workspace package the lockfile declares.
```

## Finish

```yaml
- id: CONST-W1
  law: Deliver the whole accepted task; shrink it only with the requester's agreement.
  why: Half-finished work, and effort spent second-guessing intent.
  example:
    wrong: The offered shortcut was to drop packages that could not comply from the enrolled set.
    right: Every deciding package was enrolled; the one exception was named in the change for the author to rule on.
- id: CONST-E7
  law: Show evidence (a command that passed or a test that ran) before you call work done, and never edit, add, or weaken anything that grades your work.
  why: Work called done on no evidence ships broken, and whoever edits the grader reports the score they chose.
  example:
    wrong: One commit changed the law and flipped the gate that grades it.
    right: The next amendment shipped with the gate's behaviour untouched.
```
